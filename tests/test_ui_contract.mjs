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
assert.doesNotMatch(index, /annotatorHelp/);
assert.match(index, /aria-describedby="annotationNameMessage" aria-invalid="false"/);
assert.match(index, /id="annotationNameMessage" role="status" aria-live="polite" aria-atomic="true"/);
assert.match(index, /id="globalStatus" role="status" aria-live="polite"><\/div>/);
const startGroupStart = index.indexOf('class="annotation-start-group"');
const startGroupEnd = index.indexOf('class="header-secondary-actions"');
const startGroup = index.slice(startGroupStart, startGroupEnd);
assert.ok(startGroupStart >= 0 && startGroupEnd > startGroupStart);
assert.ok(startGroup.indexOf('id="instructionsButton"') < startGroup.indexOf('id="annotatorId"'));
assert.ok(startGroup.indexOf('id="annotatorId"') < startGroup.indexOf('id="activateAnnotatorButton"'));
assert.ok(startGroup.indexOf('id="activateAnnotatorButton"') < startGroup.indexOf('id="annotationNameMessage"'));
assert.match(index, /id="selectionStatus"/);
assert.match(index, /id="previewPanel"/);
assert.match(index, /Mark decision complete/);
assert.match(index, /type decisions complete/);
assert.match(app, /function setAnnotationNameStatus\(message, invalid = false\)/);
assert.match(app, /setAnnotationNameStatus\(annotatorId \? "" : ANNOTATION_NAME_PROMPT\)/);
assert.doesNotMatch(app, /class: "locked-notice"|Annotation is locked/);
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
assert.match(app, /candidate_outcome: CREATED/);
assert.match(app, /buildCannotCreateRow/);
assert.match(app, /candidateOutcome\(candidate\) === CANNOT_CREATE/);
assert.match(app, /previewPanel"\)\.hidden = true/);
assert.match(app, /expected_decisions_per_pair|decisionTarget\(manifest\)/);
assert.match(app, /pair_policy_hashes: pairPolicyHashes\(manifest\)/);
assert.match(app, /upgradeBackup/);
assert.match(app, /upgradeState/);
assert.match(app, /localStorage\.getItem\(legacyKey\)/);
assert.match(app, /localStorage\.setItem\(key, JSON\.stringify\(migrated\)\)/);
assert.doesNotMatch(app, /removeItem\(legacyKey\)/);
assert.match(css, /@media \(max-width: 1040px\)/);
assert.match(css, /@media \(max-width: 700px\)/);
assert.match(css, /\.annotation-start-group/);
assert.match(css, /\.annotation-name-message\.invalid/);
assert.match(css, /\.header-secondary-actions/);
assert.doesNotMatch(css, /\.locked-notice/);
assert.match(css, /\.outcome-choices \{ grid-template-columns: 1fr; \}/);
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
  ["activate this", " code"].join(""),
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
  annotation_name_message_in_header: true,
  lower_locked_message_removed: true,
  retained_policy_selection: true,
  initial_operation_visible: true,
  custom_find_removed: true,
  native_find_documented: true,
  operation_specific_capture_labels: true,
  contradiction_label_preserved: true,
  cannot_create_outcome: true,
  decision_progress_wording: true,
  annotation_name_activation_wording: true,
  desktop_and_narrow_layout_contracts: true,
}, null, 2));
