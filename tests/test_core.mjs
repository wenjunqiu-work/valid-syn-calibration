import assert from "node:assert/strict";
import {
  codePointSlice,
  csvCell,
  exportAnchor,
  isValidAnnotatorId,
  storageKey,
  utf16ToCodePointOffset,
} from "../assets/js/core.js";

const policy = "Before 🎉 and after: We collect email addresses.";
const snippet = "We collect email addresses.";
const startUtf16 = policy.indexOf(snippet);
const endUtf16 = startUtf16 + snippet.length;
const exported = exportAnchor(policy, snippet, startUtf16, endUtf16);

assert.equal(exported.start, Array.from(policy.slice(0, startUtf16)).length);
assert.equal(exported.end, exported.start + Array.from(snippet).length);
assert.equal(codePointSlice(policy, exported.start, exported.end), snippet);
assert.equal(utf16ToCodePointOffset(policy, startUtf16), startUtf16 - 1, "emoji surrogate pair must reduce the exported offset by one");
assert.throws(() => exportAnchor(policy, "wrong", startUtf16, endUtf16), /no longer matches/);

assert.equal(csvCell("plain"), "plain");
assert.equal(csvCell('a,"b"\nline'), '"a,""b""\nline"');
assert.equal(isValidAnnotatorId("A01"), true);
assert.equal(isValidAnnotatorId("real name"), false);
assert.equal(isValidAnnotatorId("a@example.com"), false);

const key = storageKey({
  bundle_id: "VALID-syn-calibration",
  bundle_version: "1.1.0",
  assignment_id: "VALID-CAL-001",
}, "A01");
assert.equal(key, "validsyn::VALID-syn-calibration::1.1.0::VALID-CAL-001::A01");

console.log(JSON.stringify({ ok: true, unicode_offsets: exported, csv_quoting: true, annotator_validation: true }, null, 2));
