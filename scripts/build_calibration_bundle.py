#!/usr/bin/env python3
"""Build the frozen five-pair VALID-syn GitHub Pages calibration bundle."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any, Iterable


PAIR_IDS = (
    "VALID-RAW-043",
    "VALID-RAW-048",
    "VALID-RAW-003",
    "VALID-RAW-099",
    "VALID-RAW-005",
)
SAFE_FIELD_KEYS = (
    "field_id",
    "type",
    "name",
    "placeholder",
    "aria_label",
    "autocomplete",
    "label",
    "tag",
    "required",
    "options",
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def copy_exact(source: Path, destination: Path) -> dict[str, Any]:
    if not source.is_file():
        raise FileNotFoundError(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    source_hash = sha256_file(source)
    copied_hash = sha256_file(destination)
    if source_hash != copied_hash:
        raise RuntimeError(f"Copy hash mismatch: {source} -> {destination}")
    return {"sha256": copied_hash, "bytes": destination.stat().st_size}


def load_rows(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    rows_by_id = {row.get("pair_id"): row for row in rows}
    missing = [pair_id for pair_id in PAIR_IDS if pair_id not in rows_by_id]
    if missing:
        raise ValueError(f"Missing selected pair IDs: {', '.join(missing)}")
    selected = [rows_by_id[pair_id] for pair_id in PAIR_IDS]
    if len({row["policy_sha256"] for row in selected}) != 5:
        raise ValueError("The five selected policy hashes are not unique")
    return selected


def screenshot_record(
    *,
    pair_id: str,
    screenshot_id: str,
    kind: str,
    source_path: str | None,
    site_root: Path,
    form_type: str | None = None,
    form_index: int | None = None,
    step: int | None = None,
    page_url: str | None = None,
    crop_index: int | None = None,
) -> dict[str, Any] | None:
    if not source_path:
        return None
    source = Path(source_path)
    relative = Path("assets") / "screenshots" / pair_id / source.name
    copied = copy_exact(source, site_root / relative)
    return {
        "screenshot_id": screenshot_id,
        "kind": kind,
        "form_type": form_type,
        "form_index": form_index,
        "step": step,
        "crop_index": crop_index,
        "page_url": page_url,
        "source_filename": source.name,
        "path": relative.as_posix(),
        **copied,
    }


def append_unique(records: list[dict[str, Any]], record: dict[str, Any] | None) -> None:
    if record is None:
        return
    if any(item["path"] == record["path"] for item in records):
        return
    records.append(record)


def safe_fields(fields: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{key: field.get(key) for key in SAFE_FIELD_KEYS} for field in fields]


def build_pair(row: dict[str, str], site_root: Path) -> dict[str, Any]:
    pair_id = row["pair_id"]
    policy_source = Path(row["selected_policy_md_path"])
    results_source = Path(row["webform_results_json_path"])
    if not policy_source.is_file() or not results_source.is_file():
        raise FileNotFoundError(f"Missing source for {pair_id}")

    policy_relative = Path("data") / "policies" / f"{pair_id}.md"
    policy_copy = copy_exact(policy_source, site_root / policy_relative)
    if policy_copy["sha256"] != row["policy_sha256"]:
        raise ValueError(f"Policy hash does not match shortlist for {pair_id}")

    results_bytes = results_source.read_bytes()
    results = json.loads(results_bytes.decode("utf-8"))
    screenshots: list[dict[str, Any]] = []
    forms: list[dict[str, Any]] = []

    for form_position, form in enumerate(results.get("forms") or [], start=1):
        form_index = form.get("form_index") or form_position
        form_type = form.get("form_type") or "unknown"
        page_url = form.get("page_url")
        form_screenshot_ids: list[str] = []

        full_id = f"{pair_id}-F{form_index}-S0-FULL"
        full = screenshot_record(
            pair_id=pair_id,
            screenshot_id=full_id,
            kind="full_form",
            source_path=form.get("step0_screenshot"),
            site_root=site_root,
            form_type=form_type,
            form_index=form_index,
            step=0,
            page_url=page_url,
        )
        append_unique(screenshots, full)
        if full:
            form_screenshot_ids.append(full_id)

        for crop_index, source_path in enumerate(form.get("step0_cropped_screenshots") or []):
            screenshot_id = f"{pair_id}-F{form_index}-S0-CROP{crop_index}"
            record = screenshot_record(
                pair_id=pair_id,
                screenshot_id=screenshot_id,
                kind="cropped_field",
                source_path=source_path,
                site_root=site_root,
                form_type=form_type,
                form_index=form_index,
                step=0,
                page_url=page_url,
                crop_index=crop_index,
            )
            append_unique(screenshots, record)
            if record:
                form_screenshot_ids.append(screenshot_id)

        for step_record in form.get("steps") or []:
            step = step_record.get("step")
            screenshot_id = f"{pair_id}-F{form_index}-S{step}-FULL"
            record = screenshot_record(
                pair_id=pair_id,
                screenshot_id=screenshot_id,
                kind="step",
                source_path=step_record.get("screenshot"),
                site_root=site_root,
                form_type=form_type,
                form_index=form_index,
                step=step,
                page_url=step_record.get("url") or page_url,
            )
            append_unique(screenshots, record)
            if record:
                form_screenshot_ids.append(screenshot_id)
            for crop_index, source_path in enumerate(step_record.get("cropped_screenshots") or []):
                crop_id = f"{pair_id}-F{form_index}-S{step}-CROP{crop_index}"
                crop = screenshot_record(
                    pair_id=pair_id,
                    screenshot_id=crop_id,
                    kind="cropped_field",
                    source_path=source_path,
                    site_root=site_root,
                    form_type=form_type,
                    form_index=form_index,
                    step=step,
                    page_url=step_record.get("url") or page_url,
                    crop_index=crop_index,
                )
                append_unique(screenshots, crop)
                if crop:
                    form_screenshot_ids.append(crop_id)

        forms.append(
            {
                "form_index": form_index,
                "form_type": form_type,
                "num_steps": form.get("num_steps"),
                "page_url": page_url,
                "fields": safe_fields(form.get("fields") or []),
                "screenshot_ids": form_screenshot_ids,
            }
        )

    homepage = screenshot_record(
        pair_id=pair_id,
        screenshot_id=f"{pair_id}-HOME",
        kind="homepage",
        source_path=results.get("homepage_screenshot"),
        site_root=site_root,
        page_url=results.get("homepage_url_final") or results.get("url"),
    )
    append_unique(screenshots, homepage)

    expected_screenshot_count = int(row["screenshot_count"])
    if len(screenshots) != expected_screenshot_count:
        raise ValueError(
            f"Screenshot count mismatch for {pair_id}: expected {expected_screenshot_count}, got {len(screenshots)}"
        )

    return {
        "policy_id": pair_id,
        "website": row["website"],
        "analyzer_site_key": row["analyzer_site_key"],
        "primary_category": row["primary_category"],
        "categories": row["categories"],
        "document_heading": row["document_heading"],
        "policy_url": row["policy_url"],
        "collection_timestamp": results.get("crawl_timestamp"),
        "homepage_url": results.get("homepage_url_final") or results.get("url"),
        "policy": {
            "path": policy_relative.as_posix(),
            "source_filename": policy_source.name,
            "sha256": policy_copy["sha256"],
            "bytes": policy_copy["bytes"],
            "word_count": int(row["policy_word_count"]),
            "length_bin": row["policy_length_bin"],
        },
        "source_results": {
            "filename": results_source.name,
            "sha256": sha256_bytes(results_bytes),
            "bytes": len(results_bytes),
        },
        "selection": {
            "tier": row["selection_tier"],
            "reason": row["selection_reason"],
            "confidence": int(row["confidence"]),
            "candidate_count": int(row["candidate_count"]),
            "form_count": int(row["form_count"]),
            "step_count": int(row["step_count"]),
            "form_complexity": row["form_complexity"],
            "screenshot_count": expected_screenshot_count,
        },
        "forms": forms,
        "screenshots": screenshots,
    }


def main() -> None:
    default_csv = Path(__file__).resolve().parents[2] / "150-raw-pair.csv"
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-csv", type=Path, default=default_csv)
    parser.add_argument("--site-root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()

    site_root = args.site_root.resolve()
    rows = load_rows(args.source_csv.resolve())
    pairs = [build_pair(row, site_root) for row in rows]
    manifest = {
        "schema_version": 2,
        "bundle_id": "VALID-syn-calibration",
        "bundle_version": "1.1.0",
        "assignment_id": "VALID-CAL-001",
        "batch_id": "VALID-BATCH-001",
        "expected_pair_count": 5,
        "expected_decisions_per_pair": 5,
        "expected_candidates_per_pair": 5,
        "violation_types": ["SO", "PPM", "ID", "DLC", "GLC"],
        "pairs": pairs,
    }
    manifest_path = site_root / "data" / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "manifest": str(manifest_path),
                "pairs": len(pairs),
                "policies": len(pairs),
                "screenshots": sum(len(pair["screenshots"]) for pair in pairs),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
