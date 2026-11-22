# Task 2D background capture evidence

## Built

- The Windows C# companion opens the default microphone with WinMM, collects native PCM packets on a worker thread, and stops at 60 seconds. It resets the stream and releases the device and buffers before returning a WAV or cancellation marker. A packet stall reports failure. Startup and stop watchdogs tear down an unresponsive owned companion.
- Node sends START, STOP and CANCEL through private stdin. Replies carry a session ID. A bounded Base64 line carries the completed 16 kHz mono PCM16 WAV. Both browser and native audio pass the same WAV validator and use the pinned local English Whisper session.
- The browser reserves the shared slot before requesting microphone access. Its same-origin response stream supplies a one-use upload token. Stop, cancellation and page exit release the reservation. If the browser disconnects during inference, the slot stays owned until inference settles.
- Settings shows the latest successful shortcut transcript and offers manual Copy. The Node process and companion must remain running for background capture.

## Verified on Windows

| Check | Evidence |
| --- | --- |
| Automated suite | 24 Node tests passed. Coverage includes same-origin leases, ownership, disconnect during inference, one-use uploads, native message identity and cancellation, and the prior Phase 1 tests. |
| Both modes, real microphone | Controller-driven Hold and Toggle captured 1.246 s each, 39,918 bytes per WAV. Header and data length matched 16 kHz mono PCM16. A separate WinForms window had focus before and after the captures. The probe opened no Press browser page. |
| Real local Whisper integration | Two further native recordings produced 1.235 s WAVs. The existing local Whisper server accepted both and returned text results. Speech accuracy was not benchmarked. |
| Stop and cancellation release | Reopened the endpoint after stopping and again after canceling. Cancellation published no audio. No probe-owned companion or Whisper process remained. |
| Browser regression | Chrome with the existing speech fixture as a simulated microphone acquired a lease, rejected the competing native session, and uploaded WAV to a stub transcriber. The lease released afterward. |
| Physical shortcut, earlier attempts (historical) | The initial F8 probe and the follow-up Left Ctrl probe each armed and timed out without observing a physical keypress. No audio was captured by either probe. A third Left Ctrl run on 2026-11-22 also timed out. Direct companion output then showed `CANCEL` for Escape but no `DOWN` or `UP` for Left Ctrl (see the phantom-key defect below). |
| Physical shortcut, after the fix | `node tests/windows-background-probe.mjs --physical` exited 0 on 2026-11-22 (15:01:10–15:01:38) on the owner's laptop, using a temporary in-memory Left Ctrl binding. **Hold to talk:** 1 press and 1 release, 6.579 s, 210,586 bytes. **Tap to toggle:** 2 presses and 2 releases, 11.283 s, 361,114 bytes. Both WAVs passed the 16 kHz mono PCM16 header and data-length checks, contained non-zero audio, and Notepad was the foreground window at activation and after capture. No companion, Whisper or key-listener process remained. No audio or transcript was stored. Saved shortcut settings were not touched. |
| Quick release (Hold, physical Left Ctrl) | A 0.28 s tap produced a 0.179 s, 5,786-byte WAV and the session finished idle. A second quick tap 0.44 s later behaved the same. The microphone opened again afterward. Observed with an instrumented in-memory script, not the shipped probe. |
| Escape during Hold (physical) | Escape pressed while Left Ctrl was held changed status to "Recording cancelled." within 1 ms. No audio was published. The later key release changed nothing, and the microphone reopened afterward. |
| Escape during Toggle (physical) | After one tap and about 6 s of recording, Escape cancelled the session. No audio was published and the microphone reopened afterward. |
| Transcript in Settings (owner-observed) | Press ran with `LOCALAPPDATA` set to a temporary folder, so saved settings were isolated. The owner saved Left Ctrl in Hold mode, dictated with the browser tab closed and read the result in Settings. A transcript of the spoken sentence appeared and the page reported 5 detected presses. The local Tiny English Q5 server ran as the Press child. The transcript misrecognized some proper nouns, consistent with the known model limit, and its text is not recorded here. The temporary folder and processes were removed afterward. After the test, no `settings.json` existed in the owner's real Press settings folder, and the temporary settings file was deleted with its folder. |

