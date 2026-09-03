# PAC Seating — Cloudflare Pages deployment

This folder is ready to deploy as-is. `index.html` has **no API key in it** —
the AI Generate feature calls `/api/generate`, a small serverless function
(`functions/api/generate.js`) that holds the real Gemini key server-side, as
a Cloudflare secret. Nobody who views the page's source ever sees a key.

## Deploy (dashboard, no CLI needed)

1. Go to the Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Upload assets** (or connect a GitHub repo if you'd rather push this folder there first — either works).
2. Upload/point it at this whole folder (`index.html` + `functions/`). Cloudflare Pages auto-detects the `functions/` folder and turns `functions/api/generate.js` into a live endpoint at `/api/generate` — no extra config.
3. Once the project exists, go to its **Settings → Environment variables** (or **Settings → Functions → Secrets** depending on the current dashboard layout) and add:
   - `GEMINI_API_KEY` = your Gemini key, marked as **Secret** (encrypted, never shown again after saving).
   - Optionally `GEMINI_MODEL` = a specific model name, if you want to pin one. Leave it unset and the function tries `gemini-3.6-flash` first, then falls back to `gemini-flash-latest` (with a couple of retries each) if the first is returning 503 "high demand" — new models often get hit hard right after launch, so this fallback avoids most of that.
4. Redeploy (Cloudflare usually prompts you to after adding a variable — it needs to redeploy for the secret to take effect).
5. Open the deployed URL, click **✨ AI Generate**, try a prompt. If it errors with "Server is missing GEMINI_API_KEY", the secret didn't get set on the right environment (check you set it on **Production**, not just Preview).

## Deploy (CLI, if you have `wrangler` installed)

```bash
cd pac-seating-cloudflare
npx wrangler pages deploy . --project-name=pac-seating
npx wrangler pages secret put GEMINI_API_KEY --project-name=pac-seating
```

The second command prompts you to paste the key — it goes straight into
Cloudflare's encrypted secret store, never into a file you'd commit.

## Rotate the key you already used locally

You pasted a Gemini key earlier in this conversation for local testing, and
it also briefly lived inside `seating-planner-TEST3.html` on your Desktop
(that copy still has it hardcoded — this `pac-seating-cloudflare/index.html`
copy does not). Since that key has been visible in plaintext outside
Cloudflare's secret store, it's worth rotating it in
[Google AI Studio](https://aistudio.google.com/apikey) before/after deploying
— delete the old one, generate a fresh one, and use *that* as the
`GEMINI_API_KEY` secret above. Takes under a minute and costs nothing.

## What NOT to do

- Don't commit `seating-planner-TEST3.html` (the Desktop copy with the
  hardcoded key) to any public repo.
- Don't paste the key back into `index.html` in this folder "to make it
  easier" — that defeats the entire point of this setup.

## Basic abuse protection already included

`functions/api/generate.js` rejects prompts over 8000 characters before
they'd cost you a Gemini call. If you want tighter protection (e.g. a simple
shared password gate, or Cloudflare's built-in rate-limiting rules), ask and
it can be added — this covers the "key never leaks" problem, not "someone
spams the endpoint" (a much smaller risk, and one Cloudflare's own free-tier
DDoS protection already blunts significantly).
