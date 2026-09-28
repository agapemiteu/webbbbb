# Connect Google Docs

The supported API path appends text to the Google Doc selected in Chrome. It does not depend on Chrome debugger attachment. Google access tokens and document content used for verification stay between Chrome and Google, and are not sent to Webb's Worker or Groq.

## Configure the app

1. In a Google Cloud project, enable the Google Docs API.
2. Configure the OAuth consent screen. For a hackathon test app, add the Google accounts that will test Webb to its test users.
3. Create an OAuth client for a Chrome extension. Use Webb's extension ID from Settings or chrome://extensions. The development installation currently uses `fgjnmjlacfkigdmapncpbjgoeckkhkmo`. A downloaded unpacked copy may have a different ID; configure that installation's ID.
4. Add the `https://www.googleapis.com/auth/documents` scope. This permits reading and editing Google Docs belonging to the authorized account. Webb uses it only on the selected document.
5. Build with the public client ID:

```powershell
$env:WEBB_GOOGLE_CLIENT_ID='YOUR_CLIENT_ID.apps.googleusercontent.com'
npm run build
```

The client ID is public app configuration. Do not put a Google client secret in the extension. AssemblyAI and Groq keys stay on the Worker.

## Use it

Reload Webb at chrome://extensions. In your normal Chrome profile, open Webb Settings and choose Connect Google Docs. Review Google's consent prompt. Select a blank test Doc and say "Append Webb input test to this document".

Webb reads the selected document tab, binds the write to its revision, appends at the end, and reads back to verify a new occurrence of the dictated text. It never retries an uncertain write. Check the document before repeating an unverified request.

## Current status

API contract and failure tests pass with mocked Google responses. Live Google authorization and append are pending a configured OAuth client and a real account check. The AssemblyAI and Groq keys do not grant Google account access. No Chrome Web Store publication is required for this development check; public distribution needs consistent extension identity and Google's applicable OAuth review.

References: [Chrome Identity](https://developer.chrome.com/docs/extensions/reference/api/identity), [Google Docs tabs](https://developers.google.com/workspace/docs/api/how-tos/tabs), [Google Docs updates](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate).
