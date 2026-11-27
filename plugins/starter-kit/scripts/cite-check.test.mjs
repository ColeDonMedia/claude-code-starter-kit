// Citation check: every quoted source in a research report is fetched and the quoted words must really be on the page.
// A machine check, so a wrong or invented citation is caught without trusting the model that wrote it. No network here: a fake
// fetcher stands in for the web. Run: node --test plugins/starter-kit/scripts/cite-check.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCitations, extractCitations, pageText, safeUrl, verdictFor } from "./cite-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, "..");

const PAGES = {
  "https://acme.example/pricing": `<html><head><title>Pricing</title><style>.x{}</style><script>var hidden = "Team plan costs $1";</script></head>
    <body><h1>Pricing</h1><p>The Team plan costs <b>$12&nbsp;per user</b> per month,
    billed annually.</p><p>Free plan: up to 3 projects &amp; 1 GB storage.</p><p>We’re hiring!</p></body></html>`,
  "https://forum.example/thread/9": "<p>I left because exporting invoices took forever and support never answered.</p>",
};
const fakeFetch = async (url) => {
  if (url.includes("blocked")) return { ok: false, status: 403, text: async () => "" };
  if (url.includes("timeout")) throw new Error("timed out");
  const body = PAGES[url];
  return body ? { ok: true, status: 200, headers: { get: () => "text/html" }, text: async () => body } : { ok: false, status: 404, text: async () => "" };
};

const REPORT = `# Pricing research
- Acme's team plan is $12 per user a month [source: https://acme.example/pricing | "The Team plan costs $12 per user per month"]
- Acme's free plan allows 3 projects [source: https://acme.example/pricing | "Free plan: up to 3 projects & 1 GB storage"]
- Acme has an enterprise tier at $99 [source: https://acme.example/pricing | "Enterprise plan costs $99 per user per month"]
- Users complain about exports [source: https://forum.example/thread/9 | "exporting invoices took forever"]
- Hidden script text is not page text [source: https://acme.example/pricing | "Team plan costs $1"]
- Competitor B blocks bots [source: https://blocked.example/page | "anything at all here"]
- A page that times out [source: https://timeout.example/x | "some words from the page"]
- Close wording [source: https://acme.example/pricing | "The Team plan costs $12 per user each month"]
- No source given for this one
`;

test("citations are read from the report with their URL and quoted words", () => {
  const c = extractCitations(REPORT);
  assert.equal(c.length, 8);
  assert.deepEqual(c[0], { line: 2, claim: "Acme's team plan is $12 per user a month", url: "https://acme.example/pricing", quote: "The Team plan costs $12 per user per month" });
});

test("page text drops scripts, styles and tags, and evens out entities, quotes and spaces", () => {
  const t = pageText(PAGES["https://acme.example/pricing"]);
  assert.match(t, /the team plan costs \$12 per user per month/);
  assert.match(t, /up to 3 projects & 1 gb storage/);
  assert.match(t, /we're hiring/);
  assert.doesNotMatch(t, /var hidden/);
});

test("each citation gets VERIFIED, CLOSE, NOT FOUND or UNREACHABLE", async () => {
  const r = await checkCitations(extractCitations(REPORT), { fetcher: fakeFetch });
  const by = Object.fromEntries(r.map((x) => [x.claim.slice(0, 30), x.verdict]));
  assert.equal(by["Acme's team plan is $12 per us"], "VERIFIED");
  assert.equal(by["Acme's free plan allows 3 proj"], "VERIFIED");
  assert.equal(by["Acme has an enterprise tier at"], "NOT FOUND", "an invented quote is caught");
  assert.equal(by["Users complain about exports"], "VERIFIED");
  assert.equal(by["Hidden script text is not page"], "NOT FOUND", "text inside a script is not what the page says");
  assert.equal(by["Competitor B blocks bots"], "UNREACHABLE");
  assert.equal(by["A page that times out"], "UNREACHABLE");
  assert.equal(by["Close wording"], "CLOSE");
});

test("a quote must be long enough to mean something", () => {
  assert.equal(verdictFor("the team plan costs $12 per user per month", "$12"), "TOO SHORT");
});

test("only public web pages are fetched: never this computer or a private network", () => {
  for (const u of ["https://example.com/a", "http://docs.example.org/x?y=1"]) assert.equal(safeUrl(u), true, u);
  for (const u of ["file:///etc/passwd", "http://localhost:3000/admin", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://172.16.0.1/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "ftp://example.com/x", "http://router.local/", "http://user:pass@example.com/"]) assert.equal(safeUrl(u), false, u);
});

test("the command line prints one line per citation and fails when a quote is not on its page", () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-cite-"));
  try {
    const f = join(dir, "report.md");
    writeFileSync(f, "- Nothing to check here, no sources\n");
    const r = spawnSync(process.execPath, [join(HERE, "cite-check.mjs"), "--file", f], { encoding: "utf8" });
    assert.equal(r.status, 1, "a report with no checkable citations is not a pass");
    assert.match(r.stdout, /No citations found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("research and planning check every citation, and the researcher writes them in the checkable form", () => {
  const read = (f) => spawnSync(process.execPath, ["-e", `process.stdout.write(require("fs").readFileSync(${JSON.stringify(join(PLUGIN, f))}, "utf8"))`], { encoding: "utf8" }).stdout;
  assert.match(read("agents/researcher.md"), /\[source: <url> \| "<the exact words on that page>"\]/);
  assert.match(read("commands/research.md"), /cite-check\.mjs" --file/);
  assert.match(read("commands/spec.md"), /cite-check\.mjs" --file/);
});
