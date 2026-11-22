# Task 2E compatibility and physical verification

Phase 2 production is Copy-only in every application, including Notepad. The A → B → A experiment was INCONCLUSIVE and is closed. Automatic insertion is deferred to Phase 3. The remaining sections describe the historical Tier A investigation and its test-only harness.

The only automatic target in the experimental build was the packaged Microsoft Windows Notepad, file version 11.2607.14.0, with the verified Notepad / NotepadTextBox / RichEditD2DPT hierarchy. A matching version alone does not authorize an edit. Chrome, Edge, ChatGPT, WhatsApp Web, Codex, Zed, terminals, classic Edit controls and other versions use manual Copy. No clipboard paste or input simulation is present.

Step 0 verified one bounded selection replacement in a disposable modern Notepad tab, surrounding text, Undo and unchanged clipboard sequence. This was an investigation tool. Production physical verification is pending. The original transcript remains in Settings even after dispatch. A successful send reports delivery, without reading document text to confirm the edit. On uncertain delivery inspect the document before copying.

## Separately approved checks on disposable fixtures

Prepare two new unsaved tabs with distinct synthetic markers and a harmless known clipboard marker. Use a function-key shortcut first, then repeat the basic case with a supported Ctrl binding. Start each case with its own dictation, keep the settings tab closed, and inspect Settings only after dispatch or refusal. Record build, mode, observed text changes and outcome without logging private text.

| Case | User action | Required observation |
| --- | --- | --- |
| Caret | Hold to talk at a known caret, speak an English phrase, release | One insertion at the caret, surrounding text intact, no line break or submission |
| Selection and Undo | Select a known substring, dictate in toggle mode, stop, then Undo once | Only the selection changes and one Undo restores it |
| Unicode | Use a separately approved deterministic test transcript with accented and non-Latin symbols | Exact characters preserved; a speech recognition mismatch cannot verify transport |
| Clipboard | Compare clipboard sequence numbers before/after the edit, without reading clipboard data; avoid Copy until after checking | Same sequence; no clipboard write by Press |
| Focus | Switch to another disposable app during dictation; also switch away and back | Neither document changes, original transcript available for Copy |
| Tab and selection | Switch tabs in the same Notepad, including away and back; separately move the caret or change the selection | No edit in either tab or at the new selection |
| Unsupported or blocked | Start in a disposable browser field or terminal; test read-only/protected targets with synthetic data only | Copy fallback, no typing, clipboard write or execution |
| Escape and short audio | Cancel during capture and inference; try a recording shorter than half a second | No automatic edit; cancelled inference cannot deliver |
| Modifier overlap | Try ordinary Ctrl chords and Ctrl+click with a bare Ctrl binding | No insertion for the incidental action |

A target HWND binds delivery to a control. Windows offers no transaction that atomically checks a tab, selection, foreground state and edits a specific range. Posted accessibility notifications may be delayed or missing. A tab or selection change immediately after the final check remains a physical stress-test priority. Missing metadata, a changed stamp, a busy inspector or a version mismatch conservatively gives Copy. A timeout gives an unknown outcome and no automatic retry. Physical failures must be reviewed before acceptance.

## Physical Test 1 correction

The owner confirmed two deliberate Fn+F9 presses and observed the blank-audio marker between the brackets. The original test therefore provides no evidence of duplicate shortcut activation or incorrect placement. It confirmed that the previous build automatically inserted a non-speech marker. The local fix rejects marker-only output before dispatch. Silent and spoken retests use the opt-in diagnostics and require visible confirmation.

## Automated fixture verification

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/windows-target-policy.ps1` passed the native policy checks and six background pipeline scenarios. The speech scenario used the pinned JFK fixture and local Whisper. The other scenarios supplied deterministic Unicode, marker, empty, cancelled or unacknowledged results. The fixture executable used hidden child-owned Windows Edit controls, checked process lifetime and window ancestry, and exercised the production bounded sender. Caret insertion, selection replacement, exact surrounding text, Unicode, Undo, clipboard sequence, and changed-selection/read-only/password refusal passed on these controls. Snapshot tests cover target, generation and tab identity mismatches. The harness exercises the shared decision rules and sender; it does not exercise packaged Notepad's live UI Automation or event delivery. A real away-and-back tab switch during pending delivery remains unverified. No new recording test is needed for this gap.
