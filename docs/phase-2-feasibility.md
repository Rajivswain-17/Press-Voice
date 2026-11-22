# Phase 2A Windows feasibility

## Decision for owner review

Use **one small standard-user Windows companion with a private Node pipe**. Keep shortcut and mode policy, session ownership, transcription, and the existing browser fallback in Press. Put key edges, cancellation observation, microphone access, and Windows target metadata in the companion. Use the OpenWhispr listener only as a reference and feasibility fixture. Its single-binding process cannot provide the complete production protocol, and its parser accepted a binding with an unintended modifier mask.

The lowest tooling-cost next step is a small companion authored in C# against the installed Windows .NET Framework, with narrow Win32 interop. Windows PowerShell's built-in C# compilation successfully ran the proof. Use an auditable, source-pinned release artifact for normal use and measure the standalone process before choosing between this and a hosted Win32 C/C++ build. No Rust, Visual Studio Build Tools, Electron, or desktop framework was installed. Keep the proposed capture design behind an interface. The default Windows endpoint responded to a mono 16 kHz PCM16 format query using WinMM; assess actual WASAPI or WinMM streaming and format fallbacks in the approved capture task. The query opened no recording stream.

**Approve the target strategy explicitly before advancing.** A lightweight local Chrome/Edge extension with a native messaging bridge is the leading candidate for safe caret insertion in ordinary browser fields and web ChatGPT. It can name the exact tab/frame, document, and editor element and perform the final identity, editability, and focus check in the same page operation that inserts the text. Limit access to explicitly enabled sites, validate native-message origin, retain no text history, and require revalidation after navigation or focus loss. This is a proposed addition requiring approval. It has not been built or tested against ChatGPT. For Codex desktop and Zed, prioritize an app-supported editor integration or a proven target-bound edit adapter. Retain Copy fallback until one works. Do not count Notepad coverage as evidence for the owner's everyday apps.

## Assets and execution

