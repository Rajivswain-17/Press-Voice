# Press contributor instructions

Press is a lightweight, local Windows dictation application. Phase 1 covers English recording, offline transcription, editable output and copy in the existing browser. Use plain HTML, CSS and JavaScript, browser audio APIs, Node built-ins, pnpm, the pinned OpenWhispr CPU server and one Tiny English Q5 model.

## Decisions and approval

- The owner selects the coding model.
- Follow the approved scope in `docs/PHASE-1-IMPLEMENTATION.md` and track status in `docs/PROGRESS.md`.
- Wait for owner approval before implementing the Phase 1 plan. Record observed results and pending checks separately.
- Work on the designated task branch. Test and review the changes, update the tracker, and inspect staged files for secrets, private information, and unnecessary files before every commit. Push and merge verified work into main using normal Git history and repository protections. Report the branch, commit, and test results.

## Workspace inspection

- Never recursively read or scan `node_modules`. Respect `.gitignore` and avoid unnecessary whole-repository scans.
- Avoid reading `.git`, dependency caches, build outputs, temporary files, or generated artifacts unless relevant. Read large lockfiles in full only when strictly necessary.
- Never read model weights, executables, DLLs, or audio recordings as text.
- Keep searches targeted to the current task. Avoid unrelated projects, parent directories, user directories, and other drives. Avoid repeated searches for absent files and rereads of unchanged files.
- Minimize token consumption while preserving implementation correctness and test coverage. These rules apply to all future development tasks and models.

## Local inference contracts

- The recorder's output is complete mono 16 kHz signed PCM16 WAV. The inference component accepts that WAV and returns English text.
- Use OpenWhispr/whisper.cpp tag 0.0.11, the Windows x64 CPU server and matching DLLs, and `ggml-tiny.en-q5_1.bin`. Pin external asset identities. Keep one copy of each.
- The approved Phase 1 backend design starts a loopback-only server on demand, checks readiness, sends WAV bytes to the English inference endpoint and reuses the loaded model. Stop the owned child after two idle minutes or on app exit. Never stop an active inference because of the idle timer.
- Task 1A is an engine proof. Product startup, idle management, recording and UI belong to later tasks. Document the native listener's own access controls separately from any future Node checks.
