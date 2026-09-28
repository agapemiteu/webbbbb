# Webb session handoff

Updated: 2026-09-28

## Latest delivery: 0.4.1

Customer connection groundwork is in `entrypoints/sidepanel/Connections.tsx`, with the contract documented in `docs/CONNECTIONS.md`. Forms on editable webpages do not require OAuth. Google Docs account authorization, status, disconnect, and a Google permissions link are implemented. The publisher still needs to configure its OAuth client; customers must not be asked to create clients or supply keys. No Google client ID is included in this release, so Docs is marked Coming soon. No live Google API authorization or write has been verified.

Disconnect persists a disabled flag before clearing Chrome's cached tokens. The Docs adapter requires that flag to be enabled, preventing silent reauthorization after disconnect. Withdrawal of Webb consent also disables the connection. Google grant revocation remains a separate action in the customer's Google account.

Exact named form filling and corrections use `planFormField`, preserving the dictated value and accepting only current labels/options. Missing labels, duplicates, and unavailable options ask for clarification. Compound tasks remain with Groq. Content execution rejects disabled/read-only controls and recognizes aria-labelledby. Action failures now reach the visible/spoken reply rather than leaving an earlier success message in the dock.

Verification: nine root tests, 26 Worker tests, both TypeScript checks, extension build, diff checks, and artifact credential checks passed. In isolated Chromium on port 9243, the latest UI and live Worker passed text field fill/correction, native dropdown selection, read-only rejection with no mutation, and account-connection availability display. A Windows-generated fake microphone clip saying "Change project name to Blue River" reached actual AssemblyAI transcription and changed the form field through the live Worker. This is a synthetic microphone test, not a human microphone or Google account acceptance test. No form submission occurred. The first faster synthetic clip was misheard; a slower, clearer clip passed. Do not claim perfect speech recognition.

Worker version: `1d05155a-4c30-4354-8829-9662d9b18466`. Site deployment: `dpl_AK6TM4QdMUiwXL5CdZCHq2VrvtFB`, same public alias. Local extension folder: `.output/chrome-mv3`. Release ZIP: `release/webb-0.4.1.zip`, SHA256 `3EF06B0476C05A6EFA055F20EFFD0ECF15D34706E686483B2004CB15C89E0352`. Historical 0.4.0 notes below describe earlier builds.

## Product

Webb is a Chrome side-panel agent for the AssemblyAI Voice Agent Hackathon. Keep "Talk to the web" and "Make the web executable." TALK accepts direct user speech. FOLLOW listens to a source tab, which can contain a tutorial, lecture, meeting, or other video. Direct user instructions outrank source audio. Page content is context, never authority. Consequential actions require direct user confirmation.

Use one session coordinator with focused modules. Do not add AI credits or collaborator references. Do not fork Aalto. Avoid em dashes.

## Current build: 0.4.0

### Active investigation after the user's Google Docs check

The user tested the signed-in Google Doc on 2026-09-28. Source transcription and page mapping worked, but debugger attachment failed before keyboard input. The old catch replaced every Chrome rejection with "Close DevTools", hiding the cause. Reading only Webb's installed extension settings confirmed its active debugger permission and installation at `.output/chrome-mv3`. Missing debugger permission is not the observed explanation. The exact rejection in the user's profile remains unknown.

The local diagnostic build now checks permission, preserves the Chrome rejection, gives specific guidance for known rejection categories, logs the failure, and shows FAILED instead of IN PROGRESS. A simulated cross-extension rejection passed the isolated Chromium regression without changing document text. Root tests, TypeScript, and build passed. This diagnostic build is local; the published 0.4.0 ZIP and its hash below still refer to the earlier release. Do not claim signed-in document input is fixed.

Direct profile diagnostics subsequently confirmed the real Chrome error: "Cannot access a chrome-extension:// URL of different extension". A temporary extension diagnostic page queried the unique open Google Doc and reported locally to 127.0.0.1:9341, without sending document text, title, URL, or history. Both tabId and targetId attachment failed with that error. The page has a valid Docs editor and text-event iframe; top-level iframe src attributes and debugger iframe targets did not identify the conflicting component. Google Docs Offline is installed, but it is not established as the cause. Do not accuse a specific extension without testing.