| Item | Evidence |
| --- | --- |
| Keyboard release | `windows-key-listener-v1.0.0`, tag commit `e3969d05385b6fda6f162522f3ffe11449584a65`. [Release](https://github.com/OpenWhispr/openwhispr/releases/tag/windows-key-listener-v1.0.0) |
| ZIP | 81,131 bytes. Verified SHA-256 `fee00d48ac03c72c9183b13245a57518ccc6bc94c12d1c0e11ec306b5911c896`. Deleted after verified extraction. |
| Retained local EXE | `runtime/windows-key-listener.exe`, 149,504 bytes. SHA-256 `3a3e25093e7d79611c784b06766ac8dc100e6e0ca9b59f81030cb01061a7e8b5`. Authenticode reported `NotSigned`. The digest establishes release-asset integrity, not publisher signature or source equivalence. |
| Source provenance caveat | Runtime diagnostics show support for `RightCtrl` and a modifier-only parser with a Win flag. The keyboard tag's C source does not include that same parser. Treat the binary and tag source as separately inspected evidence. Do not ship the binary as a reproducible build from that tag without resolving the discrepancy or building from pinned reviewed source. |
| Fast-paste | Inspected the standalone release metadata and tag source at `8ae216e14c493fa8b237bddaab7a910212dd6794`. Its foreground-based `SendInput` path cannot bind the action to the original editor. The later OpenWhispr source also documents a focus-restoration fallback to the current foreground window. The ZIP was not downloaded or executed. [Release](https://github.com/OpenWhispr/openwhispr/releases/tag/windows-fast-paste-v2.0.0) · [Tag source](https://github.com/OpenWhispr/openwhispr/blob/8ae216e14c493fa8b237bddaab7a910212dd6794/resources/windows-fast-paste.c) |
| Dependencies and notices | The listener ran without staging any DLL, package, or SDK. The test used Windows PowerShell 5.1, WinForms, the in-box C# compiler, and Windows APIs. [OpenWhispr notice](THIRD-PARTY-NOTICES.md) |

## Actual keyboard and audio observations

The repeatable [PowerShell probe](../tests/windows-shortcut-probe.ps1) ran in an unlocked Windows desktop. It created its own focused test window and sent only controlled synthetic input to that window. Each listener was stopped by its owned process handle and observed to exit. This demonstrates the native message path and does not establish physical-key rollover, secure-desktop, sleep/resume, or every layout's behavior.

| Probe | Observed behavior | Policy |
| --- | --- | --- |
| F8 single key | Repeated down events and two complete presses yielded exactly two down/up pairs. The foreground test control still received all four key-downs. | Eligible candidate after conflict checks. |
| Right Ctrl, named and numeric | Left Ctrl did not match. Right Ctrl produced one pair for each tested binding. Events passed through. | Candidate, with ordinary Ctrl-chord collision handling and physical tests still required. |
| Ctrl + Shift + F8 | One press/release pair when Shift was released before F8. | Eligible candidate after conflict checks. |
| Ctrl + Caps Lock | One valid pair and Caps Lock state changed despite Ctrl. The probe restored the previous lock state. | Reject by default when preservation of lock-key behavior is required. |
| Ctrl + Shift + Windows | The listener reported `READY`, but its parsed mask was `Win=0` and modifier-only. No Windows-key chord was injected. | Reject. Readiness alone does not establish binding correctness. |
| Alt + Space | Reserved window menu by Windows behavior. No injection or registration attempted. | Reject rather than intercept the system shortcut. |
| Controlled collision | A temporary `RegisterHotKey` registration for Ctrl + Shift + F10 succeeded. The duplicate failed, then the test's own registration was removed. | Useful for observable reservation conflicts. Third-party hooks and app-specific shortcuts remain partly unobservable. |
| Audio | WinMM reported one capture device. The default mapper's 16 kHz mono 16-bit PCM query returned `0` (success). | Strong enough for an in-box capture prototype. No hardware audio, permission, or live background capture result was obtained. |

Retest on the owner's actual keyboard with layout/AltGr, unrelated Ctrl chords, cancellation, missed release, rebinding and sleep/resume before product acceptance. The helper reports injected keys in the test, so a production companion should explicitly distinguish and ignore injected input. The two modes remain choices in Node settings. Escape remains a session-only signal separate from the configured activation binding.

## Editor compatibility findings

| Target | What Task 2A established | Delivery status |
| --- | --- | --- |
| Chrome and Edge | Read-only Windows UI Automation against a controlled local page found the textarea, password input and editable content. The focused text area exposed Value and Text patterns. Password fields were marked. The fields had no standalone child HWND. A Value pattern by itself provides whole-value access, so it does not prove a safe caret edit. | Recommend a scoped DOM adapter. No verified automatic insertion yet. |
| ChatGPT web and WhatsApp Web | Browser focus and target-element identity have to survive navigation, app rerenders and contenteditable replacement. The controlled page exercises the underlying control class only. | Actual live composers unverified. Test through the scoped DOM adapter before enabling. |
| Codex desktop | Codex processes were present, but the targeted process check exposed no top-level main window handle. The actual composer was not verified. Chromium browser results do not transfer to an embedded app surface. | Copy until an actual focused editor can be identified and safely addressed. Investigate supported integration or UI Automation provider in a focused probe. |
| Zed | The visible Zed window exposed zero descendant UI Automation Edit or Document controls in the read-only check. No insertion or content read was attempted. | Copy. Check a deliberately focused editor with the exact target version and evaluate an app-supported mechanism before enabling automatic insertion. |
| Notepad and ordinary native Edit controls | A direct child-control edit remains a candidate where a real editable control handle exists. Modern Notepad needs its own test. | Unverified in 2A. A successful native Edit test would not satisfy the owner’s web/desktop goals. |

Never use blind foreground paste to fill coverage gaps. Before an adapter is approved, prove its target identity, protection checks, caret/selection behavior, and refusal after focus changes. Test the real ChatGPT and Codex surfaces without submitting messages and Zed without saving a document. Keep target data out of diagnostics.

## Measured footprint and future budget

- **Measured** — One retained 149,504-byte EXE. The final probe reported 5,016–5,060 KiB working set for separate listener runs, after startup or a short key test. This excludes PowerShell, Node, the browser and Whisper. The compact test script adds no installed dependency. No new model or audio file was created.
- **Derived** — At the existing 60-second limit, one 16 kHz mono PCM16 payload is about 1.83 MiB. Transport copies and capture conversion scratch space add to that.
- **Pending measurement** — Standalone companion idle/active RAM and CPU, signed or reproducible release bundle size, continuous background capture reliability, delivery latency, and any browser extension cost. No performance target is asserted from this short probe.

Task 2A ends with this evidence. The owner should choose whether to approve the in-box/hosted companion path and a limited browser adapter investigation. Tasks 2B–2G remain unstarted.
