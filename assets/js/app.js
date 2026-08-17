import {
  CSV_COLUMNS,
  csvCell,
  exportAnchor,
  isValidAnnotatorId,
  storageKey,
  utcStamp,
} from "./core.js?v=1.1.0-r2";
import {
  BACKUP_SCHEMA_VERSION,
  CANNOT_CREATE,
  CREATED,
  STATE_SCHEMA_VERSION,
  buildCannotCreateRow,
  candidateOutcome,
  decisionStats,
  decisionTarget,
  pairPolicyHashes,
  setCandidateOutcome,
  upgradeBackup,
  upgradeState,
  validateCandidateModel,
} from "./model.js?v=1.1.0-r2";

const TYPES = ["SO", "PPM", "ID", "DLC", "GLC"];
const TYPE_NAMES = {
  SO: "Silent Omission",
  PPM: "Practice–Policy Mismatch",
  ID: "Implicit Disclosure",
  DLC: "Direct Logical Contradiction",
  GLC: "Granular Logical Contradiction",
};
const TYPE_HINTS = {
  SO: "Start with a disclosed, visibly collected field, then remove every disclosure so the resulting policy becomes silent. Add one operation for each snippet that must change.",
  PPM: "Make the policy explicitly deny or understate a field that the screenshots show is collected. Tag the denial strategy.",
  ID: "Make the policy imply that it handles a collected field without explicitly stating collection. Anchor the operation to a specific policy sentence.",
  DLC: "Capture a real policy statement, then add or write its direct opposite about the same actor, data, and practice.",
  GLC: "Capture a real broad or specific policy statement, then add or write a conflict at the other level of granularity.",
};
const CATEGORIES = [
  "contact_data", "authentication_data", "personal_identity", "demographic_data",
  "financial_data", "location_data", "professional_data", "behavioral_data",
  "health_data", "biometric_data", "social_data",
];
const OPS_BY_TYPE = {
  SO: ["REMOVE", "MODIFY"],
  PPM: ["ADD", "MODIFY", "REMOVE"],
  ID: ["ADD", "MODIFY"],
  DLC: ["ADD", "MODIFY"],
  GLC: ["ADD", "MODIFY"],
};
const DEFAULT_OP = { SO: "REMOVE", PPM: "ADD", ID: "ADD", DLC: "ADD", GLC: "ADD" };
const BUCKETS = ["SAME_SECTION_BEFORE", "SAME_SECTION_AFTER", "DIFFERENT_RELEVANT_SECTION", "LATE_DOCUMENT_SECTION"];
const PPM_BUCKETS = ["DATA_COLLECTION_SECTION", "LATE_DOCUMENT_SECTION"];
const PPM_SUBSTRATEGIES = ["SPECIFIC_FIELD_DENIAL", "CATEGORY_LEVEL_DENIAL"];
const $ = (selector) => document.querySelector(selector);
const ASSET_REVISION = "1.1.0-r2";

function versionedUrl(path) {
  const url = new URL(path, import.meta.url);
  url.searchParams.set("v", ASSET_REVISION);
  return url;
}

const manifestUrl = versionedUrl("../../data/manifest.json");
const instructionsUrl = versionedUrl("../../docs/VALID-syn_annotator_instructions.md");
const assetUrl = (path) => versionedUrl(`../../${path}`).href;

let manifest = null;
let pairIndex = 0;
let activeType = "SO";
let annotatorId = "";
let state = null;
let currentPolicyText = "";
let policyCache = new Map();
let fieldLabelCounter = 0;
let lastPolicySelection = null;

function make(tag, options = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === "class") element.className = value;
    else if (key === "text") element.textContent = value;
    else if (key === "checked") element.checked = Boolean(value);
    else if (key === "value") element.value = value ?? "";
    else if (key === "disabled") element.disabled = Boolean(value);
    else element.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

function setGlobalStatus(message) {
  $("#globalStatus").textContent = message;
}

const ANNOTATION_NAME_PROMPT = "Enter your annotation name above then click Start annotation.";

function setAnnotationNameStatus(message, invalid = false) {
  const status = $("#annotationNameMessage");
  const input = $("#annotatorId");
  status.textContent = message;
  status.classList.toggle("invalid", Boolean(message) && invalid);
  input.setAttribute("aria-invalid", invalid ? "true" : "false");
}

function showCandidateMessage(message, kind = "") {
  const box = $("#candidateMessage");
  box.textContent = message;
  box.className = `message${message ? " visible" : ""}${kind ? ` ${kind}` : ""}`;
}

function freshState(id) {
  return {
    schema_version: STATE_SCHEMA_VERSION,
    bundle_id: manifest.bundle_id,
    bundle_version: manifest.bundle_version,
    assignment_id: manifest.assignment_id,
    batch_id: manifest.batch_id,
    annotator_id: id,
    updated_at: new Date().toISOString(),
    submitted_at: null,
    candidates: {},
  };
}

function loadState(id) {
  const key = storageKey(manifest, id);
  try {
    const current = localStorage.getItem(key);
    if (current) return upgradeState(JSON.parse(current), manifest, id, TYPES);
  } catch (_) {
    // Start a clean namespaced draft if a browser entry is malformed.
  }

  const legacyManifest = { ...manifest, bundle_version: "1.0.0" };
  const legacyKey = storageKey(legacyManifest, id);
  try {
    const legacy = localStorage.getItem(legacyKey);
    if (legacy) {
      const migrated = upgradeState(JSON.parse(legacy), manifest, id, TYPES);
      localStorage.setItem(key, JSON.stringify(migrated));
      return migrated;
    }
  } catch (_) {
    // Keep the legacy entry untouched and start clean if it cannot be migrated.
  }
  return freshState(id);
}

function saveState() {
  if (!isValidAnnotatorId(annotatorId) || !state) return;
  state.updated_at = new Date().toISOString();
  localStorage.setItem(storageKey(manifest, annotatorId), JSON.stringify(state));
}

