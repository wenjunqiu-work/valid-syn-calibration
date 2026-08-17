# VALID-syn Annotator Instructions 

This instruction is for human experts to use as a guide when creating the benchmark dataset VALID-syn. The below instructions show you how to manually craft privacy violations and insert to the original policy text. 



## 1. Task Description
In this task, you will be given 50 websites along with their privacy policies. For each website, you will be given

1. its privacy policy,
2. a list of pre-detected data that may be collected by this website, 
3. screenshot(s) for signup/registration/contact/subscription page(s). 

By definition, there are five types of privacy violations we focus on. Your task is to make one decision per type (a total of 5) for each policy-website pair. Normally, the outcome is `CREATED` and you generate the violation. In the exceptional case where no valid standalone violation can be created from the available evidence, use `CANNOT_CREATE` as described below.

To start the task, click on the given html file (or open it with your browser) and you will see the annotation tool. When constructing violations, please make use of the **observable evidence** (the policy text + the site's webform screenshots). The list of collected data is there to help you, but it is **NOT** 100% guranteed to be accurate, so please check against the webform screenshots to confirm. **Never from guesses about a company's back-end**.

 
## 2. The five violation types
For each type: **Definition (+ example) · How to construct (+ example) · Where to place it.**

### SO - Silent Omission
- **Definition.** The site collects data type *X* (that is visible in the webform) but the policy **never mentions or implies** *X* - it is simply silent. *Ex: the sign-up form has an Email field, but the policy never references email or contact-data collection.*
- **How to construct.** Start with a field *X* that is visibly collected in a webform screenshot and currently disclosed or implied somewhere in the original policy. Select its `data_category` and enter the exact screenshot field label in `specific_field`. Then remove every policy disclosure or implication of *X* so that the resulting synthetic policy is completely silent about it. Use **MODIFY** when a sentence mentions *X* together with other information and can remain coherent after the reference to *X* is removed. Use **REMOVE** when the entire sentence concerns *X*. Search the whole original policy and add one operation for every disclosure or implication that must change; leaving even one such reference means the SO candidate is incomplete.
- **Example:** given a website that collects user email, and the policy includes *"We collect your name, email, and password to create your account."* You could MODIFY this sentence to → *"We collect your name and password to create your account."*



### PPM - Practice-Policy Mismatch
- **Definition.** The site collects *X* but the policy **explicitly denies or understates** collecting it. *Ex: the registration form requests a VAT/tax number, but the policy says "we do not collect financial or personal identifiers." or "we do not collect tax numbers from users."*
- **How to construct.** Choose a collected field and ADD/MODIFY a statement that **denies or understates** it. Tag one **sub-strategy** in `ppm_substrategy`:
  - `SPECIFIC_FIELD_DENIAL` - deny the specific field ("we do not collect VAT or tax number").
  - `CATEGORY_LEVEL_DENIAL` - deny at category level ("we collect no financial or tax information").  
- **Placement.** select from the drop-down list for `location_bucket`, and fill in `insertion_location_hint` for additional indormation or notes, if needed. For ADD, you can capture the paragraph that you want to insert your new sentence in and use this as the *before_snippet*. The *after_snippet* will be this original paragraph with your sentence inserted to before/after/inbetween.   
 

### ID - Implicit Disclosure
- **Definition.** The policy's own wording **implies** it handles *X* - often via verbs like *protect, retain, secure, store, share, verify, authenticate, prevent fraud* - but **never states that X is collected**, while the site does collect *X*. *Ex: "Registration is limited to users aged 13 or older" implies age/date-of-birth is used, but the policy never discloses collecting a birthdate - and the form has a DOB field.*
- **How to construct.** Insert or modify a sentence so that the newly written text **presupposes collection of X through such a verb**, while making sure the policy never explicitly lists *X* as collected. The captured `before_snippet` is the real policy insertion or replacement anchor; the newly written implying sentence belongs in `after_snippet`. If no valid ID can be created from the available policy and webform evidence, select `candidate_outcome=CANNOT_CREATE` and explain why instead of fabricating an anchor or edit.
- **Placement.** Sections about **security, support, fraud prevention, analytics, payments, retention, or service operation**. Usually **INSERT**.
- **Example:** *add under Security "We take steps to protect the payment-card details you provide," while payment cards are never listed among collected data (and checkout collects a card).*
 

### DLC - Direct Logical Contradiction
- **Definition.** Two statements conflict about the **same data category, same actor (e.g. "we"/"our company"/"our website"), and same practice (i.e. collect)**. *Ex: "We do not collect health data" ↔ "We obtain health data during registration."*
- **How to construct.** Find a real statement in the policy - this is your **verbatim anchor** (`conflicting_phrase` **required, non-null**) - then insert/edit its **direct opposite** at the same granularity. *Ex: "We retain server logs for 90 days" → insert "We do not retain server logs."* The pair must **not** be re-expressible as broad/specific (that would be GLC).
- **Placement.** Usually near the anchor (**SAME_SECTION_BEFORE/AFTER**), but may sit in a different relevant section if still realistic.

### GLC - Granular Logical Contradiction
- **Definition.** A **broad** statement conflicts with a **narrower/specific** one (strict superset). *Ex: "We do not collect demographic information" ↔ "We collect your birthdate for age verification" (birthdate ⊂ demographic).*
- **How to construct.** Anchor to a real specific admission **or** broad denial (`conflicting_phrase` **required, non-null**), then add the conflicting statement at the **other** granularity. The broad statement must be true in a world **without** the specific practice. *Ex: policy admits "We collect your email address" → insert "We collect no contact information."*
- **Placement.** Near the anchor or a different relevant section.

### When a type cannot honestly be created
- `CREATED` is the default outcome. Use it whenever you can construct a valid candidate, including candidates that are difficult or require multiple legitimate edit operations.
- `CANNOT_CREATE` is an exceptional decision available for SO, PPM, ID, DLC, and GLC. Use it only when no valid standalone violation of that type can be created from the available policy and observable webform evidence without inventing an anchor, practice, or collected field.
- Every `CANNOT_CREATE` decision requires a `data_category` and a clear explanation of why the type is infeasible.
- For SO, PPM, and ID, also identify the real `specific_field` and select at least one valid webform screenshot. These fields show that the collection practice is real even though an honest synthetic edit cannot be created.
- For DLC and GLC, a specific field and screenshot are optional. Do not fabricate them when the infeasibility is entirely within the policy text.
- Do not add an edit operation, synthetic text, anchor, conflicting phrase, placement, or PPM sub-strategy for a `CANNOT_CREATE` decision. The tool exports one metadata-only row with `op_index=0`.

<!-- ### FN - Fragmented Notice
- **Definition.** A material disclosure of *X* exists **only on a separate surface** (help page, FAQ, tooltip, modal, regional or service-specific notice) that a user reaches through the **form/UI**, and the **main policy does not adequately integrate it** - so a user reading only the policy stays uninformed. **Not** a contradiction; **not** a pure omission (a separate surface must exist); **not** a proper cross-reference where the policy already summarizes the practice.
- **How to construct - write a short description.** Rather than authoring a full external notice, **describe how to build the fragmentation**. Your description **must include** these tagged components (the last one is optional):
  - `<data type>` - the collected data the fragmented disclosure is about (must be a real webform field).
  - `<screenshot file name>` - the existing webform screenshot showing where that data is collected / where the element is added.
  - `<fabricated element>` - the UI element you **add to that webform page** (a name/label + kind, e.g., a link named "Why we ask for your age") that links out to the separate surface.
  - `<linked content>` - a **short description** of the separate surface it links to (e.g., "a Help-Center article that explains age verification and retention"). No full text needed.
  - *(optional)* `<statements to be deleted in policy>` - verbatim existing policy statement(s) about the data type you remove so the main policy stays silent/under-integrated.
- **Template.** *"[Optional: First remove `<statements to be deleted in policy>` about `<data type>` from the privacy policy.] On the existing page where `<data type>` is collected (screenshot `<screenshot file name>`), add a fabricated element `<fabricated element>` that links to `<linked content>`."*
- **Example.** *"First remove any statements about age (data type: age) from the privacy policy. Then, on the existing sign-up page where age is required (screenshot `signup.jpg`), add a fabricated element named 'Why we ask for your age' that links to a Help-Center article explaining age verification and retention."*
- **Placement.** The fabricated element sits on the **webform page** next to the collected field; the disclosure lives **only** on the linked external surface. If you delete policy statements, that policy edit follows the normal removal rule: put the deleted statement in `before_snippet` (verbatim), leave `after_snippet` empty, and set `placement_mode = REPLACE`.
- **Grounding.** `<data type>` + `<screenshot file name>` must be a real collected field and a real captured screenshot. `conflicting_phrase = null`. -->

---

## 3. Disambiguation cheatsheet
- **DLC vs GLC:** Is the conflict purely a change in granularity (one statement is a strict superset)? **Yes → GLC, No → DLC.** DLC must not be re-expressible as general/specific; GLC needs a broader anchor that would be true without the specific practice.
- **Webform grounding for DLC/GLC:** Prefer a data type visible in the webform when the original policy contains a real statement about the same data and practice that can serve as the verbatim anchor. However, DLC and GLC do not have to correspond to a webform field. You may use a data type not shown in the webform if it appears in a real statement in the original policy and the contradiction is anchored to that statement.
- **PPM vs ID:** PPM is driven by **external evidence** (an observed webform field the policy denies/omits); ID is driven by the **policy's own implying language**. **If both apply → PPM** (stronger, verifiable). ID must be grounded in a specific implying sentence.
- **SO vs PPM vs ID:** policy is **silent** → SO; policy **denies/understates** → PPM; policy **implies but never states** → ID. All three are grounded in a real collected field.
<!-- - **FN vs SO:** FN requires a **separate disclosure surface reached via a fabricated element that links out from the webform**; SO has no such surface (nothing discloses it anywhere). -->

## 4. Placement mechanics
<!-- Choose one **location bucket** per edit:
| Bucket | Mode |
|---|---|
| `SAME_SENTENCE_OR_NEARBY` | REPLACE (edit the anchor in place) |
| `SAME_SECTION_BEFORE` | INSERT (new text before the anchor paragraph) |
| `SAME_SECTION_AFTER` | INSERT (new text after the anchor paragraph) |
| `DIFFERENT_RELEVANT_SECTION` | INSERT (another thematically related section) |
| `LATE_DOCUMENT_SECTION` | INSERT (miscellaneous / regional / children's / appendix / FAQ) |

- **REPLACE:** `after_snippet` replaces `before_snippet` in place.
- **INSERT:** `after_snippet` is **new** text placed next to `before_snippet`; it must **not** repeat or paraphrase the anchor, and `before_snippet` is left unmodified. -->
- **Controlled randomization:** don't always pick the closest plausible spot; vary buckets across candidates. 
- **Realism overrides diversity** - only choose a location that still looks natural. Don't invent headings the policy lacks; for short/unstructured policies prefer same sentence or nearby, or same section before/after.
<!-- 
## 5. The record you fill (one row per injection)
Use `VALID-syn_record_template.csv`. Fields (leave the **auto** ones blank - a script computes them):

**Identity:** `policy_id`, `website`, `url`, `source_file`
**Violation:** `violation_type` (SO/PPM/ID/DLC/GLC/FN), `candidate_id` (e.g. `SO-1`), `data_category` (+ specific field), `ppm_substrategy` (PPM only)
**Anchor & edit (verbatim where noted):** `conflicting_phrase` (verbatim; **required for DLC/GLC**, null OK for SO/PPM/ID/FN), `original_conflict_snippet` (verbatim anchor, 30–120 w), `before_snippet` (verbatim edit site, 30–120 w), `after_snippet` (REPLACE→edited text / INSERT→new text / SO→removed)
**Placement:** `location_bucket`, `placement_mode` (REPLACE/INSERT), `insertion_location_hint`
**FN-only:** `fn_construction_description` (the tagged narrative), `fn_data_type`, `fn_screenshot_file`, `fn_fabricated_element`, `fn_linked_content`, `fn_statements_to_delete` (optional - when non-empty, also mirror the deleted statement into `before_snippet` verbatim with an empty `after_snippet` and `placement_mode = REPLACE`)
**Evidence & meta:** `webform_evidence` (field name + screenshot ref), `edit_summary` (1–2 sentences), `accompanied_violation` (§7), `notes_for_reviewer`, `author_id`, `verifier_id`, `status`
**Auto (leave blank):** `synthetic_id`, `policy_sha256`, `before_snippet_sha256`, `after_snippet_sha256`, `match_found`, `match_start`, `match_end`, `error` -->


## 5. Violation Overlap

It is possible for one violation you create to overlap with another. For example, consider a website that collects email addresses during signup and whose privacy policy includes the statement *We collect your contact information, such as your email.* If you first create an SO violation for email by deleting the original email disclosure text, but later want to generate a DLC violation for email as well, according to the rule, you should add a new text snippet, *We do not collect users' email addresses.*, which contradicts the original collection statement.

This, however, creates a merging issue if you want to integrate both SO and DLC into the same policy, because SO requires the disclosure statement to be missing, while DLC requires the same disclosure statement to be present. We call this **Violation Overlap**. Please try to avoid such overlaps when generating violations.

In cases where an overlap is unavoidable, please fill in `accompanied_violation` with the name(s) of the overlapping violation(s). For example, specify `accompanied_violation=DLC` under the SO violation you created and `accompanied_violation=SO` under the DLC violation you created. If there is no overlap, leave `accompanied_violation` empty.

After each edit, scan the original policy for any possible overlaps. 

## 6. Global rules (all types)
- **Minimal & localized.** Edit or insert a single sentence / short snippet. Never rewrite the whole policy.
- You may need to edit **multiple snippets** for each violation, if the data is mentioned in multiple places. e.g. *we collect your email for registration.* and *To protect privacy, we store sensitive data such as user email on an encrypted cloud database...*.
- **One primary violation per edit.** If it unavoidably creates a *second* violation with existing text, keep it but **record it** in the `notes_for_reviewer`. 
- **Violation Overlap.** You should try to avoid violation overlaps, but in cases where overlaps happen, record in `accompanied_violation`. See Section 5 for more details. 
- **Copy anchors verbatim** from the exact policy snippet. Do not paraphrase or summarize the policy texts.
- **Data-category diversity.** Within the same violation type, don't reuse the same data category (email, phone, location, payment card, device ID, age…). Vary it across candidates. 
- **Spread edits** across the document; avoid stacking several in one paragraph.
- **Real.** Don't fabricate practices implausible for the domain (e.g., no biometric collection for a static blog). Keep the policy's tone, **modality** ("we may…"), terminology, and formatting. The result should **read like authentic policy language**. Never write "[VIOLATION]", "this contradicts", etc in the policy.
- Make sure to save the annotations by clicking the **Export CSV** button on the top right (See below).
- **Outcome-aware export.** Created candidates export one row per edit operation with `candidate_outcome=CREATED` and operation indexes beginning at 1. A `CANNOT_CREATE` decision exports exactly one metadata-only row with `candidate_outcome=CANNOT_CREATE`, `op_index=0`, and blank synthetic-edit and anchor fields. Any downstream assembler must apply only rows whose `candidate_outcome` is `CREATED`.

  ![alt text](image.png)

---


## 7. Do-not list 
- Don't invent site practices you can't see in the web form screenshot.
- Try not reuse the same `before_snippet` across many candidates.
- Try not to consult an LLM to write or check violations. 
