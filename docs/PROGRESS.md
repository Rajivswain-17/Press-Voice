# Press progress

This file is the authoritative status record.

## Overall roadmap

| Phase | Objective | Status |
| --- | --- | --- |
| 1 | Record English speech, transcribe offline, display, edit and copy | Active |
| 2 | Configurable global shortcut | Roadmap only |
| 3 | Safe text insertion in supported apps | Roadmap only |
| 4 | Floating microphone overlay and reactive waveform | Roadmap only |
| 5 | Hindi, Hinglish and additional languages | Roadmap only |
| 6 | Optimization, settings, packaging and release | Roadmap only |

## Phase 1

| ID | Task | Dependencies | Status | Test results | Independent review |
| --- | --- | --- | --- | --- | --- |
| 1A | Pinned Windows engine proof and governance | None | Accepted | Fixture, hashes, timing, RAM, reuse, restart and loopback passed. The deferred disconnected-host check passed in 1E. | Engine and harness checks passed. |
| 1B | Microphone to validated WAV | 1A | Accepted | WAV and lifecycle tests passed. The owner recorded real speech and received a transcript. | Local implementation review completed. |
| 1C | Record, Stop, editable output and Copy | Shared recorder and HTTP contracts | Accepted | UI tests and Chrome's edited clipboard check passed. The owner confirmed paste to Notepad. | Local implementation review completed. |
| 1D | Node-managed server and local inference route | 1A, shared WAV and HTTP contracts | Accepted | HTTP and lifecycle tests passed. The pinned engine worked through the app and the test-owned child exited. | Local implementation review completed. |
| 1E | End-to-end integration and offline laptop demonstration | 1B, 1C, 1D | Accepted | The owner confirmed a fresh disconnected launch, physical microphone capture, transcription, manual editing and paste of the edited value into Notepad. | Local review and verification completed. |

Current count: 1 of 6 phases and 5 of 5 Phase 1 tasks accepted. All four implementation and verification branches were published to GitHub.

## 1E manual test evidence

- The owner launched Press, recorded their microphone, received a transcript and copied the text into Notepad.
- Spoken text: “Hey, I am texting press without any internet connection.”
- Generated text: “Hey, I am texting press without any love connection.”
- The output substituted “love” for “internet.” Preserve the pinned Tiny English Q5 model and record this as an observed accuracy limitation.
- The owner confirmed Wi-Fi was off before launch, no other internet connection was active, and the laptop stayed disconnected through transcription. They also confirmed that they edited the transcript and verified the edited value in Notepad. These are owner-observed results. See [Phase 1 verification](phase-1-verification.md).

## 1A review evidence

- The approved architecture uses the native OpenWhispr 0.0.11 Windows x64 CPU server, one Tiny English Q5 model and four matching DLLs. Sol implemented the engine proof. The lead's current turn metadata identified GPT-6.2 Astra. No downstream task is authorized.
- Astra compared the GitHub release SHA-256 with Sol's archive verification, independently compared the installed model hash with the Hugging Face LFS object ID, and reproduced the fixture's Git blob ID. All matched. The downloaded ZIP was discarded after extraction.
- Astra independently ran the 11-second, mono 16 kHz PCM16 fixture twice through one four-thread server on the Ryzen 3 5300U. PID 20536 was ready after 240 ms. The first response arrived 1,387 ms after launch (1,144 ms for that request); the second took 1,002 ms. Both matched all 22 reference words ignoring punctuation and case. Native load timing on Ctrl+C was 126.49 ms. Windows reported 123,920,384 idle working-set bytes and 128,413,696 peak bytes for that process. The PID disappeared on shutdown. Cold here means a new process and permits a warm Windows file cache.
- The downloaded assets have 35,525,241 logical bytes and occupy 35,545,088 NTFS allocated bytes for their main streams. This includes the fixture and excludes documentation, temporary verification files, directory metadata, and the pre-existing Node/Windows runtimes. Actual working-set figures are server-only. The 2-minute application idle policy belongs to 1D.
- Native security review: the tested listener was on IPv4 loopback. The live health response returned a wildcard CORS origin. The pinned server source exposes inference and model replacement without a native authentication check. Other callers on the same machine can reach the native listener directly. Press's later Node-side checks cannot regulate that listener. Keep the working/public directory free of user data, bound the listener lifetime, and reassess exposure in 1D before treating a shared Windows session as trusted. No model-changing requests or third-party target probes were used. [Pinned native source](https://github.com/OpenWhispr/whisper.cpp/blob/0.0.11/examples/server/server.cpp)
- The verified clip is one accuracy check for the engine. Live microphone capture and broader accuracy are separate Phase 1 tasks. Independent review requested an empty native static-file directory and a listener ownership check in the proof harness. Governance review added explicitly editable output to the Phase 1 contract.
- Sol addressed the review findings. Astra reran the final harness on another port. Exit 0; fresh PID 12196, four requests with zero word edits, 718.8 ms to readiness, 115.71 ms native load, 1,187 ms first request, 755.8–1,008.3 ms warm. Restart PID 15436 produced zero word edits. Both children handled Ctrl+C, exited zero and released the listener. All seven pinned hashes were checked before launch. Default routes for both IPv4 and IPv6 were present at both ends of the run.
- [Sol's measured run](engine-proof.json) and [verification procedure and provenance](engine-proof.md) give the raw timings, asset identities and measurement boundaries. Independent review passed the local inference path. The owner deferred disconnected-host verification to 1E, where the owner confirmed the disconnected run passed.
