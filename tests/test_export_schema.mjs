import assert from "node:assert/strict";
import { CSV_COLUMNS, csvCell } from "../assets/js/core.js";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

assert.equal(CSV_COLUMNS.length, 37);
assert.equal(CSV_COLUMNS[CSV_COLUMNS.indexOf("candidate_id") + 1], "candidate_outcome");
assert.equal(CSV_COLUMNS.includes("op_type"), true);
assert.equal(CSV_COLUMNS.includes("placement_mode"), false);
assert.equal(CSV_COLUMNS.includes("webform_evidence"), true);

const sample = Object.fromEntries(CSV_COLUMNS.map((column) => [column, ""]));
Object.assign(sample, {
  bundle_id: "VALID-syn-calibration",
  policy_id: "VALID-RAW-043",
  candidate_id: "VALID-RAW-043__SO-1",
  candidate_outcome: "CREATED",
  op_index: 1,
  op_type: "MODIFY",
  before_snippet: 'Name, email, and "phone"',
  after_snippet: "Name and phone\nremain disclosed.",
  webform_evidence: "VALID-RAW-043-F1-S0-FULL",
});
const sampleSecondOperation = { ...sample, op_index: 2, op_type: "REMOVE", after_snippet: "" };
const cannotCreate = Object.fromEntries(CSV_COLUMNS.map((column) => [column, ""]));
Object.assign(cannotCreate, {
  bundle_id: "VALID-syn-calibration",
  policy_id: "VALID-RAW-043",
  violation_type: "ID",
  candidate_id: "VALID-RAW-043__ID-1",
  candidate_outcome: "CANNOT_CREATE",
  op_index: 0,
  explanations: "No honest standalone ID can be created.",
  data_category: "contact_data",
  specific_field: "Email",
  webform_evidence: "VALID-RAW-043-F1-S0-FULL",
});
const csv = [
  CSV_COLUMNS.map(csvCell).join(","),
  CSV_COLUMNS.map((column) => csvCell(sample[column])).join(","),
  CSV_COLUMNS.map((column) => csvCell(sampleSecondOperation[column])).join(","),
  CSV_COLUMNS.map((column) => csvCell(cannotCreate[column])).join(","),
].join("\r\n") + "\r\n";
const parsed = parseCsv(csv);

assert.equal(parsed.length, 4);
parsed.forEach((row) => assert.equal(row.length, CSV_COLUMNS.length));
assert.equal(parsed[1][CSV_COLUMNS.indexOf("before_snippet")], sample.before_snippet);
assert.equal(parsed[1][CSV_COLUMNS.indexOf("after_snippet")], sample.after_snippet);
assert.deepEqual(parsed.slice(1, 3).map((row) => row[CSV_COLUMNS.indexOf("op_index")]), ["1", "2"]);
assert.equal(parsed[3][CSV_COLUMNS.indexOf("candidate_outcome")], "CANNOT_CREATE");
assert.equal(parsed[3][CSV_COLUMNS.indexOf("op_index")], "0");
assert.equal(parsed[3][CSV_COLUMNS.indexOf("synthetic_id")], "");
assert.equal(parsed[3][CSV_COLUMNS.indexOf("match_found")], "");

console.log(JSON.stringify({
  ok: true,
  columns: CSV_COLUMNS.length,
  rows: parsed.length - 1,
  op_type_present: true,
  redundant_mode_absent: true,
  candidate_outcome_present: true,
  quoted_multiline_round_trip: true,
  sequential_created_operations: true,
  cannot_create_metadata_row: true,
}, null, 2));
