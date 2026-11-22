# Press Phase 1 implementation plan

**Approval status** — Approved. Work on the designated task branches and publish verified work task by task, subject to GitHub authentication and branch protections.

**Goal** — On the existing Windows laptop, open Press in the installed browser, record English speech, stop, read and edit the local transcript, and copy it. Verify that the entire path works with internet connectivity unavailable.

**Architecture** — Plain HTML, CSS, and browser JavaScript capture microphone audio through Web Audio. Node serves the page and forwards validated audio to an owned, precompiled OpenWhispr CPU server on IPv4 loopback. The native process loads the existing Tiny English Q5 model. Use Node's built-in APIs and test runner, the existing pnpm installation, and the existing assets.

**Baseline** — Task 1A accepted the engine proof within its revised scope. Its measurements and provenance are in [engine-proof.json](engine-proof.json) and [engine-proof.md](engine-proof.md). The disconnected-host check is pending in 1E. Keep the original evidence and use the existing files in `runtime/`, `models/`, and `tests/fixtures/`. The [progress tracker](PROGRESS.md) records approval and test status.

## Shared interfaces and order

```text
Record → browser microphone → AudioWorklet → WAV Blob
Stop → POST /api/transcribe → Node → native multipart inference
JSON text → editable transcript → Copy
```

- Recorder input is the browser's default microphone. Its output is a nonempty RIFF/WAVE Blob of type `audio/wav`, with mono samples at 16,000 Hz encoded as signed little-endian PCM16. Use a proposed 60-second ceiling, for at most 960,000 samples and 1,920,044 bytes with the app's 44-byte header. Stop automatically at the limit and deliver the same result as manual Stop.
- The browser posts the raw Blob to same-origin `POST /api/transcribe` with `Content-Type: audio/wav`. It receives HTTP 200 with `{ "text": "..." }` on success. Errors use `{ "error": { "code": "...", "message": "..." } }`. An empty successful transcript means the engine returned no text. English is fixed by the backend.
- Run 1B, 1C, and 1D against these contracts. 1C may use fake recorder and HTTP adapters for development and tests. 1D can use the existing English fixture and synthetic WAVs. Use separate files per task, with 1E following all three. The same person or coding model can perform all implementation work.
- Use an existing Chromium-based Windows browser on a loopback origin. Keep browser assets local, scope the Node static routes to the app's public files, and keep audio and transcripts out of persistent storage and routine logs.

## 1B — Microphone recording and WAV preparation

**Build and purpose** — Build the browser recorder needed to convert a real microphone signal into the WAV accepted by the native engine. This stage establishes capture and cleanup independently of transcription.

**Technology and files**

| New file | Responsibility |
| --- | --- |
| `public/recorder.mjs` | Manage permission, stream, capture state, Stop, cancellation and cleanup. Export the recorder factory. |
| `public/pcm-worklet.js` | Collect mono float samples from the Web Audio graph. Flush the final batch and report completion. |
| `public/wav.mjs` | Convert mono samples to 16 kHz PCM16 and encode the canonical WAV header. |
| `tests/wav.test.mjs` | Test conversion and WAV encoding with synthetic signals. |
| `tests/recorder.test.mjs` | Test recorder lifecycle with controlled browser API substitutes using `node:test`. |

**Contract** — `createRecorder({ onLimit, onError })` returns `start()`, `stop()`, and `cancel()`. The first two return promises. `stop()` resolves to the WAV Blob. `cancel()` releases capture or invalidates a pending permission result. `onLimit` tells the caller to invoke the same Stop flow. `onError` reports device loss or worklet failure during capture. Use stable error codes for denied permission, missing microphone, empty capture and capture failure.

**Implementation steps**

1. Add WAV tests first. Encode a canonical 44-byte header and clamp float amplitudes before quantization. Use the actual audio context sample rate. When conversion is required, use a mono `OfflineAudioContext` resampling step and a target length calculated from source duration. Keep byte packing independently testable.
2. On Record, create or resume the Web Audio context from the user action, request `getUserMedia({ audio: true })`, and connect the stream to an `AudioWorkletNode` with explicit mono input. Output silence and keep the graph active during recording so the microphone never plays back through the speakers.
3. Batch samples into bounded messages. Enforce the duration limit in the worklet using source frames, including any final partial batch. On Stop, flush and acknowledge the remaining samples, close the graph and stop every media track, then prepare the WAV. Bound the flush wait. A missing acknowledgement produces a recoverable error.
4. Route permission failure, device loss, rapid repeated actions, and page exit through one cleanup path. If a permission request resolves after cancellation, stop its tracks immediately. Keep only the samples for the current recording.

