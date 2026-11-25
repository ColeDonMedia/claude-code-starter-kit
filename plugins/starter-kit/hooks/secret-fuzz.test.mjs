// Red team for the secret scanner: the same kinds of secret, written in the many places and formats they really turn
// up, and the harmless look-alikes that must NOT be flagged (false alarms make people turn guards off).
// Fake secrets are built from pieces at runtime so this file contains none. When a leak format slips through in real
// life, add it here first, watch it fail, then fix the scanner.
// Run: node --test plugins/starter-kit/hooks/secret-fuzz.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { scanText } from "../scripts/secret-scan.mjs";

const j = (...p) => p.join("");
const LEAKS = {
  "postgres url with password": `DATABASE_URL=${j("postgres", "://admin:", "S3cretPass99", "@db.example.com:5432/app")}`,
  "mongodb srv url": `uri = "${j("mongodb+srv", "://user:", "Pa55w0rdXyz1", "@cluster0.mongodb.net/test")}"`,
  "git remote with token": `const url = "${j("https", "://deploy:", "ghx9Kd82LmQ4zP", "@git.example.com/repo.git")}";`,
  "bearer token header": `headers: { Authorization: "Bearer ${j("k8Zq2LmP9wXr4TvN1b", "7Yc3Hs5Qd0")}" }`,
  "json camelCase key": `{ "apiKey": "${j("k8Zq2LmP9w", "Xr4TvN1b")}" }`,
  "yaml lowercase key": `api_key: ${j("k8Zq2LmP9w", "Xr4TvN1b7Y")}`,
  "python lowercase password": `password = "${j("Tr0ub4dor", "&3xyz")}"`,
  "js camelCase secret": `const secretKey = '${j("h7Jd92Kslq", "0Pzm3Vn8")}';`,
  "aws secret in export": `export AWS_SECRET_ACCESS_KEY=${j("wJalrXUtnFEMI/K7MDENG", "/bPxRfiCYk8Zq2LmP9w")}`,
  "client secret": `client_secret=${j("abcDEF1234", "56ghiJKL")}`,
  "stripe test key": `STRIPE_KEY=${j("sk_", "test_", "4eC39HqLyjWDarjtT1zdp7dc")}`,
  "gitlab token": `token: ${j("glpat", "-", "k8Zq2LmP9wXr4TvN1b7Y")}`,
  "sendgrid key": j("SG", ".", "k8Zq2LmP9wXr4TvN1b7Yc3", ".", "Hs5Qd0k8Zq2LmP9wXr4TvN1b7Yc3Hs5Qd0k8Zq2LmP9"),
  "twilio sid": j("AC", "0123456789abcdef0123456789abcdef"),
  "discord bot token": j("MTIzNDU2Nzg5MDEyMzQ1Njc4", ".", "Gh4Kd9", ".", "k8Zq2LmP9wXr4TvN1b7Yc3Hs5Qd"),
  "telegram bot token": `bot = "${j("123456789", ":", "AAHk8Zq2LmP9wXr4TvN1b7Yc3Hs5Qd0k8Zq")}"`,
  "slack webhook": j("https://hooks.", "slack.com/services/", "T0123ABCD", "/B0123ABCD", "/k8Zq2LmP9wXr4TvN1b7Yc3Hs"),
  "azure storage key": `AccountKey=${j("k8Zq2LmP9wXr4TvN1b7Yc3Hs5Qd0k8Zq2LmP9wXr4TvN1b7Yc3Hs5Qd0k8Zq2LmP9wXr4Tv", "==")}`,
  "huggingface token": j("hf", "_", "k8Zq2LmP9wXr4TvN1b7Yc3Hs5Qd0kAbCd"),
  "digitalocean token": j("dop", "_v1_", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
  "shopify token": j("shp", "at_", "0123456789abcdef0123456789abcdef"),
  "private key header": j("-----BEGIN ", "OPENSSH PRIVATE KEY-----"),
  "github fine-grained token": j("github", "_pat_", "11ABCDEFG0", "k8Zq2LmP9wXr4TvN1b7Yc3Hs5Qd0k8Zq2LmP9wXr4TvN1b7Yc3Hs5Qd0kAbCd12"),
  "env file line in a markdown block": `    OPENAI_API_KEY=${j("sk-", "proj-", "k8Zq2LmP9wXr4TvN1b7Yc3Hs5Qd0k8Zq2LmP9")}`,
};

const FINE = [
  "const token = getToken();", "password = input('Password: ')", "password: string", "const apiKey = process.env.API_KEY;", "apiKey: process.env.KEY,",
  'api_key = os.environ["API_KEY"]', "PASSWORD=${PASSWORD}", 'secret = "<your-secret>"', "TOKEN_LIMIT = 100", "// set API_KEY in your .env file",
  "let password = ''", 'password = "changeme"', 'apiKey: "YOUR_API_KEY"', '"password": "********"', "const token = this.token;", "secret_key = config.get('secret_key')",
  "id: 123e4567-e89b-12d3-a456-426614174000", "commit 0f1e2d3c4b5a69788796a5b4c3d2e1f001122334", "integrity sha512-k8Zq2LmP9wXr4TvN1b7Yc3Hs5Qd0k8Zq2LmP9wXr4TvN1b7Yc3Hs5Qd0k8Zq2LmP9wXr4TvN1b7Yc3Hs5Qd0==",
  '"integrity": "sha512-AbCdEf0123456789AbCdEf0123456789AbCdEf0123456789AbCdEf0123456789AbCdEf0123456789AbCdEf0123456789"', "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "postgres://user:password@localhost:5432/dev", "postgres://user:${DB_PASSWORD}@db/app", "https://example.com/path?query=1", "https://github.com/owner/repo.git", "git@github.com:owner/repo.git",
  "Authorization: Bearer ${token}", "Authorization: Bearer <token>", "headers.set('Authorization', `Bearer ${accessToken}`)", "const tokenizer = new Tokenizer(text);", "if (token.length > 8) return;",
  "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC8example user@host", "AKIAIOSFODNN7EXAMPLE", "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "client_secret=<paste here>", "password = ''", "the password must be at least 12 characters",
];

for (const [name, text] of Object.entries(LEAKS)) {
  test(`catches: ${name}`, () => {
    const found = scanText("src/config.js", text);
    assert.ok(found.length >= 1, `not detected: ${JSON.stringify(text.slice(0, 60))}…`);
  });
}

test("false alarms: ordinary code, placeholders, hashes and docs are not flagged", () => {
  const flagged = FINE.map((t) => ({ t, f: scanText("src/app.js", t) })).filter((x) => x.f.length);
  assert.deepEqual(flagged.map((x) => `${x.t}  ->  ${x.f.map((y) => y.rule).join(",")}`), []);
});

test("no finding ever prints the whole secret", () => {
  for (const text of Object.values(LEAKS)) {
    for (const f of scanText("a.js", text)) {
      assert.ok(f.sample.length < 40, `sample too long: ${f.sample}`);
      assert.ok(!/^[A-Za-z0-9+/=_.-]{30,}$/.test(f.sample), `sample looks like the raw secret: ${f.sample}`);
    }
  }
});
