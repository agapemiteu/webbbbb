# Start Webb

## Install the extension

Download the [Webb 0.2.3 extension ZIP](https://github.com/agapemiteu/webb/releases/download/v0.2.3/webb-0.2.3.zip) and extract it. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the extracted folder. Remove or reload the older Webb installation first. Pin Webb to open its side panel.

To build from source instead:

```powershell
git clone https://github.com/agapemiteu/webb.git
cd webb
npm install
npm run build
```

Select `.output/chrome-mv3` in Chrome. Pin Webb, then click its icon to open the right-side panel. If TALK reports microphone permission denied, press **Enable microphone in Chrome**, grant access in the new tab, then press the mic again.

## Run the guided demo

Open the [practice site](https://webb-five-puce.vercel.app/demo/) and the [spoken walkthrough](https://webb-five-puce.vercel.app/demo/tutorial.html) in separate tabs. On the walkthrough tab, select **Follow this tab**. If Webb shows **Ready to listen**, click the blue Webb icon in Chrome's top toolbar on that same tab. Wait for **FOLLOWING**. Choose the practice site as the target and play one spoken step at a time. Webb shows tutorial speech before a target is selected, but only acts after you choose a separate target.

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