**Acceptance and tests**

- Node tests verify RIFF and data lengths, sample rate, byte rate, alignment, signed little-endian encoding, clipping, and exact sample count from a 48 kHz source. Verify that a known tone maintains its duration and frequency in a Chromium conversion test.
- Lifecycle tests cover duplicate starts, Stop while starting, late permission resolution after cancel, worklet flush failure, disconnected device, the duration cap, and a successful retry. The final sample batch appears exactly once.
- With Edge or Chrome on Windows, make a short real recording, play back the resulting WAV as a temporary test artifact, and confirm the sentence is intelligible, the start and end survive, and the microphone track releases on Stop and cancellation. If the browser check needs the integrated page, record it as pending and complete it in 1E. Remove the temporary audio after checking.

## 1C — User interface

**Build and purpose** — Provide a single page for Record, Stop, status, the editable transcript, and Copy. The page explains recoverable errors and keeps the controls predictable while permission or transcription is pending.

| New file | Responsibility |
| --- | --- |
| `public/index.html` | Semantic controls, labelled transcript textarea and an accessible live status region. |
| `public/styles.css` | Layout, responsive sizing, readable contrast and focus styles. |
| `public/app.mjs` | UI controller, recorder calls, same-origin fetch and clipboard action. |
| `tests/app.test.mjs` | Test controller and adapter boundaries with Node's built-in runner. |

**Implementation steps**

1. Build the single screen using native HTML controls and CSS. Show Ready, Requesting microphone, Recording, Transcribing and the resulting success or error status.
2. Bind Record to `start()`. Bind manual Stop and recorder limit to the same handler. Gate that handler so one recording posts once. Disable conflicting controls during asynchronous transitions. Use plain text and the textarea value to render transcripts.
3. On a valid WAV, POST through the shared HTTP contract. Handle network failure, structured errors, and a successful empty transcript without wiping a previous usable draft. Replace the draft only on a successful nonempty result.
4. Copy the current textarea value using `navigator.clipboard.writeText()` from the click. Report success only after it resolves. If the browser denies access, focus or select the text and tell the user how to copy it manually.

**Acceptance and tests**

- With test adapters, verify normal transitions, one POST per recording, permission failure and retry, server failure, empty speech, successful replacement, and preservation of a prior draft after failure.
- Verify edited text reaches the clipboard adapter exactly, including line breaks. Verify copy denial produces useful feedback. Render a transcript containing markup characters as literal text.
- In Windows Chromium, verify keyboard operation, visible focus, readable status and copying edited text. Exercise integration-dependent cases in 1E.

## 1D — Local Whisper server integration

**Build and purpose** — Serve the browser page and provide a single local transcription endpoint. Node controls the native process and supplies the fixed English model and inference options.

| New file | Responsibility |
| --- | --- |
| `package.json` | Private package metadata and start/test scripts. No external packages. |
| `server.mjs` | Loopback HTTP app, static-file allowlist, request validation and structured responses. |
| `whisper-server.mjs` | Single owned child, readiness, multipart inference, idle shutdown and recovery. |
| `tests/server.test.mjs` | HTTP tests against a fake transcriber. |
| `tests/whisper-server.test.mjs` | Lifecycle tests using injected process, HTTP and timer substitutes. |

**Implementation steps**

