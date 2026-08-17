export const ANNOTATOR_PATTERN = /^[A-Za-z0-9_-]{2,32}$/;
export const CSV_COLUMNS = [
  "bundle_id", "bundle_version", "assignment_id", "batch_id",
  "policy_id", "source_file", "website", "url", "violation_type", "candidate_id", "candidate_outcome", "synthetic_id",
  "op_index", "op_type", "edit_summary", "insertion_location_hint", "notes_for_reviewer", "explanations", "policy_sha256",
  "before_snippet_sha256", "after_snippet_sha256", "match_found", "match_start", "match_end", "before_snippet",
  "after_snippet", "error", "data_category", "specific_field", "webform_evidence", "ppm_substrategy",
  "conflicting_phrase", "original_conflict_snippet", "location_bucket", "accompanied_violation", "author_id", "status",
];

export function isValidAnnotatorId(value) {
  return ANNOTATOR_PATTERN.test(String(value || "").trim());
}

export function storageKey(manifest, annotatorId) {
  return [
    "validsyn",
    manifest.bundle_id,
    manifest.bundle_version,
    manifest.assignment_id,
    annotatorId,
  ].join("::");
}

export function utf16ToCodePointOffset(text, utf16Offset) {
  if (!Number.isInteger(utf16Offset) || utf16Offset < 0 || utf16Offset > text.length) {
    throw new RangeError(`Invalid UTF-16 offset: ${utf16Offset}`);
  }
  return Array.from(text.slice(0, utf16Offset)).length;
}

export function codePointSlice(text, start, end) {
  return Array.from(text).slice(start, end).join("");
}

export function exportAnchor(text, snippet, startUtf16, endUtf16) {
  if (!snippet || !Number.isInteger(startUtf16) || !Number.isInteger(endUtf16)) {
    throw new Error("Anchor is incomplete");
  }
  if (startUtf16 < 0 || endUtf16 < startUtf16 || endUtf16 > text.length) {
    throw new Error("Anchor UTF-16 offsets are outside the policy");
  }
  if (text.slice(startUtf16, endUtf16) !== snippet) {
    throw new Error("Anchor text no longer matches the canonical policy");
  }
  const start = utf16ToCodePointOffset(text, startUtf16);
  const end = utf16ToCodePointOffset(text, endUtf16);
  if (codePointSlice(text, start, end) !== snippet) {
    throw new Error("Unicode code-point offset verification failed");
  }
  return { start, end };
}

export function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function utcStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
