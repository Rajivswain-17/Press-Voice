# Phase 1 verification

## Observed checks

- All 10 Node tests passed. Coverage includes PCM16 WAV encoding, frame counts, delayed microphone permission and cleanup, the browser controller and clipboard fallback, HTTP request validation and concurrent upload rejection, timeout recovery, and native process reuse and idle shutdown with test substitutes.
- A connected-host smoke test used the new Press HTTP route and the pinned Windows CPU engine with the existing JFK fixture. The expected English phrase was returned, and the owned child exited. The original [engine proof](engine-proof.md) retains its benchmarks.
- Chrome, using the existing speech fixture as a simulated microphone, captured WAV audio through the worklet and displayed the expected native-engine transcript. Editing the transcript and clicking Copy put the edited value on the clipboard.
- The owner manually launched Press, recorded their voice, received a transcript and pasted it into Notepad. “Hey, I am texting press without any internet connection” came back with “love” in place of “internet.” This is an observed Tiny English Q5 recognition error.
- The native server uses a separate IPv4 loopback port, an empty public directory, and a per-launch request prefix. A private prefix reduces accidental reachability. The pinned native process still has unauthenticated local routes and is intended for a trusted personal Windows session. See the [native endpoint review](engine-proof.md).

## Manual acceptance

- The owner confirmed that Wi-Fi was off before starting Press and the laptop had no alternative internet connection. It stayed disconnected through transcription. The disconnected-host check deferred from 1A passed in 1E. Network state was confirmed by the owner.
- The owner confirmed editing the generated transcript before using Copy text and verified that Notepad contained the edited version.
- Tip for future accuracy checks: record the spoken phrase and recognition output separately. This test verifies the workflow. It also documents a word substitution for future evaluation.

## Publication

The Phase 1 implementation and verification passed. All four task branches were published with Git's configured credential helper and verified against the remote refs.
