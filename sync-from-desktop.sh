#!/bin/bash
# Syncs the latest local dev copy (seating-planner-TEST3.html on the Desktop,
# which has a hardcoded Gemini key for local testing) into this repo's
# index.html, automatically stripping the key and repointing the AI Generate
# feature at /api/generate instead. Run this after making changes to the
# Desktop copy and before committing/pushing here.
#
# Usage: ./sync-from-desktop.sh

set -e
cd "$(dirname "$0")"

SRC="$HOME/Desktop/seating-planner-TEST3.html"
DEST="index.html"

if [ ! -f "$SRC" ]; then
  echo "Source not found: $SRC"
  exit 1
fi

python3 - "$SRC" "$DEST" <<'PYEOF'
import re, sys

src, dest = sys.argv[1], sys.argv[2]
with open(src, "r") as f:
    html = f.read()

# Strip the hardcoded key + model-fallback block, replace with the
# proxy-calling version that talks to /api/generate.
key_block = re.search(
    r'  // ---------- AI Generate ----------.*?function buildVenueSchemaText\(\)\{',
    html, re.DOTALL
)
if not key_block:
    print("WARNING: AI Generate header block not found — key may not have been stripped!")
else:
    replacement = '''  // ---------- AI Generate ----------
  // Turns a plain-English instruction into a small JSON list of seat
  // operations via Gemini, then applies them to the real data model.
  // SECURITY: no API key lives in this file at all. The browser calls our
  // OWN /api/generate endpoint (a Cloudflare Pages Function — see
  // functions/api/generate.js), which holds the real Gemini key server-side
  // as a Pages secret and proxies the request. That function also owns the
  // retry/model-fallback logic (busy-model handling), so this client just
  // makes one call and waits.
  function buildVenueSchemaText(){'''
    html = html[:key_block.start()] + replacement + html[key_block.end():]

fetch_block = re.search(
    r'    // Gemini\'s free-tier model returns 503.*?if\(!res\.ok\)\{\n      errText = await res\.text\(\);\n      throw new Error\(`Gemini API error \$\{res\.status\} after trying all models: \$\{errText\.slice\(0,300\)\}`\);\n    \}',
    html, re.DOTALL
)
if not fetch_block:
    print("WARNING: fetch/retry block not found — client may still be calling Gemini directly!")
else:
    replacement = '''    document.getElementById("aiStatus").textContent = "Thinking…";
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ prompt: instructions })
    });
    if(!res.ok){
      const errText = await res.text();
      throw new Error(`Server error ${res.status}: ${errText.slice(0,300)}`);
    }'''
    html = html[:fetch_block.start()] + replacement + html[fetch_block.end():]

if "GEMINI_API_KEY" in html:
    print("ERROR: GEMINI_API_KEY still present after sync — NOT writing output. Check the file manually.")
    sys.exit(1)

with open(dest, "w") as f:
    f.write(html)
print(f"Synced {src} -> {dest} (key stripped, /api/generate wired up)")
PYEOF