## Phantom multimedia-key defect and fix

- **Symptom.** Physical Left Ctrl and F8 never activated recording. Escape still produced `CANCEL`, so the hook was receiving real keys.
- **Cause.** At startup the listener copied every key that `GetAsyncKeyState` reported as down into its pressed set. On the owner's laptop Windows continuously reported VK 175 (Volume Up) and VK 179 (Media Play/Pause) as down, although no key was held. Those keys never produced a key-up, so they stayed in the set. Activation needs an exact match with the binding, so `{175, 179, 162}` never equalled `{162}`. Earlier native tests used controller-driven edges, so they could not reveal this.
- **Fix.** `native/windows/ShortcutListener.cs` now seeds the startup state only with modifier and function keys, using the existing `IsModifier` and `IsFunction` helpers. Live key tracking, exact-chord matching, the `HELD` check, repeat suppression and the Ctrl-plus-another-key cancellation are unchanged. A non-modifier key that is physically held at startup no longer affects activation.
- **Evidence.** A temporary diagnostic queried `GetAsyncKeyState` three times and reported `175 179` each time. No key-remapping software was found. After rebuilding the companion, raw output showed paired `DOWN` and `UP` events for Left Ctrl, and the physical probe passed.
- **Test limit.** There is no automated regression test. The condition depends on Windows reporting phantom key state, which the Node suite cannot simulate without a larger native test seam. The physical probe is the regression check on affected hardware.
- **Toggle probe note.** Two earlier toggle runs failed because the second Left Ctrl press was held longer than the probe's 3-second release window (raw events showed holds of about 4 and 8 seconds). The probe requires quick taps for toggle mode. That was test technique, not a listener defect.

## Remaining checks and limits

- Observed after the fix: both physical modes, quick release, Escape cancellation in both modes and the Settings transcript. Task 2E covers insertion.
- **NOT physically tested, not passed:** device removal and Windows microphone permission denial. Alternate sample rates on this machine were also not tested. Testing the first two needs changes to system microphone settings or hardware, which were not made. The owner accepted Task 2D locally with this gap. The code maps device-open failures to `MIC_UNAVAILABLE` or `MIC_FORMAT` and empty capture to `MIC_EMPTY`, but those paths have not been seen on hardware.
- **Possible shortcut interference, carried to Task 2F (root cause unconfirmed).** The Settings test reported 5 detected presses with a bare Left Ctrl binding. The listener's design would let ordinary Ctrl chords such as Ctrl+V trigger the shortcut, with the next key cancelling the recording. That is only a hypothesis, because the keys pressed during the test were not logged. The README already advises choosing a chord that is free in your apps.
- Physical device removal and Windows privacy revocation were not exercised. The code handles device-open errors, driver errors and packet stalls. Devices that reject direct 16 kHz mono PCM16 can use manual browser recording.
- Capture ownership covers one running Press instance. Other applications and independently launched Press instances are outside that lease.

## Reproduce

Build using the [README](../README.md). With Press stopped, run `node tests/windows-background-probe.mjs --infer` for a brief real-microphone check with controller-driven shortcut edges. The probe stores no audio on disk and reports duration, format and integration outcomes.

For the physical check, run `node tests/windows-background-probe.mjs --physical`, keep the Press settings tab closed, focus Notepad and follow the Left Ctrl prompts. In toggle mode, tap and release quickly both times. The probe uses a temporary binding and verifies the physical key edges, WAV, and Notepad focus near activation and after capture. It leaves saved Press settings alone. To verify your own binding, run Press normally and follow the [shortcut instructions](../README.md#build-and-try-shortcut-settings).
