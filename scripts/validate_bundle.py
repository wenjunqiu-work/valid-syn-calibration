#!/usr/bin/env python3
"""Validate the frozen calibration bundle and its source provenance."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from pathlib import Path


PAIR_IDS = ["VALID-RAW-043", "VALID-RAW-048", "VALID-RAW-003", "VALID-RAW-099", "VALID-RAW-005"]
TEXT_SUFFIXES = {".html", ".css", ".js", ".json", ".md", ".txt", ".py", ".yml", ".yaml"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    default_site = Path(__file__).resolve().parents[1]
    default_csv = Path(__file__).resolve().parents[2] / "150-raw-pair.csv"
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-root", type=Path, default=default_site)
    parser.add_argument("--source-csv", type=Path, default=default_csv)
    args = parser.parse_args()

    site_root = args.site_root.resolve()
    manifest_path = site_root / "data" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    errors: list[str] = []

    pairs = manifest.get("pairs") or []
    if [pair.get("policy_id") for pair in pairs] != PAIR_IDS:
        errors.append("Manifest pair order/identity is incorrect")
    if manifest.get("bundle_id") != "VALID-syn-calibration":
        errors.append("Unexpected bundle_id")
    if manifest.get("bundle_version") != "1.0.0":
        errors.append("Unexpected bundle_version")
    if manifest.get("assignment_id") != "VALID-CAL-001":
        errors.append("Unexpected assignment_id")
    if manifest.get("batch_id") != "VALID-BATCH-001":
        errors.append("Unexpected batch_id")
    if manifest.get("violation_types") != ["SO", "PPM", "ID", "DLC", "GLC"]:
        errors.append("Unexpected violation type list")

    screenshot_count = 0
    screenshot_ids: set[str] = set()
    for pair in pairs:
        policy = pair["policy"]
        policy_path = site_root / policy["path"]
        if not policy_path.is_file():
            errors.append(f"Missing policy: {policy['path']}")
        elif sha256(policy_path) != policy["sha256"]:
            errors.append(f"Policy hash mismatch: {pair['policy_id']}")
        for screenshot in pair.get("screenshots") or []:
            screenshot_count += 1
            screenshot_id = screenshot["screenshot_id"]
            if screenshot_id in screenshot_ids:
                errors.append(f"Duplicate screenshot_id: {screenshot_id}")
            screenshot_ids.add(screenshot_id)
            path = site_root / screenshot["path"]
            if not path.is_file():
                errors.append(f"Missing screenshot: {screenshot['path']}")
            elif sha256(path) != screenshot["sha256"]:
                errors.append(f"Screenshot hash mismatch: {screenshot_id}")
            elif path.stat().st_size != screenshot["bytes"]:
                errors.append(f"Screenshot byte-count mismatch: {screenshot_id}")
    if screenshot_count != 29:
        errors.append(f"Expected 29 screenshots, found {screenshot_count}")

    source_csv = args.source_csv.resolve()
    if source_csv.is_file():
        with source_csv.open(encoding="utf-8", newline="") as handle:
            all_source_rows = list(csv.DictReader(handle))
        source_by_id = {row["pair_id"]: row for row in all_source_rows}
        if any(pair_id not in source_by_id for pair_id in PAIR_IDS):
            errors.append("A selected pair is missing from the source CSV")
        for pair in pairs:
            row = source_by_id[pair["policy_id"]]
            policy_source = Path(row["selected_policy_md_path"])
            results_source = Path(row["webform_results_json_path"])
            if not policy_source.is_file() or sha256(policy_source) != pair["policy"]["sha256"]:
                errors.append(f"Source policy provenance failed: {pair['policy_id']}")
            if not results_source.is_file() or sha256(results_source) != pair["source_results"]["sha256"]:
                errors.append(f"Source results provenance failed: {pair['policy_id']}")

    local_path_patterns = [
        re.compile(re.escape("/" + "Users/"), re.IGNORECASE),
        re.compile(re.escape("file" + "://"), re.IGNORECASE),
    ]
    credential_pattern = re.compile(
        r"(?:api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*['\"][A-Za-z0-9._-]{16,}['\"]",
        re.IGNORECASE,
    )
    leaked_files: list[str] = []
    for path in site_root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if any(pattern.search(text) for pattern in local_path_patterns) or credential_pattern.search(text):
            leaked_files.append(path.relative_to(site_root).as_posix())
    if leaked_files:
        errors.append("Potential local-path/credential leak in: " + ", ".join(leaked_files))

    app_path = site_root / "assets" / "js" / "app.js"
    app_text = app_path.read_text(encoding="utf-8") if app_path.is_file() else ""
    if "op_type" not in app_text:
        errors.append("op_type is missing from app export code")
    if "placement_mode" in app_text:
        errors.append("placement_mode must not appear in app export code")

    report = {
        "ok": not errors,
        "pairs": len(pairs),
        "policies": len(pairs),
        "screenshots": screenshot_count,
        "candidate_target": len(pairs) * len(manifest.get("violation_types") or []),
        "errors": errors,
    }
    print(json.dumps(report, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
