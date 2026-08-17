export const STATE_SCHEMA_VERSION = 2;
export const BACKUP_SCHEMA_VERSION = 2;
export const CREATED = "CREATED";
export const CANNOT_CREATE = "CANNOT_CREATE";
export const LEGACY_BUNDLE_VERSION = "1.0.0";

const GROUNDED_TYPES = new Set(["SO", "PPM", "ID"]);
const LEGACY_CANNOT_CREATE_NOTE = "cannot create a violation";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function candidateOutcome(candidate) {
  return candidate?.candidate_outcome === CANNOT_CREATE ? CANNOT_CREATE : CREATED;
}

export function setCandidateOutcome(candidate, outcome) {
  if (![CREATED, CANNOT_CREATE].includes(outcome)) throw new Error(`Invalid candidate outcome: ${outcome}`);
  if (candidateOutcome(candidate) === outcome) return false;
  candidate.candidate_outcome = outcome;
  candidate.complete = false;
  candidate.completed_at = null;
  return true;
}

export function decisionTarget(manifest) {
  const perPair = manifest.expected_decisions_per_pair ?? manifest.expected_candidates_per_pair;
  return manifest.expected_pair_count * perPair;
}

export function pairPolicyHashes(manifest) {
  return Object.fromEntries(manifest.pairs.map((pair) => [pair.policy_id, pair.policy.sha256]));
}

export function decisionStats(state, manifest, types) {
  const stats = { complete: 0, created: 0, cannot_create: 0, target: decisionTarget(manifest) };
  for (const pair of manifest.pairs) {
    const byType = state?.candidates?.[pair.policy_id] || {};
    for (const type of types) {
      const candidate = byType[type];
      if (!candidate?.complete) continue;
      stats.complete += 1;
      if (candidateOutcome(candidate) === CANNOT_CREATE) stats.cannot_create += 1;
      else stats.created += 1;
    }
  }
  return stats;
}

export function validateCandidateModel({
  pair,
  type,
  candidate,
  allowedOperations = [],
  allowedBuckets = [],
  ppmSubstrategies = [],
  validateAnchor = () => null,
}) {
  const errors = [];
  if (!candidate?.data_category) errors.push("Select a data category.");

  if (GROUNDED_TYPES.has(type)) {
    if (!String(candidate?.specific_field || "").trim()) errors.push("Enter the exact collected field.");
    if (!(candidate?.webform_evidence || []).length) errors.push("Select at least one webform screenshot.");
  }

  const validEvidence = new Set((pair?.screenshots || [])
    .filter((screenshot) => screenshot.kind !== "homepage")
    .map((screenshot) => screenshot.screenshot_id));
  if ((candidate?.webform_evidence || []).some((id) => !validEvidence.has(id))) {
    errors.push("A selected screenshot is not valid for this policy pair.");
  }

  if (candidateOutcome(candidate) === CANNOT_CREATE) {
    if (!String(candidate?.explanations || "").trim()) {
      errors.push("Explain why a valid standalone violation cannot be created.");
    }
    return errors;
  }

  if (type === "PPM" && !ppmSubstrategies.includes(candidate.ppm_substrategy)) {
    errors.push("Select a PPM sub-strategy.");
  }

  const operations = candidate?.operations || [];
  if (type === "DLC" || type === "GLC") {
    const conflictError = validateAnchor(
      candidate.conflicting_phrase,
      candidate.conflict_start_utf16,
      candidate.conflict_end_utf16,
    );
    if (conflictError) errors.push(`Conflicting phrase: ${conflictError}.`);
    if (operations.length !== 1) errors.push("A contradiction candidate must contain exactly one operation.");
  } else if (!operations.length) {
    errors.push("Add at least one edit operation.");
  }

  operations.forEach((operation, index) => {
    if (!allowedOperations.includes(operation.op_type)) errors.push(`Op ${index + 1}: invalid operation type.`);
    const anchorError = validateAnchor(operation.before_snippet, operation.start_utf16, operation.end_utf16);
    if (anchorError) errors.push(`Op ${index + 1}: ${anchorError}.`);
    if (operation.op_type === "ADD" && !String(operation.after_snippet || "").trim()) {
      errors.push(`Op ${index + 1}: write the new snippet.`);
    }
    if (operation.op_type === "MODIFY" && !String(operation.after_snippet || "").trim()) {
      errors.push(`Op ${index + 1}: write the replacement snippet.`);
    }
    if (operation.op_type === "REMOVE" && operation.after_snippet) {
      errors.push(`Op ${index + 1}: REMOVE must have an empty after snippet.`);
    }
    if (operation.op_type === "ADD" && !allowedBuckets.includes(operation.location_bucket)) {
      errors.push(`Op ${index + 1}: select a valid location bucket.`);
    }
  });
  return errors;
}

