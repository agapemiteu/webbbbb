# Acme Cloud demo

Run `node apps/demo/server.mjs` from the repository root, or `npm run dev` from this directory. The server listens on `http://127.0.0.1:4173` by default. Set `PORT` to use another port.

Open `/` as Webb's target tab and `/tutorial.html` as its followed tab. In the tutorial tab, play each spoken step manually. The tutorial says **Integrations**, while the target app calls that settings section **Connections**.

The target flow is Overview → Settings → Connections → General settings → Workspace name, then Deployments → Deploy production. The workspace already exists so the user can interrupt and skip its creation. The name saves as the field changes. A production deployment changes the status to **Live**. The app keeps this state in browser local storage.

For another run, open `http://127.0.0.1:4173/?reset` in the target tab. This clears the demo state and removes the reset query from the address bar.

The tutorial uses the browser's speech synthesis. Verify that Webb's followed-tab capture hears it in the Chrome build used for judging. If it does not, play a recorded version of the same lines in the tutorial tab.
