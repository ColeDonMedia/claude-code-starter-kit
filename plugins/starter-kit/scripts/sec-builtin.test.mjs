// Tests for sec-builtin.mjs, the kit's own no-install security checks. Run: node --test plugins/starter-kit/scripts/sec-builtin.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCompose, checkDeps, checkDockerfile, checkLive, checkWorkflow, parseLock, scan } from "./sec-builtin.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "sec-builtin.mjs");
const rules = (fs) => fs.map((f) => f.rule).sort();

test("workflows: untrusted text in a shell step, stranger's code under pull_request_target, echoed secrets, unpinned actions", () => {
  const bad = [
    "on:", "  pull_request_target:", "permissions: write-all", "jobs:", "  t:", "    runs-on: ubuntu-latest", "    steps:",
    "      - uses: actions/checkout@v4", "        with:", "          ref: ${{ github.event.pull_request.head.sha }}",
    "      - run: |", "          echo \"${{ github.event.issue.title }}\"", "          echo ${{ secrets.TOKEN }}",
    "      - uses: ./local-action", "      - uses: actions/setup-node@1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a",
  ].join("\n");
  assert.deepEqual(rules(checkWorkflow(bad, "ci.yml")), ["wf-injection", "wf-prt-checkout", "wf-secret-echo", "wf-unpinned", "wf-write-all"]);
  const good = ["on: pull_request", "jobs:", "  t:", "    steps:", "      - uses: actions/checkout@1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a",
    "      - env:", "          TITLE: ${{ github.event.issue.title }}", "        run: echo \"$TITLE\"", "      - run: echo ${{ github.event.pull_request.number }}"].join("\n");
  assert.deepEqual(checkWorkflow(good, "ci.yml"), []);
});

test("Dockerfiles: baked secrets, curl into a shell, unpinned images and root are caught; a careful file passes", () => {
  const bad = "FROM node\nENV API_KEY=abc123\nARG NPM_TOKEN\nRUN curl -fsSL https://x.example/i.sh | sh\nADD https://x.example/a.tgz /a\nCMD node app.js";
  assert.deepEqual(rules(checkDockerfile(bad, "Dockerfile")), ["docker-add-url", "docker-latest", "docker-pipe-shell", "docker-root", "docker-secret", "docker-secret-arg"]);
  const good = "FROM node:22-slim AS build\nRUN npm ci\nFROM node:22-slim\nCOPY --from=build /app /app\nENV NODE_ENV=production\nENV DB_PASSWORD=$DB_PASSWORD\nUSER node\nCMD node app.js";
  assert.deepEqual(checkDockerfile(good, "Dockerfile"), []);
});

test("Compose: privileged, the Docker socket and a database open to the network are caught; a local-only port is fine", () => {
  const bad = "services:\n  db:\n    image: postgres:16\n    ports:\n      - \"5432:5432\"\n  x:\n    privileged: true\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock\n";
  assert.deepEqual(rules(checkCompose(bad, "compose.yaml")), ["compose-db-exposed", "compose-docker-sock", "compose-privileged"]);
  assert.deepEqual(checkCompose("services:\n  db:\n    ports:\n      - \"127.0.0.1:5432:5432\"\n      - \"3000:3000\"\n", "compose.yaml"), []);
});

test("lockfiles from each language are read into name and version", () => {
  const npm = parseLock("package-lock.json", JSON.stringify({ packages: { "": { name: "me" }, "node_modules/left-pad": { version: "1.3.0" }, "node_modules/@a/b": { version: "2.0.0" }, "node_modules/l": { link: true } } }));
  assert.deepEqual(npm.map((p) => `${p.name}@${p.version}`), ["left-pad@1.3.0", "@a/b@2.0.0"]);
  assert.deepEqual(parseLock("requirements.txt", "flask==3.0.0\nrequests[socks]==2.31.0\n# x==1\ndjango>=4").map((p) => p.name), ["flask", "requests"]);
  assert.deepEqual(parseLock("Cargo.lock", "[[package]]\nname = \"me\"\nversion = \"0.1.0\"\n\n[[package]]\nname = \"serde\"\nversion = \"1.0.0\"\nsource = \"registry+https://x\"\n").map((p) => p.name), ["serde"]);
  assert.deepEqual(parseLock("go.sum", "golang.org/x/net v0.17.0 h1:a=\ngolang.org/x/net v0.17.0/go.mod h1:b=\n"), [{ ecosystem: "Go", name: "golang.org/x/net", version: "v0.17.0" }]);
  assert.deepEqual(parseLock("yarn.lock", "\"@babel/core@^7.0.0\":\n  version \"7.23.0\"\nlodash@^4:\n  version \"4.17.20\"\n").map((p) => `${p.name}@${p.version}`), ["@babel/core@7.23.0", "lodash@4.17.20"]);
  assert.deepEqual(parseLock("Gemfile.lock", "GEM\n  specs:\n    rack (2.2.3)\n      x (>= 1)\n").map((p) => p.name), ["rack"]);
  assert.deepEqual(parseLock("package-lock.json", "not json"), []);
});

