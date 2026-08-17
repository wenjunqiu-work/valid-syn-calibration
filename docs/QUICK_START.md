# VALID-syn five-pair calibration quick start

1. Read the complete annotator instructions before beginning.
2. Enter your annotation name, then click **Start annotation**.
3. Review each website's exact frozen policy and its observed form screenshots.
4. Make one decision for each type: SO, PPM, ID, DLC, and GLC. Choose **CREATED** when you can construct the violation. Choose **CANNOT_CREATE** only when no valid standalone violation can be made from the available evidence without inventing an anchor, practice, or field.
5. A CREATED candidate starts with one edit operation using the reference default: SO begins with REMOVE; PPM, ID, DLC, and GLC begin with ADD. Add more legitimate operations when needed. Difficulty or multiple operations alone does not justify CANNOT_CREATE.
6. Every CANNOT_CREATE decision requires a data category and explanation. SO, PPM, and ID also require a real specific field and at least one screenshot reference; screenshot evidence remains optional for DLC and GLC.
7. Mark each type decision complete only after the validation check passes. Any later change, including switching its outcome, returns it to draft. Switching back to CREATED restores prior edit work.
8. Download JSON backups regularly. Working CSV contains all completed decisions so far; Final CSV unlocks only at 25 of 25. A CANNOT_CREATE decision appears as one metadata row with `op_index=0`; downstream policy assembly must use only `candidate_outcome=CREATED` rows.

Read the policy and find the disclosure statement(s) you need. You may use Ctrl+F (Windows/Linux) or Cmd+F (macOS). Then, highlight one snippet inside the canonical policy box, wait for the green “Selection ready” confirmation, and click the matching **Capture highlighted sentence(s) to remove, modify, or add** button on the right. The tool remembers that policy selection if clicking the button causes the browser highlight to disappear. For DLC and GLC, use **Capture highlighted conflicting statement** for the original statement the candidate will contradict.

The application stores work in the current browser. A downloaded JSON backup is the recovery mechanism for another browser or computer.