1. Serve the UI from `127.0.0.1` on a free port, print the exact local URL, and allowlist the required public files with their MIME types. Serve no project-root files. The recording endpoint requires the expected Host and same-origin browser Origin, uses no cross-origin response headers, and accepts only raw WAV POST bodies. Bound request size while reading even when Content-Length is absent or incorrect.
2. Validate the canonical WAV header and consistent payload length, exact mono PCM16 format, nonzero complete samples and the maximum duration. Return 400 for malformed WAV, 413 for excessive size, 415 for a wrong media type, 403 for an unexpected browser origin, 409 while another request owns the job, 503 when the engine is unavailable, and 504 on an engine timeout. Use short, actionable messages without absolute paths or audio content.
3. Start the pinned CPU executable lazily using Node's asynchronous child process APIs with arguments and absolute paths. Use an empty temporary public/working directory and no conversion flag. Bind the child to a separate available IPv4 loopback port, check child exit and readiness within a bounded deadline, and handle a port collision without using an unrelated listener. Verify the selected startup and error signals against the pinned build.
4. Use Node's built-in fetch and FormData to forward the validated WAV bytes, `language=en`, and `response_format=json` to native inference. Use bounded readiness and inference timeouts, initially 15 and 60 seconds respectively. Pin the destination, disallow redirects, accept a valid string text response, and release the job slot in success or failure. Keep no audio or response history.
5. Reuse the same healthy child for consecutive requests. Start a two-minute timer after the active request settles, clear it before reuse, and wait for the old child to exit before replacement. On parent shutdown or an unrecoverable timeout, terminate the owned child and close the listener. Confirm exit with the child handle and clean up only app-owned temporary files. Recover after unexpected exit on a later request.
6. Review the native listener as a separate boundary. Keep it available only while Press needs it, use a separate per-run port, expose no native routes through Node, and test the pinned build's route-prefix option as a way to reduce accidental reachability if supported. Treat a private port or prefix as exposure reduction. The native process accepts unauthenticated local calls, so document the residual risk and have the independent Phase 1 reviewer assess the design for personal Windows use. See [the prior endpoint review](engine-proof.md).

**Acceptance and tests**

- Verify approved static paths, denial of unlisted paths and cross-origin requests, method, size and WAV errors, English-only options, and stable response shapes. Include oversized chunked requests, Windows paths with spaces, a wrong native response, and the one-job limit.
- Test startup, readiness timeout, port collision, reuse, idle timing across an active request, process exit, request timeout and cleanup. Use a controlled clock to exercise the two-minute policy quickly.
- Run a single local integration smoke test through the Node route with the existing fixture if needed to verify that the new adapter works with the pinned server. Record adapter behavior. Keep the existing 1A benchmarks as the reference.

## 1E — Final integration and disconnected-host verification

**Build and purpose** — Finish the local launch path and demonstrate the full product on the Windows laptop. This closes both Phase 1 end-to-end verification and the disconnected-host check deferred from 1A.

| File | Change |
| --- | --- |
| `start.cmd` | New launcher that starts Press from its own directory, including paths with spaces. |
| `server.mjs`, `public/app.mjs` | Update only for verified integration gaps, including reliable launch and teardown. |
| `README.md` | Add verified launch and use instructions, supported browser, microphone permission help and offline checks. Retain the engine proof instructions. |
| `docs/phase-1-verification.md` | New evidence record with commands, outcomes, network observations and independent review verdict. |
| `docs/PROGRESS.md` | Record outcome and explicitly close or retain the pending offline check. |

**Implementation steps and acceptance**

1. Verify `pnpm start` and the launcher use the existing Node installation and show the actual local URL. Open it in the user's existing browser. Test launch from another working directory and clean shutdown.
2. Run the automated suite. Test Record → Stop → editable result → Copy into Notepad. Verify retry, permission recovery, the browser mic indicator and released tracks, a second recording, and readable feedback for no speech. Check that a normally closed app leaves no owned server process behind.
3. Coordinate a temporary Wi-Fi disconnect with the owner. Verify that Windows has no active internet uplink and no non-loopback IPv4 or IPv6 default route before starting Press. Start it fresh while disconnected. Record a new short English sentence, transcribe it, edit or copy the result, and verify the copied text in Notepad. Confirm connectivity is still unavailable after the check, then tell the owner to reconnect. Capture the observed network state before and after, the transcript outcome, and the actual result. This fresh offline start and inference closes the deferred engine check as well. If the machine reconnects early or the run cannot be observed, record it as pending and repeat only the disconnected end-to-end check.
4. Review the evidence, browser request boundaries and native process cleanup. Fix blocking findings and verify affected checks. Update the tracker and follow the task branch workflow in AGENTS.md.
