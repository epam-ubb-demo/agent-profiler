// @ts-check
/**
 * Unit tests for stamp-changelog.mjs.
 *
 * Runs under Node's built-in test runner — no dev dependencies, no CI
 * required. Execute locally with:
 *
 *     node --test tooling/release/stamp-changelog.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { stamp, main } from "./stamp-changelog.mjs";

const TODAY = "2025-01-15";

function fixture(unreleasedBody, trailing = "") {
  return [
    "# Changelog",
    "",
    "## [Unreleased]",
    unreleasedBody,
    trailing,
  ].join("\n");
}

test("stamp: captures Unreleased body into new versioned section", () => {
  const input = fixture(
    "\n### Added\n- new feature\n\n### Fixed\n- bug fix\n",
    "## [0.1.0] - 2024-12-01\n\n- initial release\n",
  );
  const { changelog, notes } = stamp(input, "0.2.0", TODAY);
  assert.match(changelog, /## \[Unreleased\]\n\n### Added\n\n### Changed\n/);
  assert.match(changelog, /## \[0\.2\.0\] - 2025-01-15\n/);
  assert.match(changelog, /## \[0\.2\.0\] - 2025-01-15\n\n### Added\n- new feature/);
  assert.match(changelog, /## \[0\.1\.0\] - 2024-12-01/);
  assert.match(notes, /### Added\n- new feature/);
  assert.match(notes, /### Fixed\n- bug fix/);
});

test("stamp: empty Unreleased section produces empty notes", () => {
  const input = fixture("", "## [0.1.0] - 2024-12-01\n- old\n");
  const { changelog, notes } = stamp(input, "0.2.0", TODAY);
  assert.match(changelog, /## \[0\.2\.0\] - 2025-01-15\n/);
  assert.equal(notes.trim(), "");
});

test("stamp: handles Unreleased at end of file", () => {
  const input = "# Changelog\n\n## [Unreleased]\n\n- pending change\n";
  const { changelog, notes } = stamp(input, "1.0.0", TODAY);
  assert.match(changelog, /## \[1\.0\.0\] - 2025-01-15\n\n- pending change/);
  assert.match(notes, /- pending change/);
});

test("stamp: throws when no Unreleased heading is present", () => {
  const input = "# Changelog\n\n## [0.1.0] - 2024-01-01\n- old\n";
  assert.throws(() => stamp(input, "0.2.0", TODAY), /no '## \[Unreleased\]'/);
});

test("stamp: throws when version section already exists", () => {
  const input = fixture("\n- something\n", "## [0.2.0] - 2024-12-01\n- old\n");
  assert.throws(() => stamp(input, "0.2.0", TODAY), /already has a section/);
});

test("stamp: rejects version that does not start with a digit", () => {
  const input = fixture("\n- x\n");
  assert.throws(
    () => stamp(input, "@agent-profiler/desktop@1.0.0", TODAY),
    /not a valid SemVer/,
  );
});

test("stamp: rejects malformed SemVer (missing minor/patch)", () => {
  const input = fixture("\n- x\n");
  assert.throws(() => stamp(input, "1", TODAY), /not a valid SemVer/);
  assert.throws(() => stamp(input, "1.2", TODAY), /not a valid SemVer/);
  assert.throws(() => stamp(input, "1.2.3.4", TODAY), /not a valid SemVer/);
});

test("stamp: pre-release versions are accepted", () => {
  const input = fixture("\n- x\n", "## [0.1.0] - 2024-01-01\n");
  const { changelog } = stamp(input, "1.0.0-rc.1", TODAY);
  assert.match(changelog, /## \[1\.0\.0-rc\.1\] - 2025-01-15/);
});

test("stamp: empty input throws", () => {
  assert.throws(() => stamp("", "1.0.0", TODAY), /empty/);
});

test("main: --dry-run does not write files", () => {
  const dir = mkdtempSync(join(tmpdir(), "stamp-"));
  try {
    const changelogPath = join(dir, "CHANGELOG.md");
    const notesPath = join(dir, "notes.md");
    const original = fixture("\n- feature\n");
    writeFileSync(changelogPath, original, "utf8");
    const code = main([
      "--version",
      "1.0.0",
      "--changelog",
      changelogPath,
      "--notes-out",
      notesPath,
      "--today",
      TODAY,
      "--dry-run",
    ]);
    assert.equal(code, 0);
    assert.equal(readFileSync(changelogPath, "utf8"), original);
    assert.throws(() => readFileSync(notesPath, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main: writes changelog and notes on success", () => {
  const dir = mkdtempSync(join(tmpdir(), "stamp-"));
  try {
    const changelogPath = join(dir, "CHANGELOG.md");
    const notesPath = join(dir, "notes.md");
    writeFileSync(changelogPath, fixture("\n- feature\n"), "utf8");
    const code = main([
      "--version",
      "1.0.0",
      "--changelog",
      changelogPath,
      "--notes-out",
      notesPath,
      "--today",
      TODAY,
    ]);
    assert.equal(code, 0);
    assert.match(readFileSync(changelogPath, "utf8"), /## \[1\.0\.0\] - 2025-01-15/);
    assert.match(readFileSync(notesPath, "utf8"), /- feature/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main: returns non-zero when stamp fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "stamp-"));
  try {
    const changelogPath = join(dir, "CHANGELOG.md");
    writeFileSync(changelogPath, "# no unreleased heading\n", "utf8");
    const code = main([
      "--version",
      "1.0.0",
      "--changelog",
      changelogPath,
      "--notes-out",
      join(dir, "notes.md"),
      "--today",
      TODAY,
    ]);
    assert.equal(code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main: missing --version returns 2", () => {
  const code = main([]);
  assert.equal(code, 2);
});
