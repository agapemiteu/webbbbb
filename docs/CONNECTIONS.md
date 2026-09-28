# Customer connections

Webb uses the selected webpage for browser actions. An open, signed-in tab is page context, not an OAuth connection. Customers do not supply API keys or create Google applications.

| Capability | Customer setup | Current status |
| --- | --- | --- |
| Voice form filling | Choose the page and start TALK | Editable HTML fields and native selects supported |
| Source audio | Start listening and approve Chrome tab audio sharing | Supported |
| Google Docs API | Settings > Connect Google Docs, approve Google consent | Implemented; publisher OAuth configuration and live acceptance pending |
| Gmail webpage actions | Open Gmail, review draft, confirm sending | Signed-in acceptance pending |

## Form commands

- "Fill Email with demo@example.com."
- "Change Company to Webb Demo."
- "Select Deployment in What do you need help with."
- "Fill Tell us a little more with Please review our deployment."
- "Send request", then approve only after reviewing the form.

Exact field commands preserve dictated values and prepare the form. Missing labels, duplicate labels, and unavailable dropdown options ask for clarification. Disabled, read-only, and password inputs are rejected by the executor. Field verification means the page accepted the value, not that a server accepted a submission. Custom widgets and embedded cross-origin forms may need additional adapters.

## Integration groundwork

Google Docs has explicit connection status, customer authorization, disconnect, and a link to Google account permissions. Disconnect disables Webb's API route and clears its cached Google tokens. It does not revoke Google's grant; the customer can revoke that in Google account permissions. Withdrawing Webb consent also disables this connection. Tokens are never persisted by Webb or sent to its Worker.

The publisher configures the Google app once as described in [GOOGLE_DOCS.md](GOOGLE_DOCS.md). Until that is configured, the customer interface marks the account integration unavailable. Do not present missing publisher configuration as a customer task.

Future integrations should follow the same pattern: explicit customer authorization, minimal permissions, connection state, disconnect, a fixed action adapter, and verification. Do not accept arbitrary endpoint URLs or tokens from page content or model output. This build does not include a generic endpoint marketplace.