test("dependencies: OSV answers become findings with severity and the fixed version; known malware is HIGH", async () => {
  const fake = async (u, opts) => {
    if (u.endsWith("querybatch")) {
      const qs = JSON.parse(opts.body).queries;
      return { ok: true, json: async () => ({ results: qs.map((q) => ({ vulns: q.package.name === "lodash" ? [{ id: "GHSA-1" }] : q.package.name === "evil" ? [{ id: "MAL-2024-1" }] : [] })) }) };
    }
    if (u.endsWith("GHSA-1")) return { ok: true, json: async () => ({ id: "GHSA-1", summary: "prototype pollution", database_specific: { severity: "HIGH" }, affected: [{ package: { name: "lodash" }, ranges: [{ events: [{ introduced: "0" }, { fixed: "4.17.21" }] }] }] }) };
    return { ok: true, json: async () => ({ id: "MAL-2024-1" }) };
  };
  const out = await checkDeps([{ ecosystem: "npm", name: "lodash", version: "4.17.20" }, { ecosystem: "npm", name: "evil", version: "1.0.0" }, { ecosystem: "npm", name: "ok", version: "1.0.0" }], { fetchImpl: fake });
  assert.equal(out.length, 2);
  assert.equal(out[0].severity, "HIGH");
  assert.match(out[0].fix, /upgrade to 4\.17\.21/);
  assert.equal(out[1].rule, "dep-malware");
  assert.equal(out[1].severity, "HIGH");
});

test("no internet is reported as not checked, never as a pass", async () => {
  const dir = mkdtempSync(join(tmpdir(), "secb-"));
  try {
    writeFileSync(join(dir, "requirements.txt"), "flask==3.0.0\n");
    const res = await scan(dir, { fetchImpl: async () => { throw new Error("offline"); } });
    assert.deepEqual(res.findings, []);
    assert.match(res.notes.join(" "), /not checked.*not a pass/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("live: a careless local server is caught (headers, CORS with cookies, script-readable session, served .env, stack trace)", async () => {
  const careless = createServer((req, res) => {
    if (req.url === "/.env") return res.end("DATABASE_URL=postgres://x\n");
    if (req.url.startsWith("/__starter_kit")) return (res.statusCode = 500), res.end("Error\n    at handler (/app/server.js:10:5)\n");
    res.setHeader("content-type", "text/html");
    res.setHeader("x-powered-by", "Express");
    res.setHeader("access-control-allow-origin", req.headers.origin || "*");
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("set-cookie", "session=abc; Path=/");
    res.end("<html></html>");
  });
  const careful = createServer((req, res) => {
    res.statusCode = req.url === "/" ? 200 : 404;
    res.setHeader("content-type", "text/html");
    res.setHeader("content-security-policy", "default-src 'self'; frame-ancestors 'self'");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    res.setHeader("set-cookie", "session=abc; HttpOnly; SameSite=Lax; Path=/");
    res.end(req.url === "/" ? "<html></html>" : "Not found");
  });
  await Promise.all([new Promise((r) => careless.listen(0, "127.0.0.1", r)), new Promise((r) => careful.listen(0, "127.0.0.1", r))]);
  try {
    const bad = await checkLive(`http://127.0.0.1:${careless.address().port}/`);
    assert.deepEqual(rules(bad), ["cookie-httponly", "cookie-samesite", "cors-any-credentials", "error-trace", "hdr-csp", "hdr-frame", "hdr-nosniff", "hdr-referrer", "hdr-version", "leak-file"]);
    assert.deepEqual(await checkLive(`http://127.0.0.1:${careful.address().port}/`), []);
    await assert.rejects(checkLive("https://example.com/"), /only run against this computer/);
  } finally {
    careless.close();
    careful.close();
  }
});

test("the command blocks on a HIGH finding and refuses a real site", () => {
  const dir = mkdtempSync(join(tmpdir(), "secb-"));
  try {
    writeFileSync(join(dir, "Dockerfile"), "FROM node:22\nENV STRIPE_SECRET_KEY=abc\nUSER node\n");
    const r = spawnSync(process.execPath, [SCRIPT, "--project", dir, "--offline"], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /^HIGH docker-secret Dockerfile:2: STRIPE_SECRET_KEY is written into the image/m);
    const bad = spawnSync(process.execPath, [SCRIPT, "--project", dir, "--url", "https://example.com"], { encoding: "utf8" });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /never touch a real site/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the same unpinned problem in one workflow is reported once, with every line", async () => {
  const { render } = await import("./sec-builtin.mjs");
  const wf = ["jobs:", "  t:", "    steps:", "      - uses: actions/checkout@v7", "      - uses: actions/setup-node@v7", "      - uses: actions/checkout@v7"].join("\n");
  const out = render({ findings: checkWorkflow(wf, ".github/workflows/ci.yml"), notes: [] });
  assert.equal(out.split("\n").length, 1);
  assert.match(out, /^MEDIUM wf-unpinned \.github\/workflows\/ci\.yml:4,5,6: 3 steps are not pinned .*\(actions\/checkout@v7, actions\/setup-node@v7\)/);
});
