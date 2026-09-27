# Webb

**Talk to the web.** Webb listens to you or to a source tab, maps spoken instructions to the page you have open, and checks what happened.

## Try it

- [Open the live practice site](https://webb-five-puce.vercel.app/)
- [Run the project setup walkthrough](https://webb-five-puce.vercel.app/demo/tutorial.html)
- [Try the lecture walkthrough](https://webb-five-puce.vercel.app/demo/tutorial.html?scenario=lecture)
- [Try the form walkthrough](https://webb-five-puce.vercel.app/demo/tutorial.html?scenario=form)
- [Try the team channel walkthrough](https://webb-five-puce.vercel.app/demo/tutorial.html?scenario=teams)

The form and team channel are browser-only practice pages. They do not send messages or connect to external services.

## Install the Chrome extension

Download the [Webb 0.3.1 extension ZIP](https://github.com/agapemiteu/webb/releases/download/v0.3.1/webb-0.3.1.zip) and extract it. In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the extracted folder. Remove or reload an older Webb installation first.

To build from source instead:

```powershell
git clone https://github.com/agapemiteu/webb.git
cd webb
npm install
npm run build
```

Then select `.output/chrome-mv3` in Chrome. Pin Webb to open its side panel. The extension connects to the hosted API by default.

## Use voice

- In **TALK**, choose a target tab and speak one instruction. For example: "Open Gmail".
- In **FOLLOW**, open the source tab and choose **Act on instructions** or **Listen and assist**. Select **Start listening**, choose the source under **Chrome Tab**, enable **Share tab audio**, and share it. Play the source after Webb shows Connected.
- **Act on instructions** maps spoken steps to a separate target website. **Listen and assist** keeps recent source speech as context and waits for you. Ask what the speaker said, or request a draft in a supported web field. Webb answers aloud and can act on your selected website. You can also copy the transcript into any editor. Direct writing into the Google Docs document body is not supported yet.
- If TALK reports that microphone access was denied, use **Enable microphone in Chrome**. This opens an extension tab where Chrome can show its permission prompt. Then return to Webb and press the mic again.
- To save a workflow, enable **Save verified steps** in Settings. Webb only offers a skill after it has verified browser actions, and saves it when you stop action mode.
- To reuse a workflow, choose **Run** under Skills or say "Run skill" followed by its name. Webb matches each step to the current page and asks for fresh form values. If a control is missing, it stops.
- For email, ask Webb to prepare the recipient, subject, and message. Review the draft and confirm before sending. Use your own test address.

Webb requires direct user approval for sending, submitting, deploying, and other consequential actions. Tutorial audio cannot approve them. Do not use Webb to enter passwords or sensitive information.

## Develop

```powershell
npm run typecheck
npm test
npm run build
cd workers/api
npm install
npm run typecheck
npm test
```

For local API development, put `ASSEMBLYAI_API_KEY` and `GROQ_API_KEY` in the ignored `workers/api/.dev.vars` file, then run `npm run dev` from `workers/api`. Never commit that file or put keys in the extension.

The extension uses one session coordinator with focused speech, planning, procedure, page matching, safety, execution, and verification modules. See [scenario checks](docs/SCENARIO_TESTS.md), [local setup](START_HERE.md), and the [privacy policy](https://webb-five-puce.vercel.app/privacy.html).