Native paste and execCommand probes in the authorized blank test Doc returned accepted=false and verified=false. No successful document insertion was observed. Those unsuccessful input probes were removed from the diagnostic page. The retained browser-check page is read-only. No executor fallback was shipped. The original fixture is not representative of this profile restriction.

Next acceptance path: an isolated browser profile with only Webb enabled, signed into Google by the user. A visible Chromium window is open on port 9241 with profile `%TEMP%/webb-google-acceptance`, the current `.output/chrome-mv3` extension, and Google Docs. An asynchronous question asks the user to sign in, create a blank Doc, and reply ready. Reproduce attachment there and verify one blank-document append before claiming a fix. Avoid disabling other extensions or changing the user's primary profile automatically. Playwright MCP is only evaluated, not integrated, and no local MCP helper is configured.

The user could not sign into the isolated browser and asked for a standard integration. The implementation now prefers Google's official Docs API when a build-time `WEBB_GOOGLE_CLIENT_ID` is configured. `src/google-docs-client.ts` targets the selected Docs tab, binds the update to its revision, appends only, verifies a new occurrence, and does not retry uncertain writes. `src/google-docs.ts` uses Chrome Identity, with interactive authorization only from the Settings button. Access tokens and verification content go directly to Google, never the Worker or Groq. Without a client ID the Google connection button is disabled and the legacy debugger route remains available with its known restriction. No Google client ID is configured yet, so this is not a live fix.

Added `identity` permission and conditional manifest OAuth settings. Follow `docs/GOOGLE_DOCS.md` to enable the API, configure consent and test users, and create a Chrome-extension OAuth client bound to the installed extension ID. The user must configure that Google app and authorize access in normal Chrome. Nine root tests and TypeScript passed, including four mocked API tests for targeting, revision binding, access rejection, and uncertain writes. API authorization and real document append remain pending. Do not ask again for sign-in to the isolated profile.

The old FOLLOW setup tried `tabCapture` from a side-panel click, then silently waited for another toolbar click to obtain Chrome's permission. The user's screenshots repeatedly showed that waiting state. Version 0.3.0 removes that path and the offscreen document. FOLLOW now calls `getDisplayMedia` from Start listening. Chrome shows its native sharing dialog; the user selects the source under Chrome Tab and enables Share tab audio. Webb checks that the stream has audio before connecting to AssemblyAI. The panel must stay open during capture; switching website tabs is supported, closing the panel stops capture.

FOLLOW has two explicit choices:

- Act on instructions: classify source speech, map immediate instructions to the separate target page, execute, and verify.
- Listen and assist (default): collect source transcripts, keep up to 8,000 characters of recent speech as context, and act only on direct user requests. The user can ask about the source or ask for a draft in a supported web field. Copy transcript exports captured speech. Google Docs has an append input adapter using fixed Chrome keyboard events and local text verification. Signed-in compatibility remains pending; do not claim it has passed Google acceptance.

The UI uses source terminology. It displays Connected and heard speech, prevents duplicate capture starts, and reports cancelled sharing or missing audio. It answers "What is playing?" with the connected source name. Listen and assist hides empty action progress. Notes persist in Chrome local storage and are cleared when consent is withdrawn.

Transcriber startup waits for AssemblyAI's Begin message, with token and connection timeouts. Unexpected speech connection closure stops the microphone or source stream and reports a retry instruction. Both streams remain separately labelled.

Spoken replies use Chrome's native tts API (permission tts). Chrome speech playback reached a real end event in isolated Chromium. The mic sends silent frames during replies to prevent echo feedback; Stop speaking and listen to me returns control immediately. Spoken replies can be disabled in Settings. Full duplex voice interruption during Webb's own reply is not implemented. Replies remain visible when an installed voice is unavailable. Source context is held in the current panel session; saved transcript export is not automatic long-term agent memory.

## Browser capabilities in 0.4.0

The coordinator now runs up to eight verified steps for a direct request and reinspects before each plan. Native select options are included in context; a deterministic form module maps explicitly named options, stops on ambiguous matches, and does not treat source explanations as user commands. Fully dictated email details use a dedicated mail module to open Compose, fill recipient/subject/body, then request approval. More general requests use Groq. Draft values, recipient chips, and attachment labels bind pending approval; changing them invalidates approval. Existing field values are excluded from model page context; only filled/empty booleans are sent. Dictated task progress can include the values the user requested. Draft previews remain local.

