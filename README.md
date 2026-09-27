# Webb

**Talk to the web.** Webb follows spoken instructions from you or from a tutorial, maps them to the page you have open, and checks what happened.

## Try it

- [Open the live practice site](https://webb-five-puce.vercel.app/)
- [Run the project setup walkthrough](https://webb-five-puce.vercel.app/demo/tutorial.html)
- [Try the lecture walkthrough](https://webb-five-puce.vercel.app/demo/tutorial.html?scenario=lecture)
- [Try the form walkthrough](https://webb-five-puce.vercel.app/demo/tutorial.html?scenario=form)
- [Try the team channel walkthrough](https://webb-five-puce.vercel.app/demo/tutorial.html?scenario=teams)

The form and team channel are browser-only practice pages. They do not send messages or connect to external services.

## Install the Chrome extension

Download the [Webb 0.2.3 extension ZIP](https://github.com/agapemiteu/webb/releases/download/v0.2.3/webb-0.2.3.zip) and extract it. In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the extracted folder. Remove or reload an older Webb installation first.

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
- In **FOLLOW**, open the tutorial tab and select **Follow this tab**. Webb starts listening if Chrome has granted access. If it shows **Ready to listen**, click the blue Webb icon in Chrome's top toolbar on that tab. Select a different website as the target before asking Webb to act. Play one step at a time.
- If TALK reports that microphone access was denied, use **Enable microphone in Chrome**. This opens an extension tab where Chrome can show its permission prompt. Then return to Webb and press the mic again.
- To save a workflow, enable **Save verified steps** in Settings. Webb only offers a skill after it has verified browser actions, and saves it when you stop FOLLOW.
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
