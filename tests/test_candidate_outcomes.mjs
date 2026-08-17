import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BACKUP_SCHEMA_VERSION,
  CANNOT_CREATE,
  CREATED,
  STATE_SCHEMA_VERSION,
  buildCannotCreateRow,
  decisionStats,
  pairPolicyHashes,
  setCandidateOutcome,
  upgradeBackup,
  upgradeState,
  validateCandidateModel,
} from "../assets/js/model.js";

const manifest = JSON.parse(await readFile(new URL("../data/manifest.json", import.meta.url), "utf8"));
const pair = manifest.pairs[0];
const types = manifest.violation_types;
const screenshotId = pair.screenshots.find((screenshot) => screenshot.kind !== "homepage").screenshot_id;

function cannotCandidate(overrides = {}) {
  return {
    candidate_outcome: CANNOT_CREATE,
    data_category: "contact_data",
    specific_field: "Email",
    webform_evidence: [screenshotId],
    explanations: "No standalone violation is supported by the available evidence.",
    ppm_substrategy: "",
    operations: [],
    ...overrides,
  };
}

for (const type of ["SO", "PPM", "ID"]) {
  let anchorCalls = 0;
  const errors = validateCandidateModel({
    pair,
    type,
    candidate: cannotCandidate(),
    validateAnchor: () => { anchorCalls += 1; return "must not run"; },
  });
  assert.deepEqual(errors, [], `${type} cannot-create should be valid with grounded evidence`);
  assert.equal(anchorCalls, 0, `${type} cannot-create must bypass anchor validation`);
  assert.match(validateCandidateModel({ pair, type, candidate: cannotCandidate({ specific_field: "" }) }).join(" "), /exact collected field/);
  assert.match(validateCandidateModel({ pair, type, candidate: cannotCandidate({ webform_evidence: [] }) }).join(" "), /webform screenshot/);
}

for (const type of ["DLC", "GLC"]) {
  const candidate = cannotCandidate({ specific_field: "", webform_evidence: [], operations: [] });
  assert.deepEqual(validateCandidateModel({ pair, type, candidate }), []);
}

assert.match(validateCandidateModel({ pair, type: "GLC", candidate: cannotCandidate({ explanations: "" }) }).join(" "), /Explain why/);
assert.match(validateCandidateModel({ pair, type: "SO", candidate: cannotCandidate({ data_category: "" }) }).join(" "), /data category/);
assert.match(validateCandidateModel({ pair, type: "SO", candidate: cannotCandidate({ webform_evidence: ["UNKNOWN"] }) }).join(" "), /not valid/);

const createdWithoutOperations = { ...cannotCandidate(), candidate_outcome: CREATED, operations: [] };
assert.match(validateCandidateModel({ pair, type: "SO", candidate: createdWithoutOperations }).join(" "), /edit operation/);

const switchingCandidate = {
  candidate_outcome: CREATED,
  operations: [{ op_type: "MODIFY", before_snippet: "saved work", after_snippet: "saved edit" }],
  complete: true,
  completed_at: "2026-08-17T00:00:00.000Z",
};
assert.equal(setCandidateOutcome(switchingCandidate, CANNOT_CREATE), true);
assert.equal(switchingCandidate.complete, false);
assert.equal(switchingCandidate.completed_at, null);
assert.equal(switchingCandidate.operations[0].after_snippet, "saved edit");
assert.equal(setCandidateOutcome(switchingCandidate, CREATED), true);
assert.equal(switchingCandidate.operations[0].before_snippet, "saved work");

