#!/usr/bin/env node
// @ts-check
/**
 * Stamp the `## [Unreleased]` section of CHANGELOG.md into a versioned
 * section and emit a release-notes file containing just the released body.
 *
 * Pure logic is exposed via the `stamp` named export so it can be unit-tested
 * without filesystem access. The CLI entry point (executed when this file is
 * run directly) handles argument parsing and IO.
 *
 * Why this lives outside the workflow YAML:
 *   * the regex-driven rewrite is the highest-risk step in the release
 *     pipeline — every error here either corrupts the CHANGELOG on main or
 *     produces a Release with the wrong notes;
 *   * keeping it in its own file lets `stamp-changelog.test.mjs` exercise
 *     edge cases (empty Unreleased, EOF, duplicate version) on every PR via
 *     `node --test`, no CI required.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { argv, exit } from "node:process";
import { fileURLToPath } from "node:url";

const SECTION_HEADING_RE = /^## \[[^\]]+\]/m;
const UNRELEASED_HEADING_RE = /^## \[Unreleased\][^\n]*\n/m;

/**
 * Apply the stamp to a CHANGELOG body.
 *
 * @param {string} text     - Full contents of CHANGELOG.md
 * @param {string} version  - Version to stamp (without any tag prefix)
 * @param {string} today    - ISO date (YYYY-MM-DD) for the released section
 * @returns {{ changelog: string, notes: string }} New CHANGELOG and the
 *          extracted notes body (without the heading) for the GitHub Release.
 * @throws  if CHANGELOG has no `## [Unreleased]` heading or already contains
 *          a `## [<version>]` heading.
 */
export function stamp(text, version, today) {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("CHANGELOG content is empty.");
  }
  // Full SemVer 2.0.0 shape: MAJOR.MINOR.PATCH with optional `-prerelease`
  // and `+build` metadata. This catches both incomplete versions (`1`, `1.2`)
  // and the case where the caller forgot to strip the tag prefix
  // (`@agent-profiler/desktop@1.2.3`).
  // See https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
  const SEMVER_RE =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  if (!SEMVER_RE.test(version)) {
    throw new Error(
      `Refusing to stamp version '${version}': not a valid SemVer 2.0.0 string.`,
    );
  }

  const versionHeadingRe = new RegExp(
    `^## \\[${escapeRegExp(version)}\\]`,
    "m",
  );
  if (versionHeadingRe.test(text)) {
    throw new Error(
      `CHANGELOG.md already has a section for version ${version}.`,
    );
  }

  const unreleasedMatch = UNRELEASED_HEADING_RE.exec(text);
  if (!unreleasedMatch) {
    throw new Error("CHANGELOG.md has no '## [Unreleased]' heading.");
  }

  // Body of the Unreleased section is everything from after its heading up
  // to (but not including) the next `## [` heading — or end of file.
  const bodyStart = unreleasedMatch.index + unreleasedMatch[0].length;
  const remainder = text.slice(bodyStart);
  const nextHeading = SECTION_HEADING_RE.exec(remainder);
  const bodyEnd =
    nextHeading === null ? text.length : bodyStart + nextHeading.index;

  const unreleasedBody = text.slice(bodyStart, bodyEnd);
  // Trim trailing blank lines from the released-section body so we don't
  // accumulate whitespace on every release.
  const releasedBody = unreleasedBody.replace(/\s+$/, "") + "\n";

  const scaffold = [
    "",
    "### Added",
    "",
    "### Changed",
    "",
    "### Fixed",
    "",
    "",
  ].join("\n");

  const versionHeading = `## [${version}] - ${today}\n`;

  const newChangelog =
    text.slice(0, bodyStart) +
    scaffold +
    versionHeading +
    releasedBody +
    text.slice(bodyEnd);

  // Notes body is the released section *without* its heading — that's what
  // softprops/action-gh-release will paste into the Release description.
  const notes = releasedBody.replace(/^\n+/, "").trimEnd() + "\n";

  return { changelog: newChangelog, notes };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function todayUtc() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseArgs(args) {
  const result = {
    version: "",
    changelog: "CHANGELOG.md",
    notesOut: "release-notes.md",
    today: "",
    dryRun: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      const v = args[i + 1];
      if (v === undefined) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return v;
    };
    switch (arg) {
      case "--version":
        result.version = next();
        break;
      case "--changelog":
        result.changelog = next();
        break;
      case "--notes-out":
        result.notesOut = next();
        break;
      case "--today":
        result.today = next();
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!result.version) {
    throw new Error("--version is required");
  }
  if (!result.today) {
    result.today = todayUtc();
  }
  return result;
}

function printHelp() {
  console.log(
    [
      "stamp-changelog --version <X.Y.Z> [options]",
      "",
      "Options:",
      "  --version <v>        Version to stamp (no tag prefix)",
      "  --changelog <path>   Path to CHANGELOG.md (default: CHANGELOG.md)",
      "  --notes-out <path>   Where to write release notes (default: release-notes.md)",
      "  --today <YYYY-MM-DD> Override date (default: today in UTC)",
      "  --dry-run            Validate the stamp; do not write any files",
    ].join("\n"),
  );
}

export function main(args) {
  let opts;
  try {
    opts = parseArgs(args);
  } catch (err) {
    console.error(`error: ${err.message}`);
    return 2;
  }

  const text = readFileSync(opts.changelog, "utf8");
  let result;
  try {
    result = stamp(text, opts.version, opts.today);
  } catch (err) {
    console.error(`error: ${err.message}`);
    return 1;
  }

  if (opts.dryRun) {
    console.log(
      `[dry-run] Would stamp ${opts.changelog} with version ${opts.version} (${opts.today})`,
    );
    console.log(
      `[dry-run] Would write ${result.notes.length} bytes of notes to ${opts.notesOut}`,
    );
    return 0;
  }

  writeFileSync(opts.changelog, result.changelog, "utf8");
  writeFileSync(opts.notesOut, result.notes, "utf8");
  console.log(
    `Stamped ${opts.changelog} for version ${opts.version} (${opts.today}); wrote notes to ${opts.notesOut}`,
  );
  return 0;
}

// CLI entry point: only run main() when this file is invoked directly.
if (import.meta.url === `file://${fileURLToPath(import.meta.url)}`) {
  // Node's import.meta.url check above won't always match on Windows; the
  // simpler/more reliable check is whether argv[1] resolves to this file.
}
const invokedDirectly =
  argv[1] !== undefined && fileURLToPath(import.meta.url) === argv[1];
if (invokedDirectly) {
  exit(main(argv.slice(2)));
}
