# Start Webb

## Install the extension

Download the [Webb 0.2.0 extension ZIP](https://github.com/agapemiteu/webb/releases/download/v0.2.0/webb-0.2.0.zip) and extract it. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the extracted folder. Pin Webb to open its side panel.

To build from source instead:

```powershell
git clone https://github.com/agapemiteu/webb.git
cd webb
npm install
npm run build
```

Select `.output/chrome-mv3` in Chrome. Pin Webb, then click its icon to open the right-side panel. Allow microphone access when you first start TALK.

## Run the guided demo

Open the [practice site](https://webb-five-puce.vercel.app/demo/) and the [spoken walkthrough](https://webb-five-puce.vercel.app/demo/tutorial.html) in separate tabs. Select the practice site as the target in Webb, start FOLLOW from the tutorial tab, switch back to the target, then play the tutorial one step at a time.

To learn the walkthrough as a skill, turn on **Auto learn** before following. Webb saves verified browser steps when you stop FOLLOW. Select a target page and use **Run** in Skills to replay it. Webb asks for new form values and pauses for confirmation before consequential actions.

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