const sentinel = buildCannotCreateRow({
  base: {
    bundle_id: manifest.bundle_id,
    bundle_version: manifest.bundle_version,
    assignment_id: manifest.assignment_id,
    batch_id: manifest.batch_id,
    policy_id: pair.policy_id,
    source_file: pair.policy.source_filename,
    website: pair.website,
    url: pair.policy_url,
    violation_type: "SO",
    candidate_id: `${pair.policy_id}__SO-1`,
    policy_sha256: pair.policy.sha256,
    author_id: "SAMPLE_ANNOTATION",
    status: "submitted",
  },
  candidate: cannotCandidate({
    operations: [{ op_type: "REMOVE", before_snippet: "hidden prior work" }],
    notes_for_reviewer: "others",
    edit_summary: "hidden summary",
  }),
  type: "SO",
});
assert.equal(sentinel.candidate_outcome, CANNOT_CREATE);
assert.equal(sentinel.op_index, 0);
assert.equal(sentinel.synthetic_id, "");
assert.equal(sentinel.op_type, "");
assert.equal(sentinel.match_found, "");
assert.equal(sentinel.before_snippet, "");
assert.equal(sentinel.location_bucket, "");
assert.equal(sentinel.notes_for_reviewer, "");
assert.equal(sentinel.explanations, cannotCandidate().explanations);
assert.equal(sentinel.specific_field, "Email");
assert.equal(sentinel.webform_evidence, screenshotId);

const mixedState = { candidates: {} };
manifest.pairs.forEach((manifestPair, pairIndex) => {
  mixedState.candidates[manifestPair.policy_id] = {};
  types.forEach((type, typeIndex) => {
    mixedState.candidates[manifestPair.policy_id][type] = {
      complete: true,
      candidate_outcome: (pairIndex + typeIndex) % 2 ? CREATED : CANNOT_CREATE,
    };
  });
});
const stats = decisionStats(mixedState, manifest, types);
assert.equal(stats.complete, 25);
assert.equal(stats.target, 25);
assert.equal(stats.created + stats.cannot_create, 25);

const v1Backup = JSON.parse(await readFile(new URL("./fixtures/v1-draft.json", import.meta.url), "utf8"));
const upgraded = upgradeBackup(v1Backup, manifest, "SAMPLE_ANNOTATION", types);
assert.equal(upgraded.backup_schema_version, BACKUP_SCHEMA_VERSION);
assert.equal(upgraded.bundle_version, "1.1.0");
assert.deepEqual(upgraded.pair_policy_hashes, pairPolicyHashes(manifest));
assert.equal(upgraded.state.schema_version, STATE_SCHEMA_VERSION);
const migratedSo = upgraded.state.candidates["VALID-RAW-043"].SO;
assert.equal(migratedSo.candidate_outcome, CANNOT_CREATE);
assert.equal(migratedSo.notes_for_reviewer, "");
assert.equal(migratedSo.complete, true);
assert.equal(migratedSo.operations.length, 1, "hidden legacy operations must be preserved");
assert.equal(migratedSo.operations[0].before_snippet, "preserved legacy anchor");
const migratedPpm = upgraded.state.candidates["VALID-RAW-043"].PPM;
assert.equal(migratedPpm.candidate_outcome, CREATED);
assert.equal(migratedPpm.notes_for_reviewer, "the edit(s) unavoidably result in multiple violations");

const invalidLegacy = structuredClone(v1Backup.state);
invalidLegacy.candidates["VALID-RAW-043"].SO.explanations = "";
const invalidMigrated = upgradeState(invalidLegacy, manifest, "SAMPLE_ANNOTATION", types);
assert.equal(invalidMigrated.candidates["VALID-RAW-043"].SO.complete, false);

const currentBackup = upgradeBackup(upgraded, manifest, "SAMPLE_ANNOTATION", types);
assert.equal(currentBackup.backup_schema_version, 2);
const wrongHashBackup = structuredClone(currentBackup);
wrongHashBackup.pair_policy_hashes["VALID-RAW-043"] = "0".repeat(64);
assert.throws(() => upgradeBackup(wrongHashBackup, manifest, "SAMPLE_ANNOTATION", types), /policy identities/);

console.log(JSON.stringify({
  ok: true,
  cannot_create_validation: true,
  anchor_bypass: true,
  metadata_row: true,
  mixed_decision_target: stats,
  v1_state_and_backup_migration: true,
  hidden_operations_preserved: true,
  outcome_switch_preserves_operations: true,
}, null, 2));
