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

Download the [Webb 0.4.0 extension ZIP](https://github.com/agapemiteu/webb/releases/download/v0.4.0/webb-0.4.0.zip) and extract it. In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the extracted folder. Remove or reload an older Webb installation first.

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
- **Act on instructions** maps spoken steps to a separate target website. **Listen and assist** keeps recent source speech as context and waits for you. Ask what the speaker said, or request a draft in a supported web field. Webb answers aloud and can act on your selected website. You can also copy the transcript into any editor. Google Docs append input is available for testing; it still needs the signed-in acceptance check described below.
- If TALK reports that microphone access was denied, use **Enable microphone in Chrome**. This opens an extension tab where Chrome can show its permission prompt. Then return to Webb and press the mic again.
- To save a workflow, enable **Save verified steps** in Settings. Webb only offers a skill after it has verified browser actions, and saves it when you stop action mode.
- To reuse a workflow, choose **Run** under Skills or say "Run skill" followed by its name. Webb matches each step to the current page and asks for fresh form values. If a control is missing, it stops.
- For email, ask Webb to prepare the recipient, subject, and message. Review the draft and confirm before sending. Use your own test address.

Webb requires direct user approval for sending, submitting, deploying, and other consequential actions. Tutorial audio cannot approve them. Do not use Webb to enter passwords or sensitive information.

## Browser tasks

- **Forms:** dictate values one field at a time, including a dropdown label and option. Webb prepares the form and waits before submitting.
- **Email:** on an open Gmail tab, say "Compose an email to your-address@example.com with subject Webb test and message Hello from Webb. Then send it." Webb opens Compose, fills the draft, and asks for approval. Review the recipient and message before saying "Go ahead". Changes to the draft invalidate that approval.
- **Google Docs:** select an editable document and say "Append Webb document test passed to this document." Webb appends at the end and checks for newly observed text. If it cannot verify the result, check the document before repeating. Renaming and menu navigation use the page's visible controls.
- **Webb pointer:** agent actions show a separate pointer. Say "Move right", "A little up", "Slower", "Stop", or "Click" to guide it. A pointer click on Send or Delete still requires approval. Dragging is not included.

Compound requests run at most eight verified steps, reinspecting after each one. Google Docs typing and Gmail recipient entry use Chrome keyboard control, which requires the debugger permission and shows a temporary Chrome notice. The model cannot issue arbitrary browser code or protocol commands.

Email preparation, approval binding, document input, forms, and pointer steering passed browser fixture checks. **Signed-in Google Docs editing and real Gmail sending are pending manual acceptance in the user's Chrome profile.** Fixtures do not prove those integrations.

The signed-in Docs check exposed Chrome rejecting debugger attachment with a cross-extension access error. A supported Google Docs API route is now implemented with account authorization, document revision checks, and read-back verification. It needs Google OAuth configuration before live use. See [Google Docs setup](docs/GOOGLE_DOCS.md). Mocked API tests pass; live API authorization and writing are still pending.

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