function defaultOperation(type, opType = DEFAULT_OP[type]) {
  return {
    op_type: opType,
    before_snippet: "",
    after_snippet: "",
    start_utf16: -1,
    end_utf16: -1,
    location_bucket: opType === "ADD" ? bucketsFor(type)[0] : "",
    insertion_location_hint: "",
  };
}

function defaultCandidate(type) {
  return {
    violation_type: type,
    candidate_outcome: CREATED,
    data_category: "",
    specific_field: "",
    webform_evidence: [],
    ppm_substrategy: type === "PPM" ? PPM_SUBSTRATEGIES[0] : "",
    conflicting_phrase: "",
    conflict_start_utf16: -1,
    conflict_end_utf16: -1,
    edit_summary: "",
    accompanied_violation: "",
    notes_for_reviewer: "",
    explanations: "",
    operations: [defaultOperation(type)],
    operations_seeded: true,
    complete: false,
    completed_at: null,
  };
}

function pairState(policyId) {
  state.candidates[policyId] ||= {};
  return state.candidates[policyId];
}

function candidateFor(policyId, type) {
  const pair = pairState(policyId);
  pair[type] ||= defaultCandidate(type);
  pair[type].candidate_outcome = candidateOutcome(pair[type]);
  pair[type].operations ||= [];
  pair[type].webform_evidence ||= [];
  if (pair[type].candidate_outcome === CREATED && !pair[type].operations_seeded) {
    if (!pair[type].operations.length) pair[type].operations = [defaultOperation(type)];
    pair[type].operations_seeded = true;
  }
  if (pair[type].candidate_outcome === CREATED && (type === "DLC" || type === "GLC") && pair[type].operations.length !== 1) {
    pair[type].operations = [defaultOperation(type)];
  }
  return pair[type];
}

function currentPair() {
  return manifest.pairs[pairIndex];
}

function currentCandidate() {
  return candidateFor(currentPair().policy_id, activeType);
}

function bucketsFor(type) {
  return type === "PPM" ? PPM_BUCKETS : BUCKETS;
}

function modeFor(opType) {
  return opType === "ADD" ? "INSERT" : "REPLACE";
}

function markEdited(candidate) {
  if (candidate.complete) {
    candidate.complete = false;
    candidate.completed_at = null;
  }
  saveState();
  refreshProgress();
  renderCandidateTabs();
  updateCandidateState(candidate);
}

function completedCount() {
  return decisionStats(state, manifest, TYPES).complete;
}

function completedPairCount() {
  return manifest.pairs.filter((pair) => TYPES.every((type) => state.candidates[pair.policy_id]?.[type]?.complete)).length;
}

function refreshProgress() {
  const stats = decisionStats(state, manifest, TYPES);
  const { complete: completed, target } = stats;
  $("#progressText").textContent = `${completed} of ${target} type decisions complete · ${stats.created} created · ${stats.cannot_create} cannot create`;
  $("#pairProgressText").textContent = `${completedPairCount()} of ${manifest.expected_pair_count} pairs complete`;
  $("#progressFill").style.width = `${(completed / target) * 100}%`;
  $("#finalExportButton").disabled = completed !== target || !isValidAnnotatorId(annotatorId);
}

function updateCandidateState(candidate) {
  const badge = $("#candidateState");
  const outcomeLabel = candidateOutcome(candidate) === CANNOT_CREATE ? " · Cannot create" : "";
  badge.textContent = `${candidate.complete ? "Complete" : "Draft"}${outcomeLabel}`;
  badge.className = `candidate-state${candidate.complete ? " complete" : ""}`;
}