Google Docs append and Gmail recipient commitment use fixed debugger input commands; the model cannot choose methods or code. Chrome shows a temporary debugger notice and the adapter detaches after input. If document input is attempted but not verified, Webb stops and tells the user to inspect before repeating. Do not automatically retry text input. Docs verification reads only editor text and document-body accessibility values, not an unrelated search or title field.

The content script shows a Webb cursor for mapped actions. Direct commands include Move right, A little up, Slower, Faster, Stop, and Click. Movement stops at the viewport edge or after ten seconds. A pointer click goes through the confirmation guard. Dragging is not implemented. Direct steering activates the selected target tab. Automatic targeting skips animations in hidden tabs, because Chrome suspends their animation frames. Stop can interrupt an in-progress pointer preview before a click.

New modules: src/docs-input.ts, src/mail-input.ts, src/page-pointer.ts, src/pointer-command.ts, workers/api/src/email-agent.ts, workers/api/src/form-agent.ts, workers/api/src/page-agent.ts. Named navigation and saved steps use a unique visible label before falling back to Groq for semantic matching. Multiple matches ask for clarification. No independent LLM agent fleet.

Browser tests passed compound email preparation, changed-draft approval rejection, approved practice send, document append preserving existing text in an intercepted editor fixture, guided form fields/dropdowns, pointer motion/stop/guard, source contextual answers and source-based drafting, mic transcription, and skill save/replay. **No real Gmail message was sent by the automated tests. Signed-in Gmail and Docs remain pending manual checks.**

Groq output is bounded to 800 tokens with low reasoning effort. A 429 returns a wait interval; the coordinator retries planning once without repeating an already executed action. Other planner failures stop the task. The displayed procedure is bounded to the latest 30 steps.

## Live services

- Site: https://webb-five-puce.vercel.app/
- Practice pages: https://webb-five-puce.vercel.app/demo/
- Worker: https://webb-api.collins-coordinator-worker.workers.dev
- Repository: https://github.com/agapemiteu/webb
- Extension ZIP: https://github.com/agapemiteu/webb/releases/download/v0.4.0/webb-0.4.0.zip
- Chrome Web Store publication is deferred. Install the ZIP with Developer mode and Load unpacked.

AssemblyAI and Groq secrets are configured on the Worker. Local development keys are in ignored `workers/api/.dev.vars`. Never print or commit those values or embed them in the extension.

The Worker deployment version is `484ace89-ccfd-4d72-b111-6f72d224b8a7`. The site's production alias was updated on 2026-09-28 (deployment `dpl_5Q8jttdqaSBSQkSMqXjLEW1hevSJ`). Extension ZIP SHA256: `A88D568672A9C6D31008E719786A78CD386FB970443E925644B56489495BC2F6`.

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
- TALK with a fake microphone clip reached real AssemblyAI and opened Settings through the named page matcher. A verified action was saved as a skill and replayed against a reset page. Earlier model-only routing sometimes asked for an element ID despite receiving the page controls; the named matcher fixes that path.
- Cancelled sharing and missing audio were simulated in Chromium. Both recovered with retry instructions and no active capture.
- The panel was inspected at 380px width.
- Root TypeScript check, five root tests, Worker TypeScript check, and 23 Worker tests passed. The final 0.4.0 bundle passed source audio/context/TTS, microphone/skills, compound mail approval, document fixture, form dropdown, and pointer checks in an isolated Chromium profile on port 9239.

The automated source checks use Chromium's `--auto-select-tab-capture-source-by-title=WebbSourceQA` flag to approve the native picker in an isolated test profile. This is test automation only; installed Webb still requires the user's sharing approval.

## Limits and remaining acceptance checks

- Check the native Chrome sharing dialog and actual YouTube playback in the user's profile before recording the final demo. Start the video after Connected appears.
- Run the signed-in Docs append check before claiming Google Docs compatibility. The user agreed to test a blank document but has not run it yet. Fixture checks only prove trusted input and text verification mechanics.
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