function validateIdentity(source, manifest, annotationName, allowLegacy) {
  if (!source || typeof source !== "object") throw new Error("Draft state is missing or invalid");
  for (const key of ["bundle_id", "assignment_id", "batch_id"]) {
    if (source[key] !== manifest[key]) throw new Error(`Draft ${key} does not match this calibration bundle`);
  }
  if (source.annotator_id !== annotationName) {
    throw new Error("Draft annotation name does not match the entered annotation name");
  }
  const isLegacy = source.schema_version === 1 && source.bundle_version === LEGACY_BUNDLE_VERSION;
  const isCurrent = source.schema_version === STATE_SCHEMA_VERSION && source.bundle_version === manifest.bundle_version;
  if (!isCurrent && !(allowLegacy && isLegacy)) throw new Error("Unsupported draft state version");
  if (!source.candidates || typeof source.candidates !== "object" || Array.isArray(source.candidates)) {
    throw new Error("Draft candidates are missing or invalid");
  }
  const validPairIds = new Set(manifest.pairs.map((pair) => pair.policy_id));
  const unknownPair = Object.keys(source.candidates).find((policyId) => !validPairIds.has(policyId));
  if (unknownPair) throw new Error(`Draft contains an unexpected policy ID: ${unknownPair}`);
  return isLegacy;
}

export function upgradeState(source, manifest, annotationName, types) {
  const isLegacy = validateIdentity(source, manifest, annotationName, true);
  const upgraded = clone(source);
  upgraded.schema_version = STATE_SCHEMA_VERSION;
  upgraded.bundle_id = manifest.bundle_id;
  upgraded.bundle_version = manifest.bundle_version;
  upgraded.assignment_id = manifest.assignment_id;
  upgraded.batch_id = manifest.batch_id;
  upgraded.annotator_id = annotationName;
  upgraded.candidates ||= {};

  for (const pair of manifest.pairs) {
    const byType = upgraded.candidates[pair.policy_id];
    if (!byType || typeof byType !== "object") continue;
    for (const type of types) {
      const candidate = byType[type];
      if (!candidate || typeof candidate !== "object") continue;
      candidate.operations = Array.isArray(candidate.operations) ? candidate.operations : [];
      candidate.webform_evidence = Array.isArray(candidate.webform_evidence) ? candidate.webform_evidence : [];
      if (isLegacy && candidate.notes_for_reviewer === LEGACY_CANNOT_CREATE_NOTE) {
        candidate.candidate_outcome = CANNOT_CREATE;
        candidate.notes_for_reviewer = "";
      } else {
        candidate.candidate_outcome = candidateOutcome(candidate);
      }
      if (candidate.complete && candidate.candidate_outcome === CANNOT_CREATE) {
        const errors = validateCandidateModel({ pair, type, candidate });
        if (errors.length) {
          candidate.complete = false;
          candidate.completed_at = null;
        }
      }
    }
  }
  return upgraded;
}

function hashesMatch(actual, manifest) {
  const expected = pairPolicyHashes(manifest);
  return actual && Object.keys(expected).length === Object.keys(actual).length &&
    Object.entries(expected).every(([policyId, hash]) => actual[policyId] === hash);
}

export function upgradeBackup(source, manifest, annotationName, types) {
  if (!source || typeof source !== "object") throw new Error("Backup is missing or invalid");
  const schema = source.backup_schema_version;
  if (schema !== 1 && schema !== BACKUP_SCHEMA_VERSION) throw new Error("Unsupported backup format");
  for (const key of ["bundle_id", "assignment_id", "batch_id"]) {
    if (source[key] !== manifest[key]) throw new Error(`Backup ${key} does not match this calibration bundle`);
  }
  if (source.annotator_id !== annotationName) {
    throw new Error("Backup annotation name does not match the entered annotation name");
  }
  if (schema === 1 && source.bundle_version !== LEGACY_BUNDLE_VERSION) {
    throw new Error("Unsupported v1 backup bundle version");
  }
  if (schema === BACKUP_SCHEMA_VERSION) {
    if (source.bundle_version !== manifest.bundle_version) throw new Error("Backup bundle_version does not match this calibration bundle");
    if (!hashesMatch(source.pair_policy_hashes, manifest)) throw new Error("Backup policy identities do not match this calibration bundle");
  }

  const upgradedState = upgradeState(source.state, manifest, annotationName, types);
  return {
    ...clone(source),
    backup_schema_version: BACKUP_SCHEMA_VERSION,
    bundle_id: manifest.bundle_id,
    bundle_version: manifest.bundle_version,
    assignment_id: manifest.assignment_id,
    batch_id: manifest.batch_id,
    annotator_id: annotationName,
    pair_policy_hashes: pairPolicyHashes(manifest),
    state: upgradedState,
  };
}

export function buildCannotCreateRow({ base, candidate, type }) {
  const grounded = GROUNDED_TYPES.has(type);
  return {
    ...base,
    candidate_outcome: CANNOT_CREATE,
    synthetic_id: "",
    op_index: 0,
    op_type: "",
    edit_summary: "",
    insertion_location_hint: "",
    notes_for_reviewer: "",
    explanations: candidate.explanations,
    before_snippet_sha256: "",
    after_snippet_sha256: "",
    match_found: "",
    match_start: "",
    match_end: "",
    before_snippet: "",
    after_snippet: "",
    error: "",
    data_category: candidate.data_category,
    specific_field: grounded ? candidate.specific_field : "",
    webform_evidence: grounded ? (candidate.webform_evidence || []).join(";") : "",
    ppm_substrategy: "",
    conflicting_phrase: "",
    original_conflict_snippet: "",
    location_bucket: "",
    accompanied_violation: "",
  };
}
