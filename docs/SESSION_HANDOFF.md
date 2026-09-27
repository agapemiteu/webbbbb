# Webb session handoff

Updated: 2026-09-27

## Product

Webb is a Chrome side-panel agent for the AssemblyAI Voice Agent Hackathon. Its product line is "Talk to the web." FOLLOW listens to one tutorial tab and can act on a separate target tab. TALK takes direct user speech. Direct user instructions outrank tutorial speech. Page content is context, not authority. Consequential actions require direct user confirmation.

Keep the product focused on converting speech plus current page state into verified browser actions. Keep one session coordinator with focused internal modules. Do not add multiple independent LLM agents, AI credits, or collaborator references. Do not fork Aalto or copy its submission. Avoid em dashes.

## Current structure

- `entrypoints/` contains the Chrome MV3 background, content script, side panel, and offscreen audio handler.
- `src/` contains the shared voice, protocol, and session coordination logic.
- `workers/api/` contains the Cloudflare Worker, Groq planner, AssemblyAI token route, and Durable Object session state.
- `apps/demo/` contains Webb's Acme Cloud, tutorial, support form, and Workroom practice pages.
- `apps/site/` contains the custom landing page and static site build.
- `docs/SCENARIO_TESTS.md` describes practice and real-site checks.

## Live services

- Site: https://webb-five-puce.vercel.app/
- Practice pages: https://webb-five-puce.vercel.app/demo/
- Worker: https://webb-api.collins-coordinator-worker.workers.dev
- Public source repository: https://github.com/agapemiteu/webb
- Public extension ZIP: https://github.com/agapemiteu/webb/releases/download/v0.2.4/webb-0.2.4.zip
- Chrome extension is not in the Chrome Web Store. Install the ZIP with Chrome Developer mode, or clone the source and build it.

The site was redeployed on 2026-09-27 and aliased to its stable Vercel URL. The Worker is live with AssemblyAI and Groq secrets configured in Cloudflare. Version 0.2.1 fixes the real Chrome failure reported in screenshots: `tabCapture.getMediaStreamId()` was requested from a side panel click without the extension being invoked on the tab. FOLLOW now arms the tutorial tab in the panel and starts capture from the pinned Webb toolbar icon click. It also uses AssemblyAI's supported `u3-rt-pro` model, no longer selects the tutorial as its own target, and can inject its page script into a tab already open before installation. The release archive SHA-256 is `ccbb48a2f7d02de7794fb1a9999a2a31fc1e1d6be0b412c7c5cb072902f703f2`. A live token and AssemblyAI WebSocket session connected successfully. Full FOLLOW transcription inside the user's Chrome profile still needs a manual check. No credential values were printed.

Version 0.2.2 fixes the setup failure shown in the 18:21 screenshots. The panel rejected FOLLOW when the tutorial tab was selected as its own target. Its target-clearing code ran after that rejection and was unreachable. FOLLOW now clears that mistaken target, starts listening without a target, and shows the latest tutorial transcript. Tutorial turns are held from the planner until a different target is selected. The release ZIP SHA-256 is `44b2b0533175421ea9be3d389b705b7a7407403fc89443bc24e6d0934b0cd590`. The compiled extension was scanned for key names and key-shaped strings; none were found. Full FOLLOW transcription inside the user's Chrome profile still needs a manual check.

The 19:06 screenshots of 0.2.2 show FOLLOW still pending with a valid Google Docs target. TALK reports microphone permission dismissed. Version 0.2.3 attempts tab capture directly from the Follow click when Chrome has already granted access; otherwise it keeps the toolbar path. It records distinct waiting, toolbar received, connecting, connected, and error states so the panel can report the actual capture stage. Chrome side panels can suppress microphone permission prompts, so 0.2.3 opens a normal extension tab to request microphone access, then tells the user to retry TALK. The panel now shows the core Follow and target controls first, with Skills and Progress only when they have content. The release ZIP SHA-256 is `100ea9e414d5a39038ed24abf62e95501909813e30d02a959b17c0403e2100b1`. A real Chrome run of 0.2.3 is still required before claiming voice capture works.

Version 0.2.4 fixes the Worker rejecting actual Chrome extension token GETs with HTTP 403. Chromium omits the `Origin` header on that request; previous API probes supplied an Origin and missed the failure. The extension now identifies its request with `X-Webb-Extension`, and the Worker accepts originless GETs only with a valid extension ID and Chrome fetch metadata. This Worker fix is deployed. It also refreshes the target tab list when reopening a panel with saved consent. An isolated Chromium test with the live Worker and a fake microphone clip transcribed "Open Settings" through AssemblyAI, planned with Groq, moved the target page, saved a verified action, and replayed that action as a skill. FOLLOW tab capture still needs a native toolbar click in Chrome to verify the audio path; CDP key events did not invoke the toolbar action in the isolated browser. Do not claim FOLLOW transcription is verified.

The 0.2.4 ZIP SHA-256 is `5e0438ed5c4434fe52ccb502427d21d6918813339c1a171b990e185c3d3cc05d`. Both configured secret values were checked against the compiled extension and neither was embedded.

## Safety and demo limits

- Model output is structured click/fill data. The extension validates targets and risk before acting.
- Skills save verified control labels and roles locally, never the form values. Replay plans against the current page and stops on missing or mismatched controls. Consequential clicks still need direct confirmation.
- Tutorial audio cannot approve Send, Submit, Deploy, or other consequential actions.
- Forms and Workroom are local simulations. Workroom is not Microsoft Teams and sends no external message.
- Use a test email account and address when manually checking Gmail. Review the draft before direct confirmation.
- Prefer the Acme Cloud walkthrough for the live demo. Play one spoken step at a time, show Integrations mapping to Connections, correct a field, and wait for direct approval before the simulated deploy.

## Checks

Passed during 0.2.4:

- Root TypeScript check, four root tests, production Chrome MV3 build, Worker TypeScript check, and 14 Worker tests.
- Live browser token request from an unpacked extension returned HTTP 200 without an Origin header.
- Isolated Chromium microphone with real AssemblyAI transcription and Groq planning opened Settings in the target tab. The same browser run saved and replayed a verified skill.
- The deployed Worker contains the originless extension GET fix.

Previously passed during 0.2.3:

- Root TypeScript check, four root tests including the FOLLOW target regression, and production Chrome MV3 build.
- A live token request and AssemblyAI `u3-rt-pro` WebSocket handshake via `node scripts/check-stream.mjs`.
- A live Worker and Groq planner request selected the Settings control via `node scripts/check-plan.mjs`.
- Worker TypeScript check and 13 unit tests.
- Static site build and Vercel production deployment.
- Vercel production alias and Worker token/planner smoke checks.
- Local form and Workroom browser practice checks.
- The panel was visually checked at 380px width with its local browser preview; there were no console errors. The preview uses mocked Chrome APIs and does not prove capture.

Still required for full FOLLOW proof:

- Install the 0.2.4 ZIP in an interactive Chrome profile and click Webb's native toolbar icon on the tutorial tab while FOLLOW is armed. Confirm FOLLOWING appears and tutorial speech reaches the target. CDP alone did not trigger that native invocation.
- Verify the video invitation and skill replay in a real Chrome profile. Headless page QA does not prove extension tab audio capture.
- Test tab capture from YouTube, navigation to Gmail, and an explicitly confirmed email send to a test address.
- Chrome Web Store publication requires a publisher account and is intentionally deferred.

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

Local keys are configured in ignored `workers/api/.dev.vars`. Never commit API keys, `.dev.vars`, or secret-bearing files. The release archive and Git index were scanned for key-shaped strings before publication.
