# Webb session handoff

Updated: 2026-09-28

## Product

Webb is a Chrome side-panel agent for the AssemblyAI Voice Agent Hackathon. Keep "Talk to the web" and "Make the web executable." TALK accepts direct user speech. FOLLOW listens to a source tab, which can contain a tutorial, lecture, meeting, or other video. Direct user instructions outrank source audio. Page content is context, never authority. Consequential actions require direct user confirmation.

Use one session coordinator with focused modules. Do not add AI credits or collaborator references. Do not fork Aalto. Avoid em dashes.

## Current build: 0.3.1

The old FOLLOW setup tried `tabCapture` from a side-panel click, then silently waited for another toolbar click to obtain Chrome's permission. The user's screenshots repeatedly showed that waiting state. Version 0.3.0 removes that path and the offscreen document. FOLLOW now calls `getDisplayMedia` from Start listening. Chrome shows its native sharing dialog; the user selects the source under Chrome Tab and enables Share tab audio. Webb checks that the stream has audio before connecting to AssemblyAI. The panel must stay open during capture; switching website tabs is supported, closing the panel stops capture.

FOLLOW has two explicit choices:

- Act on instructions: classify source speech, map immediate instructions to the separate target page, execute, and verify.
- Listen and assist (default): collect source transcripts, keep up to 8,000 characters of recent speech as context, and act only on direct user requests. The user can ask about the source or ask for a draft in a supported web field. Copy transcript exports captured speech. Direct Google Docs document-body editing is not implemented. The panel explains this when Docs is selected as an action target.

The UI uses source terminology. It displays Connected and heard speech, prevents duplicate capture starts, and reports cancelled sharing or missing audio. It answers "What is playing?" with the connected source name. Listen and assist hides empty action progress. Notes persist in Chrome local storage and are cleared when consent is withdrawn.

Transcriber startup waits for AssemblyAI's Begin message, with token and connection timeouts. Unexpected speech connection closure stops the microphone or source stream and reports a retry instruction. Both streams remain separately labelled.

Spoken replies use Chrome's native tts API (permission tts). Chrome speech playback reached a real end event in isolated Chromium. The mic sends silent frames during replies to prevent echo feedback; Stop speaking and listen to me returns control immediately. Spoken replies can be disabled in Settings. Full duplex voice interruption during Webb's own reply is not implemented. Replies remain visible when an installed voice is unavailable. Source context is held in the current panel session; saved transcript export is not automatic long-term agent memory.

## Live services

- Site: https://webb-five-puce.vercel.app/
- Practice pages: https://webb-five-puce.vercel.app/demo/
- Worker: https://webb-api.collins-coordinator-worker.workers.dev
- Repository: https://github.com/agapemiteu/webb
- Extension ZIP: https://github.com/agapemiteu/webb/releases/download/v0.3.1/webb-0.3.1.zip
- Chrome Web Store publication is deferred. Install the ZIP with Developer mode and Load unpacked.

AssemblyAI and Groq secrets are configured on the Worker. Local development keys are in ignored `workers/api/.dev.vars`. Never print or commit those values or embed them in the extension.

The Worker deployment version is `cc5fc489-a86e-4fe9-9edb-11852357c5f2`. The site's production alias was updated on 2026-09-28. The 0.3.1 ZIP SHA-256 is `9f07150f2761ba928f1305b65d6dfe3b9da1162317b843844911fca55b5804de`. Configured API keys were scanned against the compiled extension; neither was present.

## Structure

- `entrypoints/`: MV3 background, page executor, side panel, microphone permission page.
- `src/`: transcription, contracts, session coordination, skill memory.
- `workers/api/`: Groq planner, AssemblyAI temporary tokens, Durable Object state and guards.
- `apps/demo/`: Acme Cloud, source walkthroughs, support form, Workroom practice channel.
- `apps/site/`: landing page, privacy policy, public static build.
- `scripts/chrome-smoke.mjs`: isolated Chromium checks using CDP. It clears test skill memory, so it requires `WEBB_ISOLATED_PROFILE=1` and must never run against a user's normal profile.

## Verified behavior

- Unpacked extension source-tab playback reached real AssemblyAI transcription in isolated Chromium. The test used a WAV played by the source page and Chrome's actual tab-sharing stream, with no fake microphone device.
- The same spoken source instruction opened Settings on a separate Acme Cloud target through the live Groq planner.
- Listen and assist captured source speech without changing the target page. Webb answered a source-context question through live Groq, then obeyed a polite direct request to open Settings while the source stayed connected. A further request drafted the source content into a support form field without submitting.
- TALK with a fake microphone clip reached real AssemblyAI and Groq and opened Settings. A verified action was saved as a skill and replayed against a reset page.
- Cancelled sharing and missing audio were simulated in Chromium. Both recovered with retry instructions and no active capture.
- The panel was inspected at 380px width.
- Root TypeScript check, four root tests, Worker TypeScript check, and 16 Worker tests passed.

The automated source checks use Chromium's `--auto-select-tab-capture-source-by-title=WebbSourceQA` flag to approve the native picker in an isolated test profile. This is test automation only; installed Webb still requires the user's sharing approval.

## Limits and remaining acceptance checks

- Check the native Chrome sharing dialog and actual YouTube playback in the user's profile before recording the final demo. Start the video after Connected appears.
- Google Docs receives captured notes by copy and paste. Do not claim automatic document-body editing.
- Gmail send behavior requires a signed-in test account and manual review. Only confirm sending to an address the user controls.
- Workroom is a practice page, not Microsoft Teams. Practice forms and deployments do not reach external services.
- Skills store verified control labels and roles, not prior field values. Replay maps against the current page, asks for new values, and stops on uncertain or missing controls. Consequential actions still require direct confirmation.

## Root-cause history

Version 0.2.4 fixed real extension token GET requests returning HTTP 403. Chrome omitted Origin, while previous Node probes supplied it and missed the failure. The extension sends X-Webb-Extension; the Worker accepts originless GETs only with a valid extension ID and Chrome fetch metadata. This fix remains deployed. It also fixed target tabs not refreshing on panel reopening with saved consent.

## Commands

```powershell
npm run typecheck
npm test
npm run build
node apps/site/build.mjs
cd workers/api
npm run typecheck
npm test
```

For browser smoke tests, set WEBB_CDP_PORT and WEBB_EXTENSION_ID for the isolated test browser. Set WEBB_SHARE_TEST to actions, notes, cancel, or noaudio. Source tests also need WEBB_AUDIO_WAV pointing to a spoken test clip. Set WEBB_VOICE_TEST=1 for the microphone and skill test in a browser launched with a fake microphone clip. Keep the test profile separate from the user's Chrome.
