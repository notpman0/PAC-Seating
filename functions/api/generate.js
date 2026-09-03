// Cloudflare Pages Function — deployed automatically at /api/generate
// when this whole folder is pushed to a Cloudflare Pages project.
//
// This is the piece that keeps the Gemini key off the public page: it runs
// on Cloudflare's server, not in the visitor's browser, so the key set below
// (as a Pages secret — see README.md) is never sent to anyone.

export async function onRequestPost(context) {
  const { request, env } = context;

  // Basic abuse guard: reject absurdly large prompts before they cost you a
  // Gemini call. Raise/lower as you like.
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const prompt = body && body.prompt;
  if (typeof prompt !== "string" || !prompt.trim()) {
    return jsonResponse({ error: "Missing 'prompt' string in request body" }, 400);
  }
  if (prompt.length > 8000) {
    return jsonResponse({ error: "Prompt too long" }, 413);
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    // You deployed without setting the secret — see README.md.
    return jsonResponse({ error: "Server is missing GEMINI_API_KEY. Set it as a Pages secret." }, 500);
  }

  // Newer models (like gemini-3.6-flash) tend to get hit with heavy public
  // demand right after launch and 503 ("high demand") a lot. Retry a couple
  // times per model with short backoff, then fall back to the next model —
  // all server-side, in one round trip, so the browser just waits once
  // instead of the client juggling multiple calls through this proxy.
  const models = env.GEMINI_MODEL ? [env.GEMINI_MODEL] : ["gemini-3.6-flash", "gemini-flash-latest"];
  const ATTEMPTS_PER_MODEL = 2;
  let upstream, text;
  for (const model of models) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.15 },
          }),
        }
      );
      if (upstream.ok) break;
      if ((upstream.status === 503 || upstream.status === 429) && attempt < ATTEMPTS_PER_MODEL) {
        await new Promise((r) => setTimeout(r, 700 * attempt));
      }
    }
    if (upstream.ok) break;
    if (upstream.status !== 503 && upstream.status !== 429) break; // not a "busy" error — no point trying another model
  }

  text = await upstream.text();
  // Relay Gemini's final status/body straight through — the client already
  // knows how to read a Gemini-shaped response and surface Gemini-shaped
  // errors.
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
