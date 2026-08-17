# VALID-syn five-pair calibration quick start

1. Read the complete annotator instructions before beginning.
2. Enter your annotation name, then click **Start annotation**.
3. Review each website's exact frozen policy and its observed form screenshots.
4. Create one candidate for each type: SO, PPM, ID, DLC, and GLC.
5. Each candidate starts with one edit operation using the reference default: SO begins with REMOVE; PPM, ID, DLC, and GLC begin with ADD. Add more operations when needed. The target is 25 candidates, not 25 CSV rows.
6. SO, PPM, and ID require a specific collected field and at least one screenshot reference. Screenshot evidence is optional for DLC and GLC.
7. Mark each candidate complete only after the validation check passes. Any later change returns it to draft.
8. Download JSON backups regularly. Working CSV contains all completed candidates so far; Final CSV unlocks only at 25 of 25.

Read the policy and find the disclosure statement(s) you need. You may use Ctrl+F (Windows/Linux) or Cmd+F (macOS). Then, highlight one snippet inside the canonical policy box, wait for the green “Selection ready” confirmation, and click the matching **Capture highlighted sentence(s) to remove, modify, or add** button on the right. The tool remembers that policy selection if clicking the button causes the browser highlight to disappear. For DLC and GLC, use **Capture highlighted conflicting statement** for the original statement the candidate will contradict.

The application stores work in the current browser. A downloaded JSON backup is the recovery mechanism for another browser or computer.
