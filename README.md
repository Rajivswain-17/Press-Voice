# Press

Press is a lightweight English dictation project for Windows. The first working component is the Task 1A speech engine proof. It transcribes a known recording locally using an existing WAV and one downloaded model. The microphone and application screen are scheduled separately.

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
