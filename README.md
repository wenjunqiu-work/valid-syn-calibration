# VALID-syn five-pair calibration site

This directory is a complete, dependency-free GitHub Pages site for the authoring calibration batch `VALID-CAL-001`. It contains `VALID-RAW-043`, `VALID-RAW-048`, `VALID-RAW-003`, `VALID-RAW-099`, and `VALID-RAW-005` in that order, their byte-identical selected policies, and all 29 referenced screenshots.

## Important content and privacy notes

- The site is public-ready, not access-controlled. `robots.txt` and `noindex` reduce indexing but are not security controls.
- Annotators enter their annotation name and click **Start annotation**.
- Drafts remain in that browser unless the annotator downloads a JSON backup. There is no server-side database or login.
- Do not commit annotator CSV or JSON submissions to this repository.

## Test locally

The application must be served over HTTP because it loads the frozen manifest and policy files with browser requests.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

Run the bundled integrity and Unicode-offset checks from the repository root:

```bash
python3 scripts/validate_bundle.py
node tests/test_core.mjs
node tests/test_candidate_outcomes.mjs
node tests/test_export_schema.mjs
node tests/test_ui_contract.mjs
```

## Publish with GitHub Pages

1. Create a GitHub repository and place the contents of this directory at its root.
2. Commit and push the files to the branch you want to publish.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, select the branch, select `/ (root)`, and save.
5. Open the published project URL and confirm the five-pair workspace loads.

The application uses only relative URLs, so it works both at a domain root and at a project URL such as `https://account.github.io/repository-name/`. Deployment is intentionally not automated by this package.

## Annotation and downloads

- Every input change is saved in browser storage under bundle version, assignment, and annotation name.
- Every type decision has a `CREATED` (default) or exceptional `CANNOT_CREATE` outcome. Editing a completed decision or switching its outcome returns it to draft; hidden CREATED operations are preserved when switching outcomes.
- `CANNOT_CREATE` always requires a data category and explanation. SO, PPM, and ID also require a specific field and screenshot evidence; DLC and GLC do not.
- **Backup draft** downloads every partial field as schema-2 JSON; **Restore draft** imports matching schema-1 or schema-2 backups. Bundle `1.0.0` browser drafts migrate automatically to `1.1.0` without deleting the old storage entry.
- **Working CSV** is cumulative and contains every completed type decision so far.
- **Final CSV** unlocks only when all 25 type decisions are complete, regardless of their mix of outcomes.
- A CREATED candidate may have multiple operation rows. A CANNOT_CREATE decision has one metadata-only row with `op_index=0`, blank `synthetic_id`, and blank edit/anchor fields. Count decisions by `candidate_id`, not by CSV row count.
- Downstream policy assemblers must process only rows with `candidate_outcome=CREATED`; no assembler is included in this static site.
- The operation schema retains `op_type` and intentionally has no redundant operation-mode column.

## Frozen bundle and regeneration

`data/manifest.json` is the public, relative-path source of truth. Manifest schema 2 identifies bundle `1.1.0`, declares five expected type decisions per pair, and retains `expected_candidates_per_pair` only as a deprecated compatibility alias. The manifest also includes source metadata, form fields, collection timestamps, file sizes, and SHA-256 hashes. It does not contain local machine paths.

To rebuild from the parent `150-raw-pair.csv` and re-copy the original evidence:

```bash
python3 scripts/build_calibration_bundle.py
python3 scripts/validate_bundle.py
```

The builder fails unless all five selected IDs exist, all source files exist, the five policy hashes match, and the screenshot counts reconcile.

## Directory guide

- `index.html` and `assets/`: the static annotation application and evidence images
- `data/manifest.json`: frozen assignment and evidence metadata
- `data/policies/`: exact selected policy bytes used for offsets and later application
- `docs/`: the canonical outcome-aware instructions plus a pilot quick start
- `scripts/`: deterministic bundle builder and integrity validator
- `tests/`: dependency-free offset, migration, outcome-validation, CSV, and interface-contract checks

## Future production work

This calibration version is author-only. Server-side autosave, authentication, verifier decisions, adjudication, and assignment administration should be added only after pilot feedback. GitHub Pages itself serves static files and does not supply those backend capabilities.
