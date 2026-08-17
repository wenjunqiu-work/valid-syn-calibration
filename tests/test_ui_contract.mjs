import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../assets/js/app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../assets/css/app.css", import.meta.url), "utf8");
const quickStart = await readFile(new URL("../docs/QUICK_START.md", import.meta.url), "utf8");

assert.match(index, /id="activateAnnotatorButton"/);
assert.match(index, /For local testing, type TEST01/);
assert.match(index, /id="selectionStatus"/);
assert.match(app, /class: "locked-notice"/);
assert.match(app, /document\.addEventListener\("selectionchange", rememberPolicySelection\)/);
assert.match(app, /return \{ \.\.\.lastPolicySelection \}/);
assert.match(app, /operations: \[defaultOperation\(type\)\]/);
assert.match(app, /operations_seeded: true/);
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

console.log(JSON.stringify({
  ok: true,
  explicit_start_control: true,
  visible_test_code_help: true,
  locked_form_explanation: true,
  retained_policy_selection: true,
  initial_operation_visible: true,
  custom_find_removed: true,
  native_find_documented: true,
  operation_specific_capture_labels: true,
  contradiction_label_preserved: true,
}, null, 2));
