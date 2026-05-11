#!/usr/bin/env python3
"""Validate that all local Copilot CLI sessions can be parsed for model metrics.

Mirrors the normalisation logic in packages/adapters-copilot-cli/src/normalise-model-metrics.ts
to verify all sessions are readable.  Run periodically or after parser changes.

Usage:
    python tooling/validate-sessions.py
    python tooling/validate-sessions.py --verbose
    python tooling/validate-sessions.py --path /custom/session-state/dir
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Safe coercion helpers (mirrors TypeScript safeInt / safeNumber)
# ---------------------------------------------------------------------------


def safe_int(value: Any, fallback: int = 0) -> int:
    """Coerce an unknown value to a non-negative integer, defaulting to *fallback*."""
    if value is None:
        return fallback
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(n):
        return fallback
    return round(n)


def safe_number(value: Any, fallback: float = 0.0) -> float:
    """Coerce an unknown value to a non-negative number, defaulting to *fallback*."""
    if value is None:
        return fallback
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(n) or n < 0:
        return fallback
    return n


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _is_plain_object(value: Any) -> bool:
    """Return True if *value* is a non-null, non-list dict."""
    return isinstance(value, dict)


def _first_not_none(*values: Any) -> Any:
    """Return the first argument that is not ``None`` (mirrors JS ``??`` chains)."""
    for v in values:
        if v is not None:
            return v
    return None


# ---------------------------------------------------------------------------
# Per-entry extraction (mirrors extractEntry in the TS normaliser)
# ---------------------------------------------------------------------------


def _extract_entry(model: str, raw: Any) -> dict[str, Any]:
    """Extract normalised metrics from a single raw model entry.

    *flat* is the entry itself; nested ``usage`` / ``requests`` sub-objects
    take precedence per-field when present.
    """
    flat = raw if _is_plain_object(raw) else {}

    usage_raw = flat.get("usage")
    usage: dict[str, Any] = usage_raw if _is_plain_object(usage_raw) else {}

    requests_raw = flat.get("requests")
    requests: dict[str, Any] = requests_raw if _is_plain_object(requests_raw) else {}

    return {
        "model": model,
        "inputTokens": safe_int(
            _first_not_none(usage.get("inputTokens"), flat.get("inputTokens"))
        ),
        "outputTokens": safe_int(
            _first_not_none(usage.get("outputTokens"), flat.get("outputTokens"))
        ),
        "cacheReadTokens": safe_int(
            _first_not_none(
                usage.get("cacheReadTokens"),
                usage.get("cacheReadInputTokens"),
                flat.get("cacheReadTokens"),
                flat.get("cacheReadInputTokens"),
            )
        ),
        "cacheWriteTokens": safe_int(
            _first_not_none(
                usage.get("cacheWriteTokens"),
                usage.get("cacheCreationInputTokens"),
                flat.get("cacheWriteTokens"),
                flat.get("cacheCreationInputTokens"),
            )
        ),
        "reasoningTokens": safe_int(
            _first_not_none(usage.get("reasoningTokens"), flat.get("reasoningTokens"))
        ),
        "requestCount": safe_int(
            _first_not_none(requests.get("count"), flat.get("requestCount"))
        ),
        "premiumRequestCost": safe_number(
            _first_not_none(requests.get("cost"), flat.get("premiumRequestCost"))
        ),
        "apiDurationMs": safe_int(flat.get("apiDurationMs")),
    }


# ---------------------------------------------------------------------------
# Public normalisation (mirrors normaliseModelMetrics)
# ---------------------------------------------------------------------------


def normalise_model_metrics(raw: Any) -> tuple[str, list[dict[str, Any]]]:
    """Normalise a raw ``modelMetrics`` payload.

    Returns a tuple of ``(format_label, metrics_list)`` where *format_label*
    is one of ``"dict"``, ``"array"``, or ``"none"``.
    """
    if raw is None:
        return ("none", [])

    # Legacy array format: [{ modelId: "…", … }]
    if isinstance(raw, list):
        results = []
        for entry in raw:
            obj = entry if _is_plain_object(entry) else {}
            model = obj.get("modelId", "") if _is_plain_object(obj) else ""
            if not isinstance(model, str):
                model = ""
            results.append(_extract_entry(model, obj))
        return ("array", results)

    # Dictionary format: { "model-name": { … } }
    if _is_plain_object(raw):
        results = [_extract_entry(model, entry) for model, entry in raw.items()]
        return ("dict", results)

    return ("none", [])


# ---------------------------------------------------------------------------
# Session scanning
# ---------------------------------------------------------------------------


def _find_last_shutdown(events_path: Path) -> dict[str, Any] | None:
    """Return the data payload from the last ``session.shutdown`` event, or None."""
    last_shutdown: dict[str, Any] | None = None
    with open(events_path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not _is_plain_object(event):
                continue
            if event.get("type") == "session.shutdown":
                last_shutdown = event.get("data")
    return last_shutdown


# Holds per-session results for reporting
class SessionResult:
    __slots__ = (
        "session_id",
        "fmt",
        "models",
        "warning",
        "error",
    )

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.fmt: str = "none"  # dict | array | none | error
        self.models: list[dict[str, Any]] = []
        self.warning: bool = False
        self.error: str | None = None


def scan_session(session_dir: Path) -> SessionResult:
    """Scan a single session directory and return its result."""
    result = SessionResult(session_dir.name)
    events_path = session_dir / "events.jsonl"

    if not events_path.is_file():
        return result  # no events file — fmt stays "none"

    try:
        shutdown_data = _find_last_shutdown(events_path)
    except Exception as exc:
        result.fmt = "error"
        result.error = str(exc)
        return result

    if shutdown_data is None:
        return result  # no shutdown event — fmt stays "none"

    raw_metrics = shutdown_data.get("modelMetrics") if _is_plain_object(shutdown_data) else None

    try:
        fmt, models = normalise_model_metrics(raw_metrics)
    except Exception as exc:
        result.fmt = "error"
        result.error = str(exc)
        return result

    result.fmt = fmt
    result.models = models

    # Warn if ALL models have zero inputTokens AND zero outputTokens
    if models and all(
        m["inputTokens"] == 0 and m["outputTokens"] == 0 for m in models
    ):
        result.warning = True

    return result


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def _print_session(result: SessionResult, verbose: bool) -> None:
    """Print a single session's result line(s)."""
    prefix = result.session_id

    if result.fmt == "error":
        print(f"  ✗ {prefix}  format=error  err={result.error}")
        return

    if result.fmt == "none":
        # No shutdown event — skip in non-verbose mode
        if verbose:
            print(f"  – {prefix}  (no shutdown event)")
        return

    n = len(result.models)
    warn_marker = " ⚠️  WARNING: all models have zero input+output tokens" if result.warning else ""
    print(f"  {'⚠' if result.warning else '✓'} {prefix}  format={result.fmt}  models={n}{warn_marker}")

    if verbose:
        for m in result.models:
            print(
                f"      {m['model']:40s}  "
                f"in={m['inputTokens']:>9,}  out={m['outputTokens']:>9,}  "
                f"cacheR={m['cacheReadTokens']:>9,}  cacheW={m['cacheWriteTokens']:>9,}  "
                f"reason={m['reasoningTokens']:>9,}  reqs={m['requestCount']:>4}"
            )


