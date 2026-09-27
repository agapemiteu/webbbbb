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

For Chrome's tab capture check, activate the YouTube tab, click **Follow active tutorial tab**, and then click the pinned Webb toolbar icon on that same tab. The panel must change to **FOLLOWING** and show heard speech. If the YouTube tab was mistakenly selected as TARGET, FOLLOW must clear it and still start listening. No browser action should run until a different target is chosen. The tutorial tab must never be accepted as its own target. If the video was open before installing Webb, the toolbar click should also load Webb's page script without requiring a reload. Dismissing microphone permission must not stop FOLLOW; retry the microphone separately for TALK and interruptions.

For a real email test, say “Open Gmail” or give Webb an HTTPS URL. Then use separate short instructions to compose, fill the recipient, subject, and body, review them, and say “yes, send it” only when an email send action is waiting. Use your own test address. A tutorial can never approve Send. Real Gmail capture, redirects, and send are not validated by the sandbox tests, so perform this test manually before recording the demo.

## Safety checks

- A fill prepares a field and is verified after writing.
- Submit, Send, Deploy, and similar actions wait for direct user approval.
- A changed or missing target stops the action.
- Low-confidence or explanation-only turns produce no browser action.
- Tutorial audio cannot approve a pending action.
