# Webb website and practice journeys

The Vercel site hosts the product landing page, privacy policy, and practice journeys. The Acme Cloud, Fieldnotes, and Workroom pages are test targets for the Chrome extension. Their tutorial pages use browser speech synthesis. They are not recordings of an actual Webb session.

Build the public files with `node apps/site/build.mjs`. Run the local preview server from the repository root with `node apps/site/server.mjs`. It serves `http://127.0.0.1:4174` and includes project setup, forms, team channel, and lecture walkthroughs.

The live Cloudflare Worker powers voice transcription and planning from the extension. See [the scenario acceptance checks](../../docs/SCENARIO_TESTS.md).
