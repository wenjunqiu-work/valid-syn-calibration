import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../assets/js/app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../assets/css/app.css", import.meta.url), "utf8");
const quickStart = await readFile(new URL("../docs/QUICK_START.md", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

assert.match(index, /id="activateAnnotatorButton"/);
assert.match(index, /<label for="annotatorId">Annotation name<\/label>/);
assert.match(index, /placeholder="Enter your annotation name"/);
assert.doesNotMatch(index, /annotatorHelp|aria-describedby="annotatorHelp"/);
assert.match(index, /id="selectionStatus"/);
assert.match(app, /class: "locked-notice"/);
assert.match(app, /document\.addEventListener\("selectionchange", rememberPolicySelection\)/);
assert.match(app, /return \{ \.\.\.lastPolicySelection \}/);
assert.match(app, /operations: \[defaultOperation\(type\)\]/);
assert.match(app, /operations_seeded: true/);
assert.match(app, /localStorage\.setItem\(storageKey\(manifest, annotatorId\)/);
assert.match(app, /function backupDraft\(\)/);
assert.match(app, /async function restoreDraft\(file\)/);
assert.match(app, /async function exportCsv\(finalSubmission\)/);
assert.match(app, /annotator_id: annotatorId/);
assert.match(app, /author_id: annotatorId/);
assert.doesNotMatch(index, /policySearch|searchButton|searchCount|searchResults|Find a phrase or data type/);
assert.doesNotMatch(app, /runSearch|addOperationFromSearch|useSearchAsConflict|useSearchAsModification|policySearch|searchButton|searchCount|searchResults/);
assert.doesNotMatch(css, /search-row|search-results|search-result|result-actions/);
assert.match(index, /Ctrl\+F \(Windows\/Linux\) or Cmd\+F \(macOS\)/);
assert.ok(index.includes("Capture highlighted sentence(s) to remove, modify, or add"));
assert.ok(app.includes('text: `Capture highlighted sentence(s) to ${operation.op_type.toLowerCase()}`'));
assert.ok(app.includes('text: "Capture highlighted sentence(s) to modify"'));
assert.ok(app.includes('text: "Capture highlighted conflicting statement"'));
assert.match(quickStart, /Ctrl\+F \(Windows\/Linux\) or Cmd\+F \(macOS\)/);
assert.ok(quickStart.includes("Capture highlighted sentence(s) to remove, modify, or add"));

const obsoleteCodePhrases = [
  ["TEST", "01"].join(""),
  ["A", "01"].join(""),
  ["for local", " testing"].join(""),
  ["assigned", " code"].join(""),
  ["assigned", " annotator code"].join(""),
  ["pseudonymous", " code"].join(""),
  ["Do not enter your name", " or email"].join(""),
  ["names", " or email addresses"].join(""),
];
for (const content of [index, app, quickStart, readme]) {
  for (const phrase of obsoleteCodePhrases) assert.ok(!content.toLowerCase().includes(phrase.toLowerCase()));
}

console.log(JSON.stringify({
  ok: true,
  explicit_start_control: true,
  annotation_name_wording: true,
  test_code_help_removed: true,
  autosave_isolation_preserved: true,
  backup_restore_preserved: true,
  csv_export_preserved: true,
  locked_form_explanation: true,
  retained_policy_selection: true,
  initial_operation_visible: true,
  custom_find_removed: true,
  native_find_documented: true,
  operation_specific_capture_labels: true,
  contradiction_label_preserved: true,
}, null, 2));
