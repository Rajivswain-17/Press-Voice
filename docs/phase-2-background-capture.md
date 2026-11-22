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
| Physical shortcut | The F8 probe armed and timed out without observing a physical keypress. Physical configured-shortcut-to-microphone operation remains pending. |

## Remaining checks and limits

- Test both modes with a physical shortcut and an ordinary foreground app. Confirm quick release and Escape. Verify the transcript from Settings afterward. Task 2E covers insertion.
- Physical device removal and Windows privacy revocation were not exercised. The code handles device-open errors, driver errors and packet stalls. Devices that reject direct 16 kHz mono PCM16 can use manual browser recording.
- Capture ownership covers one running Press instance. Other applications and independently launched Press instances are outside that lease.

## Reproduce

Build using the [README](../README.md). With Press stopped, run `node tests/windows-background-probe.mjs --infer` for a brief real-microphone check with controller-driven shortcut edges. The probe stores no audio on disk and reports duration, format and integration outcomes.

For the physical check, run `node tests/windows-background-probe.mjs --physical --infer`, focus Notepad and follow the F8 prompts. To verify your own binding, run Press normally and follow the [shortcut instructions](../README.md#build-and-try-shortcut-settings).
