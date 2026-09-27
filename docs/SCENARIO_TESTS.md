# Webb demo journeys

Run the Chrome extension against the public practice pages at [webb-five-puce.vercel.app](https://webb-five-puce.vercel.app/). Install Webb from the GitHub source instructions in the root README. Start with the public Worker URL already configured in the extension.

## Project walkthrough

Open the Acme Cloud target and the tutorial page in separate tabs. Select Acme Cloud as Webb's target, start FOLLOW from the tutorial tab, then switch to Acme Cloud.

- The opening explanation should create no browser action.
- “Open your project settings” should navigate to Settings.
- The outdated word “Integrations” should map to Connections.
- Say “I already have a workspace” and check that the procedure skips that step.
- Correct “Demo Production” to “Webb Demo” and confirm the form value.
- “Deploy” should wait. Confirm directly with Webb before the local simulation completes.

## Support form

Open `/demo/form.html` as the target and `/demo/tutorial.html?scenario=form` as the tutorial. Prepare the project name and request text, then change one value with direct speech. Review both fields. The request must wait for direct approval before submission. Submitting shows a local practice message and sends no network request.

## Lecture

Open `/demo/?reset` as the target and `/demo/tutorial.html?scenario=lecture` as the tutorial. Play the background and alternative clips first. Webb should report what it heard without changing the page. Only the explicit Settings instruction should act. The tutorial's following instruction uses the older Integrations label to check page matching.

## Team channel

Open `/demo/teams.html` as the target and `/demo/tutorial.html?scenario=teams` as the tutorial. Webb should draft the update in the composer, wait while you review it, and ask before posting. Workroom is a local simulation. It does not connect to Microsoft Teams or send a real message.

## YouTube and other sites

For a real source test, open a public YouTube software tutorial in one tab and a practice page in another. Start FOLLOW while the tutorial tab is active. Confirm that only its audio is transcribed. Pick a tutorial with clear steps and pause between them. Do not use a real account or submit a real message until the extension has been verified in Chrome and you have reviewed its privacy disclosure.

For Chrome's audio check, activate the source tab and press **Start listening**. Choose that source under **Chrome Tab**, enable **Share tab audio**, and share it. Webb must show Connected and heard speech. A cancelled prompt or a stream without audio must show a retry instruction and leave capture off. No action runs until a different target is selected. Microphone permission is separate from source sharing. For TALK, use **Enable microphone in Chrome** if needed, then retry the mic.

For a lecture transcript, choose **Capture notes**. The target page must remain unchanged while source speech appears in Notes. Stop listening and verify that the notes remain. Copy them into Google Docs. Direct editing of the Google Docs document body is not implemented; the UI must explain that instead of claiming a write occurred.

For a real email test, say “Open Gmail” or give Webb an HTTPS URL. Then use separate short instructions to compose, fill the recipient, subject, and body, review them, and say “yes, send it” only when an email send action is waiting. Use your own test address. A tutorial can never approve Send. Real Gmail capture, redirects, and send are not validated by the sandbox tests, so perform this test manually before recording the demo.

## Safety checks

- A fill prepares a field and is verified after writing.
- Submit, Send, Deploy, and similar actions wait for direct user approval.
- A changed or missing target stops the action.
- Low-confidence or explanation-only turns produce no browser action.
- Tutorial audio cannot approve a pending action.

## Listen and assist acceptance

Share any source tab with audio and choose Listen and assist. Speech must appear without acting on the selected website. Ask what the source just said; Webb should answer using recent speech. Ask to open Settings while the source remains connected, then ask it to draft a note from the source into the support form's Tell us a little more field. The draft must not submit. Confirm native spoken replies, disable them in Settings, and use Stop speaking and listen to me to regain the microphone. Source speech cannot approve a consequential action.