def run(session_state_dir: Path, verbose: bool) -> int:
    """Main entry point.  Returns the process exit code."""
    if not session_state_dir.is_dir():
        print(f"Error: session-state directory not found: {session_state_dir}", file=sys.stderr)
        return 2

    session_dirs = sorted(
        p for p in session_state_dir.iterdir() if p.is_dir()
    )

    if not session_dirs:
        print(f"No session directories found in {session_state_dir}")
        return 0

    results: list[SessionResult] = []
    for sd in session_dirs:
        results.append(scan_session(sd))

    # ---- per-session output ----
    print(f"\nScanning {len(results)} sessions in {session_state_dir}\n")
    for r in results:
        _print_session(r, verbose)

    # ---- summary ----
    total = len(results)
    with_shutdown = [r for r in results if r.fmt in ("dict", "array")]
    without_shutdown = [r for r in results if r.fmt == "none"]
    dict_fmt = [r for r in results if r.fmt == "dict"]
    array_fmt = [r for r in results if r.fmt == "array"]
    warnings = [r for r in results if r.warning]
    errors = [r for r in results if r.fmt == "error"]

    all_models: set[str] = set()
    total_input = 0
    total_output = 0
    total_cache_read = 0
    total_cache_write = 0
    total_reasoning = 0

    for r in results:
        for m in r.models:
            all_models.add(m["model"])
            total_input += m["inputTokens"]
            total_output += m["outputTokens"]
            total_cache_read += m["cacheReadTokens"]
            total_cache_write += m["cacheWriteTokens"]
            total_reasoning += m["reasoningTokens"]

    grand_total = total_input + total_output + total_cache_read + total_cache_write + total_reasoning

    print("\n" + "=" * 72)
    print("Summary")
    print("=" * 72)
    print(f"  Total sessions scanned:          {total}")
    print(f"  Sessions with shutdown events:    {len(with_shutdown)}")
    print(f"  Sessions without shutdown events: {len(without_shutdown)}")
    print(f"  Sessions with dict format:        {len(dict_fmt)}")
    print(f"  Sessions with array format:       {len(array_fmt)}")
    print(f"  Sessions with warnings:           {len(warnings)}")
    print(f"  Sessions with parse errors:       {len(errors)}")
    print(f"  Unique model names:               {len(all_models)}")
    if all_models:
        for name in sorted(all_models):
            print(f"    • {name}")
    print(f"  Total tokens (all sessions):      {grand_total:,}")
    print(f"    input:       {total_input:>15,}")
    print(f"    output:      {total_output:>15,}")
    print(f"    cache read:  {total_cache_read:>15,}")
    print(f"    cache write: {total_cache_write:>15,}")
    print(f"    reasoning:   {total_reasoning:>15,}")
    print("=" * 72)

    # ---- exit code ----
    if errors:
        return 2
    if warnings:
        return 1
    return 0


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate local Copilot CLI sessions for model-metrics parsing."
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show per-model breakdown for each session.",
    )
    parser.add_argument(
        "--path",
        type=str,
        default=None,
        help="Override the default ~/.copilot/session-state/ directory.",
    )
    args = parser.parse_args()

    if args.path:
        session_state_dir = Path(args.path)
    else:
        session_state_dir = Path.home() / ".copilot" / "session-state"

    sys.exit(run(session_state_dir, verbose=args.verbose))


if __name__ == "__main__":
    main()
