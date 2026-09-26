# Chrome Web Store draft

## Name

Webb: Talk to the web

## Short description

Follow a spoken tutorial, map its steps to the web page you have open, and act with your approval.

## Detailed description

Webb is a Chrome side panel agent for software walkthroughs. Choose a target website, then speak to Webb or follow spoken instructions from another tab. Webb reads visible controls on your selected page, adapts when tutorial labels differ from the current interface, and verifies each action. You can interrupt or correct the tutorial at any time. Webb waits for your direct approval before consequential actions.

Audio is transcribed by AssemblyAI. Transcripts and limited page context are sent to Webb's Worker and Groq for action planning. Session data is stored temporarily in Cloudflare and expires after 24 hours without activity. Review the privacy policy before using Webb.

## Single purpose

Listen to direct or followed speech, match instructions to the currently selected web page, and perform verified browser actions with user control.

## Permissions justification

- `sidePanel`: display Webb beside the current page.
- `tabs`: let the user select tutorial and target tabs and show their titles.
- `activeTab` and host access to web pages: inspect visible controls on the target page selected by the user and carry out approved actions.
- `tabCapture` and `offscreen`: capture audio from the tutorial tab after the user starts FOLLOW, then stream it to AssemblyAI for transcription while allowing playback to continue.
- `storage`: keep the Worker URL, consent selection, and active session identifier.

## Privacy fields to declare

- Website content: URL, title, visible interactive labels and roles, and action outcomes.
- User activity: direct instructions, followed tutorial transcripts, selected tabs, and procedure progress.
- Audio: microphone input or audio from the tab the user explicitly chooses for FOLLOW.
- Data recipients: AssemblyAI, Groq, and Cloudflare, only to provide speech transcription, instruction planning, and temporary session state.
- No sale, advertising use, or unrelated profiling.
- Privacy policy URL: `https://webb-five-puce.vercel.app/privacy.html`

## Submission state

The unpacked build works locally. Store distribution needs a registered Chrome Web Store developer account and policy review. Store visibility may be set to unlisted so testers with the link can install after Google approves it. A newly created beta listing must be labelled as a development or beta build and described as beta testing. See the official [distribution guide](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution) and [privacy disclosure requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements).
