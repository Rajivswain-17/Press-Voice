# Task 1A engine evidence

Run from the Press folder in Windows PowerShell 5.1.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\engine-proof.ps1
```

The script prints JSON. To save a new capture alongside the checked-in example, pass `-OutputPath` with a new filename. Use `-Port` to specify a free loopback port. The script uses Windows PowerShell, the Windows networking commands and the .NET Framework shipped with Windows. The brief console-control helper compiles in-process through PowerShell's built-in `Add-Type`.

## Pinned assets

| Asset | Verification |
| --- | --- |
| [OpenWhispr CPU server ZIP](https://github.com/OpenWhispr/whisper.cpp/releases/download/0.0.11/whisper-server-win32-x64-cpu.zip) | Release tag `0.0.11`, commit `a1c8b29d678124d355608c4ca9a6e93d08076565`, SHA-256 `7fca73533d5ac5d30f8f6aa0967672321861887c8ea1000cb13196a7d5135fd3` verified before extraction. The ZIP contains the server and four staged DLLs. |
| [Tiny English Q5 model](https://huggingface.co/ggerganov/whisper.cpp/blob/f281eb45af861ab5e5297d23694b7d46e090c02c/ggml-tiny.en-q5_1.bin) | 32,166,155 bytes, SHA-256 `c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b` verified against the upstream LFS identity. |
| [JFK WAV](https://github.com/ggml-org/whisper.cpp/blob/b0a11594aec50892a02cd8d129eee2dfe93a8bb8/samples/jfk.wav) | 352,078 bytes, verified Git blob `3184d372cd2f8b804d3a540c70ec50d927b335d2`. Mono 16 kHz PCM16. |

The installed runtime and model total 35,173,163 bytes (33.54 MiB), excluding the fixture. Individual SHA-256 hashes and measured bytes are in [the capture](engine-proof.json). During the proof, each child loaded the four DLLs from its own runtime directory.

## Measurement scope

- Readiness measures from just before process creation through successful `GET /health` returning `status: ok`. It includes process startup and polling. Native model-load timing comes from the engine's own shutdown log and covers its model-loading routine. [Pinned server source](https://github.com/OpenWhispr/whisper.cpp/blob/a1c8b29d678124d355608c4ca9a6e93d08076565/examples/server/server.cpp) · [Pinned engine source](https://github.com/OpenWhispr/whisper.cpp/blob/a1c8b29d678124d355608c4ca9a6e93d08076565/src/whisper.cpp)
- Inference latency measures from multipart POST to receipt of the HTTP response body. The first request to each freshly started child is process-cold. The following three requests to the initial PID are warm. Windows file caching was left in its normal state. One clip and a small number of requests can show process reuse and timing variance.
- The transcript score is Levenshtein word edits divided by the 22-word reference, ignoring case, punctuation and whitespace differences. This is a fixture smoke test with a 10% WER limit. Broader English dictation accuracy requires a representative corpus.
- Working set is sampled at readiness and after about two seconds without a request. Peak working set is the Windows process high-water counter sampled at the end of that idle interval.
- Both children exited zero after handling Ctrl+C in their private consoles. The test verified the engine's graceful-shutdown message and listener removal, then started a different PID on the same port and transcribed again. The test force-stops its owned child if an error prevents the graceful path.
- The client uses only a numeric loopback URL, disables proxies and rejects redirects. The staged assets suffice for the proof. PID-filtered IPv4 and IPv6 TCP snapshots at readiness, inference and idle record the loopback listener and peer. These are sampled observations. They do not exclude short-lived connections between samples or traffic outside TCP. The JSON records IPv4 and IPv6 default-route counts at the start and end. A capture made with external connectivity disabled can be added separately.

## Native server exposure

The native server in the proof binds only to `127.0.0.1` and serves from an empty public directory. Source inspection shows that the native inference and model-reload handlers have no authentication. Inference accepts uploaded audio and request-controlled options, which exposes parser and CPU and memory usage to callers that can reach the local port. The model-reload handler accepts a local path using the server process's access and can replace or disrupt its loaded model. Wildcard CORS response headers and an inference OPTIONS handler provide no origin-based access control. The conversion option invokes an external converter and remains disabled. Keep this listener private to loopback. A later app's request checks cover requests entering the app and have no effect on callers that reach the native port directly. [Pinned server source](https://github.com/OpenWhispr/whisper.cpp/blob/a1c8b29d678124d355608c4ca9a6e93d08076565/examples/server/server.cpp)
