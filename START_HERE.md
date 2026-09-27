# Start Webb

## Install the extension

Download the [Webb 0.3.1 extension ZIP](https://github.com/agapemiteu/webb/releases/download/v0.3.1/webb-0.3.1.zip) and extract it. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the extracted folder. Remove or reload the older Webb installation first. Pin Webb to open its side panel.

To build from source instead:

```powershell
git clone https://github.com/agapemiteu/webb.git
cd webb
npm install
npm run build
```

Select `.output/chrome-mv3` in Chrome. Pin Webb, then click its icon to open the right-side panel. If TALK reports microphone permission denied, press **Enable microphone in Chrome**, grant access in the new tab, then press the mic again.

## Run the guided demo

Open the [practice site](https://webb-five-puce.vercel.app/demo/) and the [spoken walkthrough](https://webb-five-puce.vercel.app/demo/tutorial.html) in separate tabs. On the source tab, choose **Act on instructions**, select the practice site as the target, and press **Start listening**. In Chrome's sharing dialog, choose the source under **Chrome Tab**, turn on **Share tab audio**, and share it. Wait for **Connected**, then play one spoken step at a time. The source can be a tutorial, lecture, meeting, or other audio tab.

To watch normally and ask Webb for help when you need it, choose **Listen and assist**. Source speech stays as context and does not trigger actions. Use TALK to ask questions or request actions on your selected website. Webb replies aloud; turn off Spoken replies in Settings if needed. Speech appears in Webb and stays in this browser after you stop. Use **Copy transcript** and paste into your document. Direct Google Docs document editing is not supported yet.

To learn the walkthrough as a skill, turn on **Save verified steps** in Settings before following. Webb saves verified browser steps when you stop FOLLOW. Select a target page and use **Run** in Skills to replay it. Webb asks for new form values and pauses for confirmation before consequential actions.

Try the [lecture](https://webb-five-puce.vercel.app/demo/tutorial.html?scenario=lecture), [support form](https://webb-five-puce.vercel.app/demo/tutorial.html?scenario=form), and [team channel](https://webb-five-puce.vercel.app/demo/tutorial.html?scenario=teams) journeys. These practice pages do not send real messages.

## API and credentials

The extension uses the hosted Webb Worker by default. To run your own local Worker, place `ASSEMBLYAI_API_KEY` and `GROQ_API_KEY` in `workers/api/.dev.vars`, then run:

```powershell
cd workers/api
npm install
npm run dev
```

Keep API keys on the Worker. Never commit `.dev.vars` or put keys in the extension bundle.

## Real sites

TALK can navigate to Gmail or an HTTPS URL. Signed-in Gmail layouts and send behavior require a manual check in your Chrome profile. Review every draft and only confirm sending to an address you control. The team channel is a Webb practice page, not a Microsoft Teams integration.
