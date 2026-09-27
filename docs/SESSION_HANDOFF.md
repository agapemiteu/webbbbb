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
- Public extension ZIP: https://github.com/agapemiteu/webb/releases/download/v0.2.0/webb-0.2.0.zip
- Chrome extension is not in the Chrome Web Store. Install the ZIP with Chrome Developer mode, or clone the source and build it.

The site was redeployed on 2026-09-27 and aliased to its stable Vercel URL. The Worker is live with AssemblyAI and Groq secrets configured in Cloudflare. Checks so far: `/health` returns 200, `/assemblyai-token` returns 200 with site CORS, and a live Groq request returned a 0.95 confidence click plan for a synthetic Connections link. Version 0.2.0 adds a video invitation, Auto learn after a user click, local skill memory, and verified step replay. No credential values were printed. Live Chrome microphone streaming, Gmail behavior, and sending a real email have not been verified.

## Safety and demo limits

- Model output is structured click/fill data. The extension validates targets and risk before acting.
- Skills save verified control labels and roles locally, never the form values. Replay plans against the current page and stops on missing or mismatched controls. Consequential clicks still need direct confirmation.
- Tutorial audio cannot approve Send, Submit, Deploy, or other consequential actions.
- Forms and Workroom are local simulations. Workroom is not Microsoft Teams and sends no external message.
- Use a test email account and address when manually checking Gmail. Review the draft before direct confirmation.
- Prefer the Acme Cloud walkthrough for the live demo. Play one spoken step at a time, show Integrations mapping to Connections, correct a field, and wait for direct approval before the simulated deploy.

## Checks

Passed during this release:

- Root TypeScript check, three skill-model tests, and production Chrome MV3 build.
- Worker TypeScript check and 13 unit tests.
- Static site build and Vercel production deployment.
- Vercel production alias and Worker token/planner smoke checks.
- Local form and Workroom browser practice checks.
- The public tutorial and privacy pages loaded in gstack browser QA; the tutorial was visually checked at mobile width.

Still required for full end-to-end proof:

- Load the release ZIP in Chrome, permit microphone access, and test TALK and FOLLOW with the live Worker.
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
