# Edge Case Hunter — Story 2.11 findings

6 findings (5 edge-case, 1 claim). Full schema: `findings-edge-case-hunter.json`.

1. **set_project_start** writes `dataDate` with no latest-actual-finish blockers (unlike `patch_data_date`).
2. **Re-set Project start** (settings) defaults `dataDate` to today and can clobber an advanced Data Date.
3. **dataDateBlockers** does not restrict to live leaf WPs — soft-deleted heads can block.
4. **Advance preview** date is frozen from server `thin.dataDate ?? proposedToday`, not the form’s chosen date.
5. **Finish set/clear** stays enabled with no Project start; fence then refuses on resolve (`projectStart` required).
6. **Claim (high):** acceptance “Data Date earlier than latest actual finish → refused with blockers” is falsified on the set-start path.