async function sha256Buffer(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Text(text) {
  if (!text) return "";
  return sha256Buffer(new TextEncoder().encode(text));
}

async function policyTextFor(pair) {
  if (policyCache.has(pair.policy_id)) return policyCache.get(pair.policy_id);
  const response = await fetch(assetUrl(pair.policy.path), { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${pair.policy_id} policy (${response.status})`);
  const bytes = await response.arrayBuffer();
  const actualHash = await sha256Buffer(bytes);
  if (actualHash !== pair.policy.sha256) throw new Error(`Policy hash verification failed for ${pair.policy_id}`);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  policyCache.set(pair.policy_id, text);
  return text;
}

function fieldDisplay(field) {
  return [field.label, field.aria_label, field.placeholder, field.name, field.field_id]
    .map((value) => String(value || "").trim())
    .find(Boolean) || "Unlabeled field";
}

function evidenceScreenshots(pair) {
  return pair.screenshots.filter((screenshot) => screenshot.kind !== "homepage");
}

function screenshotById(pair, screenshotId) {
  return pair.screenshots.find((screenshot) => screenshot.screenshot_id === screenshotId);
}

function screenshotCard(screenshot) {
  const button = make("button", { class: "screenshot-card", type: "button" });
  const image = make("img", {
    src: assetUrl(screenshot.path),
    alt: `${screenshot.kind.replaceAll("_", " ")} evidence for ${screenshot.form_type || currentPair().website}`,
    loading: "lazy",
  });
  const label = `${screenshot.screenshot_id} · ${screenshot.kind.replaceAll("_", " ")}`;
  button.append(image, make("span", { text: label }));
  button.addEventListener("click", () => openScreenshot(screenshot));
  return button;
}

function openScreenshot(screenshot) {
  $("#imageDialogTitle").textContent = screenshot.source_filename;
  $("#imageDialogMeta").textContent = screenshot.screenshot_id;
  $("#imageDialogImage").src = assetUrl(screenshot.path);
  $("#imageDialogImage").alt = `${screenshot.kind.replaceAll("_", " ")} screenshot for ${currentPair().website}`;
  $("#imageDialog").showModal();
}

function renderEvidence(pair) {
  const list = $("#formsList");
  list.replaceChildren();
  for (const form of pair.forms) {
    const group = make("section", { class: "form-group" });
    const title = make("h4", { text: `${form.form_type} form ${form.form_index}` });
    const link = form.page_url
      ? make("a", { href: form.page_url, target: "_blank", rel: "noreferrer", text: "Captured page ↗" })
      : make("span", { class: "muted", text: "Page URL unavailable" });
    group.append(make("div", { class: "form-group-header" }, title, link));

    const chips = make("div", { class: "field-chips" });
    form.fields.forEach((field) => {
      const display = fieldDisplay(field);
      const suffix = `${field.type || field.tag || "field"}${field.required ? " · required" : ""}`;
      chips.append(make("span", { class: "field-chip" }, make("strong", { text: display }), ` · ${suffix}`));
    });
    if (!form.fields.length) chips.append(make("span", { class: "muted", text: "No fields extracted; use the screenshot as ground truth." }));
    group.append(chips);

    const grid = make("div", { class: "screenshot-grid" });
    form.screenshot_ids.map((id) => screenshotById(pair, id)).filter(Boolean).forEach((shot) => grid.append(screenshotCard(shot)));
    if (!grid.children.length) grid.append(make("p", { class: "muted", text: "No screenshot was captured for this extracted form." }));
    group.append(grid);
    list.append(group);
  }

  const homepageGrid = $("#homepageScreenshots");
  homepageGrid.replaceChildren();
  pair.screenshots.filter((shot) => shot.kind === "homepage").forEach((shot) => homepageGrid.append(screenshotCard(shot)));
  $("#homepageContext").hidden = !homepageGrid.children.length;
  $("#evidenceCount").textContent = `${pair.forms.length} forms · ${pair.screenshots.length} images`;
}

async function renderPair() {
  const pair = currentPair();
  lastPolicySelection = null;
  updateSelectionStatus();
  setGlobalStatus(`Verifying ${pair.policy_id}…`);
  try {
    currentPolicyText = await policyTextFor(pair);
  } catch (error) {
    currentPolicyText = "";
    $("#policyText").textContent = error.message;
    setGlobalStatus(error.message);
    return;
  }

  $("#pairId").textContent = pair.policy_id;
  $("#pairWebsite").textContent = pair.website;
  $("#pairMeta").textContent = `${pair.primary_category} · ${pair.selection.form_complexity} form evidence · ${pair.policy.word_count.toLocaleString()} policy words`;
  $("#pairCounter").textContent = `${pairIndex + 1} / ${manifest.pairs.length}`;
  $("#previousPair").disabled = pairIndex === 0;
  $("#nextPair").disabled = pairIndex === manifest.pairs.length - 1;
  $("#policyHeading").textContent = pair.document_heading || "Privacy policy";
  $("#policyUrl").href = pair.policy_url;
  $("#policyText").textContent = currentPolicyText;
  renderEvidence(pair);
  renderCandidateTabs();
  renderCandidateForm();
  refreshProgress();
  setGlobalStatus(`Verified ${pair.policy_id} · policy SHA-256 ${pair.policy.sha256.slice(0, 12)}…`);
}

function renderCandidateTabs() {
  const tabs = $("#candidateTabs");
  tabs.replaceChildren();
  const pair = currentPair();
  TYPES.forEach((type) => {
    const candidate = candidateFor(pair.policy_id, type);
    const button = make("button", {
      class: `candidate-tab${activeType === type ? " active" : ""}${candidate.complete ? " complete" : ""}`,
      type: "button",
      role: "tab",
      "aria-selected": activeType === type ? "true" : "false",
      text: type,
    });
    button.addEventListener("click", () => {
      activeType = type;
      renderCandidateTabs();
      renderCandidateForm();
    });
    tabs.append(button);
  });
}

function labeledField(label, control) {
  const wrapper = make("div", { class: "field-label" });
  if (["INPUT", "SELECT", "TEXTAREA"].includes(control.tagName)) {
    control.id ||= `field-control-${++fieldLabelCounter}`;
    wrapper.append(make("label", { for: control.id, text: label }), control);
  } else {
    wrapper.append(make("span", { text: label }), control);
  }
  return wrapper;
}

function selectControl(options, value, includeBlank = false) {
  const select = make("select");
  if (includeBlank) select.append(make("option", { value: "", text: "— select —" }));
  options.forEach((option) => select.append(make("option", { value: option, text: option })));
  select.value = value || "";
  return select;
}

function bindDraftInput(control, candidate, fieldName, eventName = "input") {
  control.addEventListener(eventName, () => {
    candidate[fieldName] = control.value;
    markEdited(candidate);
    drawPreview();
  });
  return control;
}

function renderCandidateOutcome(container, candidate) {
  const fieldset = make("fieldset", { class: "outcome-fieldset" });
  fieldset.append(make("legend", { text: "Candidate outcome" }));
  const choices = make("div", { class: "outcome-choices" });
  [
    [CREATED, "CREATED", "Create a synthetic violation using the edit controls below."],
    [CANNOT_CREATE, "CANNOT_CREATE", "No valid standalone violation can be created without inventing evidence."],
  ].forEach(([value, title, description]) => {
    const radio = make("input", {
      type: "radio",
      name: `candidate-outcome-${currentPair().policy_id}-${activeType}`,
      value,
      checked: candidateOutcome(candidate) === value,
    });
    radio.addEventListener("change", () => {
      if (!radio.checked || !setCandidateOutcome(candidate, value)) return;
      markEdited(candidate);
      renderCandidateForm();
    });
    choices.append(make(
      "label",
      { class: "outcome-choice" },
      radio,
      make("span", {}, make("strong", { text: title }), make("span", { text: description })),
    ));
  });
  fieldset.append(choices);
  container.append(fieldset);
}

function renderCommonFields(container, pair, candidate) {
  const grid = make("div", { class: "form-grid" });
  const category = selectControl(CATEGORIES, candidate.data_category, true);
  category.addEventListener("change", () => {
    candidate.data_category = category.value;
    markEdited(candidate);
  });

  const datalistId = `field-options-${pair.policy_id}`;
  const specific = make("input", {
    value: candidate.specific_field,
    list: datalistId,
    placeholder: "Exact visible field, e.g. Email address",
  });
  bindDraftInput(specific, candidate, "specific_field");
  const datalist = make("datalist", { id: datalistId });
  const fieldNames = new Set(pair.forms.flatMap((form) => form.fields.map(fieldDisplay)));
  fieldNames.forEach((name) => datalist.append(make("option", { value: name })));

  grid.append(labeledField("Data category", category));
  const groundedType = ["SO", "PPM", "ID"].includes(activeType);
  const showGrounding = candidateOutcome(candidate) === CREATED || groundedType;
  if (showGrounding) grid.append(labeledField("Specific field", specific));
  container.append(grid);
  if (showGrounding) container.append(datalist);

  if (showGrounding) {
    const checks = make("div", { class: "evidence-checks" });
    evidenceScreenshots(pair).forEach((screenshot) => {
      const checkbox = make("input", {
        type: "checkbox",
        value: screenshot.screenshot_id,
        checked: candidate.webform_evidence.includes(screenshot.screenshot_id),
      });
      checkbox.addEventListener("change", () => {
        const selected = new Set(candidate.webform_evidence);
        if (checkbox.checked) selected.add(screenshot.screenshot_id);
        else selected.delete(screenshot.screenshot_id);
        candidate.webform_evidence = Array.from(selected);
        markEdited(candidate);
      });
      checks.append(make("label", { class: "evidence-check" }, checkbox, make("span", { text: `${screenshot.screenshot_id} · ${screenshot.source_filename}` })));
    });
    const requirement = groundedType ? "required" : "optional";
    container.append(labeledField(`Webform screenshot evidence (${requirement})`, checks));
  }

  if (activeType === "PPM" && candidateOutcome(candidate) === CREATED) {
    const strategy = selectControl(PPM_SUBSTRATEGIES, candidate.ppm_substrategy);
    strategy.addEventListener("change", () => {
      candidate.ppm_substrategy = strategy.value;
      markEdited(candidate);
    });
    container.append(labeledField("PPM sub-strategy", strategy));
  }
}

function updateSelectionStatus() {
  const status = $("#selectionStatus");
  if (!status) return;
  status.textContent = lastPolicySelection
    ? `Selection ready: ${lastPolicySelection.text.length.toLocaleString()} characters.`
    : "No policy text selected.";
}

function currentPolicySelection() {
  const policy = $("#policyText");
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!policy.contains(range.startContainer) || !policy.contains(range.endContainer)) return null;
  const beforeStart = document.createRange();
  beforeStart.selectNodeContents(policy);
  beforeStart.setEnd(range.startContainer, range.startOffset);
  const beforeEnd = document.createRange();
  beforeEnd.selectNodeContents(policy);
  beforeEnd.setEnd(range.endContainer, range.endOffset);
  const start = beforeStart.toString().length;
  const end = beforeEnd.toString().length;
  const text = currentPolicyText.slice(start, end);
  if (!text.trim()) return null;
  return { text, start, end };
}

function rememberPolicySelection() {
  const selected = currentPolicySelection();
  if (!selected) return;
  lastPolicySelection = selected;
  updateSelectionStatus();
}

function captureSelection() {
  rememberPolicySelection();
  if (!lastPolicySelection) {
    showCandidateMessage("Highlight text inside the canonical policy box first. The selection indicator above the policy will confirm when it is ready.", "error");
    return null;
  }
  return { ...lastPolicySelection };
}

function capturedBlock(text, start, end, emptyMessage) {
  const wrapper = make("div");
  wrapper.append(make("div", { class: "captured-snippet", text: text || emptyMessage }));
  wrapper.append(make("div", {
    class: "offset-copy",
    text: start >= 0 ? `Browser span [${start}:${end}] · converted to Unicode code points at export` : "No anchor captured",
  }));
  return wrapper;
}

function syncContradictionAdd(candidate, operation) {
  if (operation.op_type !== "ADD") return;
  operation.before_snippet = candidate.conflicting_phrase;
  operation.start_utf16 = candidate.conflict_start_utf16;
  operation.end_utf16 = candidate.conflict_end_utf16;
  operation.location_bucket ||= "SAME_SECTION_AFTER";
}

function addLocationControls(card, candidate, operation) {
  const locationGrid = make("div", { class: "form-grid" });
  const buckets = bucketsFor(activeType);
  if (!buckets.includes(operation.location_bucket)) operation.location_bucket = buckets[0];
  const bucket = selectControl(buckets, operation.location_bucket);
  bucket.addEventListener("change", () => {
    operation.location_bucket = bucket.value;
    markEdited(candidate);
  });
  const hint = make("input", { value: operation.insertion_location_hint, placeholder: "e.g. Information We Collect" });
  hint.addEventListener("input", () => {
    operation.insertion_location_hint = hint.value;
    markEdited(candidate);
  });
  locationGrid.append(labeledField("Location bucket", bucket), labeledField("Insertion location hint", hint));
  card.append(locationGrid);
}

function renderContradictionForm(container, candidate) {
  const operation = candidate.operations[0] || defaultOperation(activeType);
  candidate.operations = [operation];
  syncContradictionAdd(candidate, operation);

  const captureConflict = make("button", { class: "button secondary small", type: "button", text: "Capture highlighted conflicting statement" });
  captureConflict.addEventListener("click", () => {
    const selected = captureSelection();
    if (!selected) return;
    candidate.conflicting_phrase = selected.text;
    candidate.conflict_start_utf16 = selected.start;
    candidate.conflict_end_utf16 = selected.end;
    syncContradictionAdd(candidate, operation);
    markEdited(candidate);
    renderCandidateForm();
    showCandidateMessage("Captured the conflicting policy statement.", "success");
  });
  container.append(labeledField("Conflicting phrase", captureConflict));
  container.append(capturedBlock(
    candidate.conflicting_phrase,
    candidate.conflict_start_utf16,
    candidate.conflict_end_utf16,
    "Highlight the real statement that the candidate will contradict.",
  ));

  const opType = selectControl(OPS_BY_TYPE[activeType], operation.op_type);
  opType.addEventListener("change", () => {
    const next = defaultOperation(activeType, opType.value);
    if (next.op_type === "ADD") syncContradictionAdd(candidate, next);
    candidate.operations = [next];
    markEdited(candidate);
    renderCandidateForm();
  });
  container.append(labeledField("Operation", opType));

  if (operation.op_type === "MODIFY") {
    const captureBefore = make("button", { class: "button secondary small", type: "button", text: "Capture highlighted sentence(s) to modify" });
    captureBefore.addEventListener("click", () => {
      const selected = captureSelection();
      if (!selected) return;
      operation.before_snippet = selected.text;
      operation.after_snippet ||= selected.text;
      operation.start_utf16 = selected.start;
      operation.end_utf16 = selected.end;
      markEdited(candidate);
      renderCandidateForm();
      showCandidateMessage("Captured the sentence to modify.", "success");
    });
    container.append(labeledField("Sentence to modify", captureBefore));
    container.append(capturedBlock(operation.before_snippet, operation.start_utf16, operation.end_utf16, "No modification anchor captured."));
  }

  const after = make("textarea", {
    text: operation.after_snippet,
    placeholder: operation.op_type === "ADD" ? "New contradictory statement" : "Rewritten contradictory sentence",
  });
  after.value = operation.after_snippet;
  after.addEventListener("input", () => {
    operation.after_snippet = after.value;
    markEdited(candidate);
    drawPreview();
  });
  container.append(labeledField(operation.op_type === "ADD" ? "New snippet" : "After snippet", after));
  if (operation.op_type === "ADD") addLocationControls(container, candidate, operation);
}

function renderOperations(container, candidate) {
  const heading = make("div", { class: "operations-heading" }, make("h4", { text: "Edit operations" }));
  const addButton = make("button", { class: "button ghost small", type: "button", text: "+ Add empty operation" });
  addButton.addEventListener("click", () => {
    candidate.operations.push(defaultOperation(activeType));
    markEdited(candidate);
    renderCandidateForm();
  });
  heading.append(addButton);
  container.append(heading);

  if (!candidate.operations.length) {
    container.append(make("p", { class: "muted", text: "No operations yet. Add an empty operation, then highlight policy text and use its capture button." }));
    return;
  }

  candidate.operations.forEach((operation, index) => {
    const card = make("section", { class: "operation-card" });
    const opType = selectControl(OPS_BY_TYPE[activeType], operation.op_type);
    opType.addEventListener("change", () => {
      const oldBefore = operation.before_snippet;
      const oldStart = operation.start_utf16;
      const oldEnd = operation.end_utf16;
      operation.op_type = opType.value;
      operation.location_bucket = operation.op_type === "ADD" ? bucketsFor(activeType)[0] : "";
      if (operation.op_type === "REMOVE") operation.after_snippet = "";
      if (operation.op_type === "MODIFY" && !operation.after_snippet) operation.after_snippet = oldBefore;
      operation.before_snippet = oldBefore;
      operation.start_utf16 = oldStart;
      operation.end_utf16 = oldEnd;
      markEdited(candidate);
      renderCandidateForm();
    });
    const remove = make("button", { class: "button danger-ghost small", type: "button", text: "Remove" });
    remove.addEventListener("click", () => {
      candidate.operations.splice(index, 1);
      markEdited(candidate);
      renderCandidateForm();
    });
    const head = make(
      "div",
      { class: "operation-head" },
      make("span", { class: "operation-number", text: `Op ${index + 1}` }),
      opType,
      make("span", { class: "operation-mode", text: modeFor(operation.op_type) }),
      make("span", { class: "operation-spacer" }),
      remove,
    );
    card.append(head);

    const capture = make("button", {
      class: "button secondary small",
      type: "button",
      text: `Capture highlighted sentence(s) to ${operation.op_type.toLowerCase()}`,
    });
    capture.addEventListener("click", () => {
      const selected = captureSelection();
      if (!selected) return;
      operation.before_snippet = selected.text;
      operation.start_utf16 = selected.start;
      operation.end_utf16 = selected.end;
      if (operation.op_type === "MODIFY" && !operation.after_snippet) operation.after_snippet = selected.text;
      markEdited(candidate);
      renderCandidateForm();
      showCandidateMessage("Captured the policy anchor.", "success");
    });
    card.append(capture);
    card.append(capturedBlock(operation.before_snippet, operation.start_utf16, operation.end_utf16, "No policy anchor captured."));

    if (operation.op_type !== "REMOVE") {
      const after = make("textarea", {
        placeholder: operation.op_type === "ADD" ? "New text to insert beside the anchor" : "Replacement text",
      });
      after.value = operation.after_snippet;
      after.addEventListener("input", () => {
        operation.after_snippet = after.value;
        markEdited(candidate);
        drawPreview();
      });
      card.append(labeledField("After snippet", after));
    } else {
      card.append(make("p", { class: "muted", text: "REMOVE deletes the captured text; after_snippet remains empty." }));
    }
    if (operation.op_type === "ADD") addLocationControls(card, candidate, operation);
    container.append(card);
  });
}

function renderSharedMetadata(container, candidate) {
  const grid = make("div", { class: "form-grid" });
  const accompanied = make("input", { value: candidate.accompanied_violation, placeholder: "e.g. PPM, or blank" });
  bindDraftInput(accompanied, candidate, "accompanied_violation");
  const summary = make("input", { value: candidate.edit_summary, placeholder: "Short description of the candidate" });
  bindDraftInput(summary, candidate, "edit_summary");
  grid.append(labeledField("Accompanied violation", accompanied), labeledField("Edit summary", summary));
  container.append(grid);

  const notesOptions = ["", "the edit(s) unavoidably result in multiple violations", "others"];
  const notes = selectControl(notesOptions, candidate.notes_for_reviewer);
  notes.options[0].textContent = "— select if needed —";
  notes.addEventListener("change", () => {
    candidate.notes_for_reviewer = notes.value;
    markEdited(candidate);
  });
  const explanations = make("textarea", { placeholder: "Optional explanation or reviewer note" });
  explanations.value = candidate.explanations;
  bindDraftInput(explanations, candidate, "explanations");
  container.append(labeledField("Notes for reviewer", notes), labeledField("Explanation", explanations));
}

function renderCannotCreateFields(container, candidate) {
  container.append(make(
    "div",
    { class: "cannot-create-notice" },
    make("strong", { text: "No synthetic edit will be generated." }),
    "Use this exceptional outcome only when a valid standalone violation cannot be created from the available policy and webform evidence. Difficulty or the need for multiple legitimate operations is not enough.",
  ));
  const explanation = make("textarea", {
    placeholder: "Required: explain why this violation type cannot be created without inventing evidence",
  });
  explanation.value = candidate.explanations;
  bindDraftInput(explanation, candidate, "explanations");
  container.append(labeledField("Why this type cannot be created (required)", explanation));
}

function renderCandidateForm() {
  const pair = currentPair();
  const candidate = currentCandidate();
  $("#candidateLabel").textContent = `${pair.policy_id} · ${activeType}`;
  $("#candidateTitle").textContent = TYPE_NAMES[activeType];
  $("#candidateHint").textContent = TYPE_HINTS[activeType];
  updateCandidateState(candidate);
  showCandidateMessage("");

  const form = $("#candidateForm");
  form.replaceChildren();
  renderCandidateOutcome(form, candidate);
  renderCommonFields(form, pair, candidate);
  if (candidateOutcome(candidate) === CANNOT_CREATE) {
    renderCannotCreateFields(form, candidate);
    $("#previewPanel").hidden = true;
  } else {
    if (activeType === "DLC" || activeType === "GLC") renderContradictionForm(form, candidate);
    else renderOperations(form, candidate);
    renderSharedMetadata(form, candidate);
    $("#previewPanel").hidden = false;
    drawPreview();
  }

  const enabled = isValidAnnotatorId(annotatorId) && Boolean(currentPolicyText);
  form.querySelectorAll("input,select,textarea,button").forEach((control) => { control.disabled = !enabled; });
  $("#completeCandidate").disabled = !enabled;
  $("#clearCandidate").disabled = !enabled;
}

function drawPreview() {
  const preview = $("#operationPreview");
  preview.replaceChildren();
  const candidate = currentCandidate();
  const operations = candidate.operations.filter((operation) => operation.before_snippet || operation.op_type === "ADD");
  if (!operations.length) {
    preview.append(make("span", { class: "muted", text: "Add an operation to preview it." }));
    return;
  }
  operations.forEach((operation) => {
    const block = make("div", { class: "preview-operation" });
    block.append(make("span", { class: "preview-tag", text: operation.op_type }));
    const start = operation.start_utf16;
    const end = operation.end_utf16;
    if (start >= 0) block.append(document.createTextNode(`…${currentPolicyText.slice(Math.max(0, start - 90), start)}`));
    if (operation.op_type === "REMOVE") block.append(make("span", { class: "preview-delete", text: operation.before_snippet }));
    if (operation.op_type === "MODIFY") {
      block.append(make("span", { class: "preview-delete", text: operation.before_snippet }));
      block.append(make("span", { class: "preview-insert", text: operation.after_snippet }));
    }
    if (operation.op_type === "ADD") {
      block.append(make("span", { class: "preview-anchor", text: operation.before_snippet || "(anchor)" }));
      block.append(document.createTextNode(" "));
      block.append(make("span", { class: "preview-insert", text: operation.after_snippet }));
    }
    if (start >= 0) block.append(document.createTextNode(`${currentPolicyText.slice(end, end + 90)}…`));
    preview.append(block);
  });
}

function validateAnchorForOperation(text, operation) {
  try {
    exportAnchor(text, operation.before_snippet, operation.start_utf16, operation.end_utf16);
    return null;
  } catch (error) {
    return error.message;
  }
}

function validateCandidate(pair, type, candidate, policyText) {
  if (candidateOutcome(candidate) === CREATED && (type === "DLC" || type === "GLC")) {
    const operation = candidate.operations[0];
    if (operation?.op_type === "ADD") syncContradictionAdd(candidate, operation);
  }
  return validateCandidateModel({
    pair,
    type,
    candidate,
    allowedOperations: OPS_BY_TYPE[type],
    allowedBuckets: bucketsFor(type),
    ppmSubstrategies: PPM_SUBSTRATEGIES,
    validateAnchor: (snippet, start, end) => validateAnchorForOperation(policyText, {
      before_snippet: snippet,
      start_utf16: start,
      end_utf16: end,
    }),
  });
}

async function completeCurrentCandidate() {
  if (!isValidAnnotatorId(annotatorId)) {
    setAnnotationNameStatus("Enter a valid annotation name first.", true);
    return;
  }
  const pair = currentPair();
  const candidate = currentCandidate();
  const errors = validateCandidate(pair, activeType, candidate, currentPolicyText);
  if (errors.length) {
    showCandidateMessage(`Cannot complete: ${errors.join(" ")}`, "error");
    return;
  }
  candidate.complete = true;
  candidate.completed_at = new Date().toISOString();
  saveState();
  renderCandidateTabs();
  updateCandidateState(candidate);
  refreshProgress();
  const outcome = candidateOutcome(candidate) === CANNOT_CREATE ? "CANNOT_CREATE" : "CREATED";
  showCandidateMessage(`${activeType} decision is complete as ${outcome} for ${pair.policy_id}.`, "success");
}

function activateAnnotator(value) {
  const next = value.trim();
  if (!isValidAnnotatorId(next)) {
    annotatorId = "";
    state = freshState("");
    setAnnotationNameStatus(next ? "Annotation name must be 2–32 letters, numbers, underscores, or hyphens." : ANNOTATION_NAME_PROMPT, true);
    renderCandidateTabs();
    renderCandidateForm();
    refreshProgress();
    return;
  }
  annotatorId = next;
  localStorage.setItem("validsyn::last-annotator", annotatorId);
  state = loadState(annotatorId);
  renderCandidateTabs();
  renderCandidateForm();
  refreshProgress();
  setAnnotationNameStatus("");
  setGlobalStatus(`Local autosave active for annotation name ${annotatorId}.`);
}

function downloadBlob(blob, filename) {
  const anchor = make("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.append(anchor);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  anchor.remove();
}

function backupDraft() {
  if (!isValidAnnotatorId(annotatorId)) {
    setAnnotationNameStatus("Enter a valid annotation name before downloading a backup.", true);
    return;
  }
  const backup = {
    backup_schema_version: BACKUP_SCHEMA_VERSION,
    bundle_id: manifest.bundle_id,
    bundle_version: manifest.bundle_version,
    assignment_id: manifest.assignment_id,
    batch_id: manifest.batch_id,
    annotator_id: annotatorId,
    pair_policy_hashes: pairPolicyHashes(manifest),
    exported_at: new Date().toISOString(),
    state,
  };
  const filename = `VALID-syn_${manifest.batch_id}_author-${annotatorId}_v${manifest.bundle_version}_draft_${utcStamp()}.json`;
  downloadBlob(new Blob([JSON.stringify(backup, null, 2) + "\n"], { type: "application/json" }), filename);
  setGlobalStatus(`Downloaded recoverable draft backup for ${annotatorId}.`);
}

async function restoreDraft(file) {
  if (!isValidAnnotatorId(annotatorId)) throw new Error("Enter the annotation name for this backup before restoring it");
  const backup = upgradeBackup(JSON.parse(await file.text()), manifest, annotatorId, TYPES);
  state = backup.state;
  saveState();
  await renderPair();
  setGlobalStatus(`Restored draft backup for ${annotatorId}.`);
}

function candidateId(pairId, type) {
  return `${pairId}__${type}-1`;
}

async function buildCsv(status) {
  const rows = [];
  const invalid = [];
  let decisionTotal = 0;
  let createdTotal = 0;
  let cannotCreateTotal = 0;
  for (const pair of manifest.pairs) {
    let policyText = null;
    for (const type of TYPES) {
      const candidate = state.candidates[pair.policy_id]?.[type];
      if (!candidate?.complete) continue;
      if (candidateOutcome(candidate) === CREATED && policyText === null) policyText = await policyTextFor(pair);
      const errors = validateCandidate(pair, type, candidate, policyText || "");
      if (errors.length) {
        candidate.complete = false;
        candidate.completed_at = null;
        invalid.push(`${pair.policy_id} ${type}: ${errors.join(" ")}`);
        continue;
      }
      decisionTotal += 1;
      const identifier = candidateId(pair.policy_id, type);
      const base = {
        bundle_id: manifest.bundle_id,
        bundle_version: manifest.bundle_version,
        assignment_id: manifest.assignment_id,
        batch_id: manifest.batch_id,
        policy_id: pair.policy_id,
        source_file: pair.policy.source_filename,
        website: pair.website,
        url: pair.policy_url,
        violation_type: type,
        candidate_id: identifier,
        policy_sha256: pair.policy.sha256,
        author_id: annotatorId,
        status,
      };
      if (candidateOutcome(candidate) === CANNOT_CREATE) {
        rows.push(buildCannotCreateRow({ base, candidate, type }));
        cannotCreateTotal += 1;
        continue;
      }
      createdTotal += 1;
      for (let index = 0; index < candidate.operations.length; index += 1) {
        const operation = candidate.operations[index];
        let beforeSnippet = operation.before_snippet;
        let startUtf16 = operation.start_utf16;
        let endUtf16 = operation.end_utf16;
        if ((type === "DLC" || type === "GLC") && operation.op_type === "ADD") {
          beforeSnippet = candidate.conflicting_phrase;
          startUtf16 = candidate.conflict_start_utf16;
          endUtf16 = candidate.conflict_end_utf16;
        }
        const offsets = exportAnchor(policyText, beforeSnippet, startUtf16, endUtf16);
        const originalConflict = (type === "DLC" || type === "GLC")
          ? candidate.conflicting_phrase
          : type === "ID" ? candidate.operations[0]?.before_snippet || "" : "";
        rows.push({
          ...base,
          candidate_outcome: CREATED,
          synthetic_id: identifier,
          op_index: index + 1,
          op_type: operation.op_type,
          edit_summary: candidate.edit_summary,
          insertion_location_hint: operation.insertion_location_hint,
          notes_for_reviewer: candidate.notes_for_reviewer,
          explanations: candidate.explanations,
          before_snippet_sha256: await sha256Text(beforeSnippet),
          after_snippet_sha256: await sha256Text(operation.after_snippet),
          match_found: "True",
          match_start: offsets.start,
          match_end: offsets.end,
          before_snippet: beforeSnippet,
          after_snippet: operation.after_snippet,
          error: "",
          data_category: candidate.data_category,
          specific_field: candidate.specific_field,
          webform_evidence: candidate.webform_evidence.join(";"),
          ppm_substrategy: candidate.ppm_substrategy,
          conflicting_phrase: type === "DLC" || type === "GLC" ? candidate.conflicting_phrase : "",
          original_conflict_snippet: originalConflict,
          location_bucket: operation.location_bucket,
          accompanied_violation: candidate.accompanied_violation,
        });
      }
    }
  }
  if (invalid.length) {
    saveState();
    renderCandidateTabs();
    refreshProgress();
    throw new Error(`Export stopped because completed decisions failed revalidation: ${invalid.join(" | ")}`);
  }
  const csv = [CSV_COLUMNS.join(","), ...rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(","))].join("\r\n") + "\r\n";
  return { csv, rowCount: rows.length, decisionTotal, createdTotal, cannotCreateTotal };
}

async function exportCsv(finalSubmission) {
  if (!isValidAnnotatorId(annotatorId)) {
    setAnnotationNameStatus("Enter a valid annotation name before exporting.", true);
    return;
  }
  const completed = completedCount();
  const target = decisionTarget(manifest);
  if (!completed) {
    setGlobalStatus("No completed type decisions are available for the working CSV.");
    return;
  }
  if (finalSubmission && completed !== target) {
    setGlobalStatus(`Final CSV remains locked until all ${target} type decisions are complete.`);
    return;
  }
  try {
    setGlobalStatus("Revalidating completed decisions and preparing cumulative CSV…");
    const status = finalSubmission ? "submitted" : "draft";
    const result = await buildCsv(status);
    if (finalSubmission && result.decisionTotal !== target) throw new Error(`Final export contains ${result.decisionTotal}, not ${target}, type decisions`);
    const filename = `VALID-syn_${manifest.batch_id}_author-${annotatorId}_v${manifest.bundle_version}_${status}_${utcStamp()}.csv`;
    downloadBlob(new Blob([result.csv], { type: "text/csv;charset=utf-8" }), filename);
    if (finalSubmission) {
      state.submitted_at = new Date().toISOString();
      saveState();
    }
    setGlobalStatus(`Downloaded ${status} CSV: ${result.decisionTotal} decisions (${result.createdTotal} created, ${result.cannotCreateTotal} cannot create) across ${result.rowCount} CSV rows.`);
  } catch (error) {
    setGlobalStatus(error.message);
  }
}

async function boot() {
  try {
    const response = await fetch(manifestUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load calibration manifest (${response.status})`);
    manifest = await response.json();
    const expectedIds = ["VALID-RAW-043", "VALID-RAW-048", "VALID-RAW-003", "VALID-RAW-099", "VALID-RAW-005"];
    if (manifest.pairs.map((pair) => pair.policy_id).join("|") !== expectedIds.join("|")) throw new Error("Calibration manifest pair order is invalid");
    if (manifest.pairs.reduce((sum, pair) => sum + pair.screenshots.length, 0) !== 29) throw new Error("Calibration manifest screenshot count is invalid");

    $("#bundleLabel").textContent = `${manifest.assignment_id} · bundle ${manifest.bundle_version}`;
    const lastId = localStorage.getItem("validsyn::last-annotator") || "";
    $("#annotatorId").value = isValidAnnotatorId(lastId) ? lastId : "";
    annotatorId = isValidAnnotatorId(lastId) ? lastId : "";
    state = annotatorId ? loadState(annotatorId) : freshState("");
    $("#workspace").hidden = false;
    await renderPair();
    setAnnotationNameStatus(annotatorId ? "" : ANNOTATION_NAME_PROMPT);

  } catch (error) {
    setGlobalStatus(`Calibration failed to load: ${error.message}`);
  }
}

$("#annotatorId").addEventListener("change", (event) => activateAnnotator(event.target.value));
$("#annotatorId").addEventListener("input", (event) => {
  if (!manifest) return;
  if (event.target.value.trim() === annotatorId) return;
  annotatorId = "";
  state = freshState("");
  renderCandidateTabs();
  renderCandidateForm();
  refreshProgress();
  setAnnotationNameStatus(event.target.value.trim() ? "Click Start annotation to activate this annotation name." : ANNOTATION_NAME_PROMPT);
});
$("#annotatorId").addEventListener("keydown", (event) => {
  if (event.key === "Enter") activateAnnotator(event.target.value);
});
$("#activateAnnotatorButton").addEventListener("click", () => activateAnnotator($("#annotatorId").value));
document.addEventListener("selectionchange", rememberPolicySelection);
$("#previousPair").addEventListener("click", async () => {
  if (pairIndex > 0) { pairIndex -= 1; await renderPair(); }
});
$("#nextPair").addEventListener("click", async () => {
  if (pairIndex < manifest.pairs.length - 1) { pairIndex += 1; await renderPair(); }
});
$("#completeCandidate").addEventListener("click", completeCurrentCandidate);
$("#clearCandidate").addEventListener("click", () => {
  if (!confirm(`Clear the ${activeType} decision for ${currentPair().policy_id}? This cannot be undone unless you have a backup.`)) return;
  state.candidates[currentPair().policy_id][activeType] = defaultCandidate(activeType);
  saveState();
  renderCandidateTabs();
  renderCandidateForm();
  refreshProgress();
  showCandidateMessage("Decision cleared.", "success");
});
$("#backupButton").addEventListener("click", backupDraft);
$("#restoreButton").addEventListener("click", () => {
  if (!isValidAnnotatorId(annotatorId)) {
    setAnnotationNameStatus("Enter a valid annotation name before restoring a backup.", true);
    return;
  }
  $("#restoreInput").click();
});
$("#restoreInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try { await restoreDraft(file); }
  catch (error) { setGlobalStatus(`Draft restore failed: ${error.message}`); }
  event.target.value = "";
});
$("#workingExportButton").addEventListener("click", () => exportCsv(false));
$("#finalExportButton").addEventListener("click", () => exportCsv(true));
$("#instructionsButton").addEventListener("click", async () => {
  $("#instructionsDialog").showModal();
  if ($("#fullInstructions").dataset.loaded) return;
  try {
    const response = await fetch(instructionsUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    $("#fullInstructions").textContent = await response.text();
    $("#fullInstructions").dataset.loaded = "true";
  } catch (error) {
    $("#fullInstructions").textContent = `Could not load complete instructions: ${error.message}`;
  }
});
$("#closeInstructions").addEventListener("click", () => $("#instructionsDialog").close());
$("#closeImageDialog").addEventListener("click", () => $("#imageDialog").close());

boot();
