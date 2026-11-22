# Press

Press is a lightweight English dictation app for Windows. It runs locally in your browser and uses one downloaded speech model. It requires Node.js 22 or newer and has no npm dependencies.

## Set up the local engine

1. Download the [OpenWhispr 0.0.11 CPU ZIP](https://github.com/OpenWhispr/whisper.cpp/releases/download/0.0.11/whisper-server-win32-x64-cpu.zip). Use `Get-FileHash -Algorithm SHA256` on the ZIP and compare it with `7fca73533d5ac5d30f8f6aa0967672321861887c8ea1000cb13196a7d5135fd3` before extraction. Place the EXE and its four bundled DLLs directly in `runtime/`.
2. Download the [pinned Tiny English Q5 model](https://huggingface.co/ggerganov/whisper.cpp/resolve/f281eb45af861ab5e5297d23694b7d46e090c02c/ggml-tiny.en-q5_1.bin) to `models/ggml-tiny.en-q5_1.bin`. Its SHA-256 is `c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b`. The [engine evidence](docs/engine-proof.md) records the fixture and individual file hashes.

## Launch and dictate

1. Double-click `start.cmd`, or run `pnpm start` from the project folder and open the printed local URL in Edge or Chrome. Keep the Press terminal open.
2. Click **Record** and allow microphone permission. Speak a short English sentence, then click **Stop**.
3. Edit the transcript as needed. Click **Copy text** and paste into Notepad to check that the clipboard contains your edited version.
4. Press **Ctrl+C** in the Press terminal to stop the app and its native engine. Run `pnpm test` to exercise the automated checks.

If microphone permission is denied, allow microphone access in the browser's site permissions and Windows privacy settings, then retry. Once the local assets are installed, the app is designed to use loopback only. The [verification record](docs/phase-1-verification.md) tracks the disconnected-host run.

## Run the engine proof

From the Press folder in Windows PowerShell, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\engine-proof.ps1
```

The execution-policy option applies only to this invocation. The proof starts the native CPU server on loopback, waits for readiness, submits the same English recording several times, measures memory and latency, shuts down, and restarts the server. It prints JSON. The default port is 18761; choose a different free port using the script's `-Port` option if needed. The proof uses built-in Windows tools and needs no npm installation, compiler SDK, or internet download. To repeat a disconnected-host test, disconnect all internet uplinks before launching it and reconnect after it exits.

## What's on disk

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Project scope, approved models, review rules, and engineering contracts. |
| `docs/PROGRESS.md` | Authoritative approval and acceptance tracker. |
| `docs/engine-proof.json` | Actual measurements, transcripts, process observations and local asset hashes from the recorded proof. |
| `docs/engine-proof.md` | Pinned download sources, integrity checks, measurement definitions, and native HTTP security review. |
| `tests/engine-proof.ps1` | Repeatable Windows verification harness. Only the test harness uses PowerShell. |
| `tests/fixtures/jfk.wav` | A short known English recording used to measure latency and compare recognized words with a reference. |
| `models/ggml-tiny.en-q5_1.bin` | Quantized Tiny English speech-recognition weights. The server loads these from disk. |
| `runtime/whisper-server-win32-x64-cpu.exe` | OpenWhispr's precompiled CPU speech server, release 0.0.11. |
| `runtime/msvcp140.dll` | Microsoft C++ standard library used by the binary. |
| `runtime/vcruntime140.dll` | Microsoft compiler runtime support used by the binary. |
| `runtime/vcruntime140_1.dll` | Additional Microsoft compiler runtime support, including exception handling. |
| `runtime/vcomp140.dll` | Microsoft OpenMP runtime for parallel CPU work. |

The four DLLs come from the same release archive as the server. Keep them beside the executable. The model and fixture have separate upstream sources.

- [Pinned OpenWhispr Windows CPU runtime](https://github.com/OpenWhispr/whisper.cpp/releases/tag/0.0.11)
- [Tiny English Q5 model](https://huggingface.co/ggerganov/whisper.cpp/blob/f281eb45af861ab5e5297d23694b7d46e090c02c/ggml-tiny.en-q5_1.bin)
- [Pinned JFK speech fixture](https://github.com/ggml-org/whisper.cpp/blob/b0a11594aec50892a02cd8d129eee2dfe93a8bb8/samples/jfk.wav)
