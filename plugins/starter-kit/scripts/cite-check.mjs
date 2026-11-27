// Citation check: are the quoted words really on the cited page? A research report is only as good as its sources, and a model
// can misquote, mix up two pages or invent a source. This fetches every cited page and looks for the quoted words in the page's
// visible text, so a wrong citation is caught by a machine instead of being trusted. It costs no tokens.
//
// The researcher writes each sourced claim as:   <claim> [source: <url> | "<the exact words on that page>"]
// Verdicts: VERIFIED (the words are on the page), CLOSE (nearly all of them, in order: a slight misquote; check it),
// NOT FOUND (not on the page: drop the claim or find a real source), UNREACHABLE (the page refused or timed out: unchecked,
// not wrong), TOO SHORT (a quote under 4 words proves nothing).
// Only public http(s) pages are fetched (never this computer, a private network or a cloud metadata address), GET only, no
// cookies or credentials, 15 seconds and 3 MB per page. Pages are DATA: nothing in them is followed.
// Run: node cite-check.mjs --file <report.md>   (exit 1 when any quote is NOT FOUND, or the report has no citations)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CITE = /^(.*?)\[source:\s*(\S+)\s*\|\s*["“](.+?)["”]\s*\]/;

export function extractCitations(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    const m = CITE.exec(line);
    if (m) out.push({ line: i + 1, claim: m[1].replace(/^\s*[-*+]\s*|^\s*\d+\.\s*/, "").trim(), url: m[2], quote: m[3].trim() });
  });
  return out;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "...", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', copy: "(c)", reg: "(r)", trade: "(tm)" };

// Evens out what differs between a quote and a page without changing what it says: case, spacing, curly quotes, dashes.
export function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[‘’‛′`]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The words a person sees on the page: no scripts, styles, comments or tags.
export function pageText(html) {
  return normalize(
    String(html)
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|td|th|section|article)>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m),
  );
}

const words = (s) => normalize(s).replace(/[^\p{L}\p{N}$€£%.&' -]/gu, " ").split(/\s+/).filter(Boolean);

export function verdictFor(text, quote) {
  const q = normalize(quote);
  if (words(q).length < 4) return "TOO SHORT";
  // Whole words only: "$1" must not match "$12".
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(?<![\\p{L}\\p{N}])${esc(q)}(?![\\p{L}\\p{N}])`, "u").test(text)) return "VERIFIED";
  const qw = words(q);
  const tw = words(text);
  const page = ` ${tw.join(" ")} `;
  if (page.includes(` ${qw.join(" ")} `)) return "VERIFIED"; // same words, different punctuation
  // A number or price must be on the page exactly: a changed number is never a "slight misquote".
  if (qw.some((w) => /\d/.test(w) && !page.includes(` ${w} `))) return "NOT FOUND";
  // Longest run of the quote's words that appears on the page, in order.
  let best = 0;
  for (let i = 0; i < qw.length; i++) {
    for (let j = qw.length; j > i + best; j--) {
      if (page.includes(` ${qw.slice(i, j).join(" ")} `)) {
        best = j - i;
        break;
      }
    }
  }
  return best / qw.length >= 0.7 ? "CLOSE" : "NOT FOUND";
}

// Only public web pages: refuses this computer, private networks, link-local and metadata addresses, and odd schemes.
export function safeUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") && !h.includes(":")) return false;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return false;
  if (h.includes(":") && (h === "::1" || h === "::" || /^(fc|fd|fe80)/.test(h) || h.startsWith("::ffff:"))) return false;
  return true;
}

async function fetchPage(url, fetcher) {
  if (!safeUrl(url)) return { error: "not a public web page" };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15_000);
    const r = await fetcher(url, { method: "GET", redirect: "follow", signal: ctl.signal, credentials: "omit", headers: { "user-agent": "starter-kit-cite-check", accept: "text/html,text/plain;q=0.9,*/*;q=0.1" } });
    clearTimeout(timer);
    if (!r.ok) return { error: `the page answered ${r.status}` };
    if (r.url && r.url !== url && !safeUrl(r.url)) return { error: "it redirected to a non-public address" };
    const body = await r.text();
    return { text: pageText(body.slice(0, 3_000_000)) };
  } catch (e) {
    return { error: e?.name === "AbortError" ? "timed out" : `could not be fetched (${e?.message ?? e})` };
  }
}

// Fetches each page once and checks every quote cited from it.
export async function checkCitations(citations, { fetcher = fetch } = {}) {
  const pages = new Map();
  for (const url of new Set(citations.map((c) => c.url))) pages.set(url, await fetchPage(url, fetcher));
  return citations.map((c) => {
    const p = pages.get(c.url);
    return p.error ? { ...c, verdict: "UNREACHABLE", why: p.error } : { ...c, verdict: verdictFor(p.text, c.quote) };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const file = a.includes("--file") ? a[a.indexOf("--file") + 1] : null;
  if (!file) {
    console.log('Use: node cite-check.mjs --file <report.md>   (claims written as: <claim> [source: <url> | "<exact words>"])');
    process.exit(1);
  }
  const cites = extractCitations(readFileSync(file, "utf8"));
  if (!cites.length) {
    console.log('No citations found. Every sourced claim needs [source: <url> | "<the exact words on that page>"]; a report without them is unchecked.');
    process.exit(1);
  }
  const results = await checkCitations(cites);
  for (const r of results) console.log(`${r.verdict.padEnd(11)} line ${r.line}: ${r.claim.slice(0, 90)}${r.why ? ` (${r.why})` : ""}`);
  const count = (v) => results.filter((r) => r.verdict === v).length;
  console.log(`${count("VERIFIED")} verified, ${count("CLOSE")} close, ${count("NOT FOUND")} not found, ${count("UNREACHABLE")} unreachable, ${count("TOO SHORT")} too short, of ${results.length}.`);
  if (count("NOT FOUND")) console.log("Drop every NOT FOUND claim or find a source that really says it. Mark UNREACHABLE ones as unchecked.");
  // exitCode, not exit(): ending the process by force right after a fetch crashes Node on Windows.
  process.exitCode = count("NOT FOUND") ? 1 : 0;
}
