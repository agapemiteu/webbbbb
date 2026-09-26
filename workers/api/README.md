# Webb API Worker

This Worker provides the extension with a session identifier, a short-lived AssemblyAI Streaming STT token, and one browser action suggestion per transcript turn. It keeps API keys on the server. `/plan` validates the selected element against the current page snapshot and assigns risk using code, not the model's output. The extension must still enforce confirmation before executing `risk: "confirm"` actions.

## Local setup

1. `cd workers/api && npm install`
2. Fill the empty keys in `.dev.vars`. That file is ignored by Git. `.dev.vars.example` documents the expected values.
3. Set `ALLOWED_ORIGINS` to a comma-separated list of website origins, such as `https://webb-five-puce.vercel.app`. Valid Chrome extension origins are accepted by ID format so each tester can use their unpacked extension ID.
4. Run `npm run dev`. Point the extension's API base URL to the printed local Worker URL.

For deployment, configure `ALLOWED_ORIGINS` as a Worker variable and set `ASSEMBLYAI_API_KEY` and `GROQ_API_KEY` as Worker secrets. The Worker uses Groq's `openai/gpt-oss-20b` model with strict JSON schema output. No secret belongs in the extension bundle.

## API

`POST /session` creates a SQLite-backed Durable Object and returns `{ "sessionId": "..." }`.

`GET /session/:id` reads the stored state. `PATCH /session/:id` accepts `{ "expectedRevision": 0, "patch": { "mode": "follow", "procedure": { "goal": "Deploy project", "steps": [] } } }` and returns the updated state. Use the latest `revision`; stale writes receive `409` with the current state. `POST /session/:id/events` accepts `{ "expectedRevision": 1, "action": { "actionId": "...", "success": true, "observedState": "Settings opened", "timestamp": 1234567890 } }`. The last 50 action results are retained. Partial STT tokens are never stored.

`GET /assemblyai-token` returns `{ "token": "..." }`. Call it immediately before each AssemblyAI WebSocket connection. Tokens expire after 60 seconds and are single use. TALK and FOLLOW need separate tokens.

`POST /plan` accepts:

```json
{
  "source": "followed_tab",
  "text": "Open integrations",
  "page": {
    "url": "https://example.com/project",
    "title": "Project",
    "elements": [
      { "id": "el_31", "role": "link", "tag": "a", "text": "Connections" }
    ]
  },
  "procedure": { "goal": "Deploy project", "steps": [] }
}
```

The response has `kind`, `reason`, `confidence`, and `goal`. An actionable response also has `action`, for example `{ "id": "...", "type": "click", "target": "el_31", "risk": "auto" }`. A field fill receives `risk: "prepare"`. Consequential clicks receive `risk: "confirm"`. If the target is missing or confidence is low, there is no action.

For a pending confirmation, include `pendingConfirmation` with the prior `action`, `description`, and `requestedAt`. A direct user turn such as `Go ahead` can return that same action. A followed tab turn can never confirm it.

The Worker reflects syntactically valid Chrome extension origins so different testers can load the source without sharing an ID. Website callers must match an `ALLOWED_ORIGINS` entry. Origin matching is a browser access control, not user authentication. Token minting is limited to 10 requests per minute, planning to 30, and session operations to 60 per client IP. Cloudflare's built-in rate limiter is approximate and can rate limit users sharing a public IP.

Session records expire after 24 hours without activity. Webb can also delete an active session when the user withdraws consent. Session records contain transcripts, page context, procedure state, and action outcomes. Raw audio is sent to AssemblyAI for transcription and is not stored in the Webb Durable Object.

References: [AssemblyAI Streaming tokens](https://www.assemblyai.com/docs/coding-agent-prompts) and [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs).
