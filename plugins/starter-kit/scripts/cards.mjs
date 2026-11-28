// Pattern cards: short checklists, with the tests that prove them, for the parts of an app that most often go wrong (keeping
// customers' data apart, payments and webhooks, sign-in, roles, background jobs, email). They live in ../cards/ and are handed to
// the builder and reviewers only for features that touch that area, so they cost nothing elsewhere.
// Run: node cards.mjs --match "<feature title, goal and criteria>"     (prints the matching cards' paths, or NO CARDS)
//      node cards.mjs --list
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DIR = fileURLToPath(new URL("../cards/", import.meta.url));
// Words that mean a feature touches each area. Kept specific: a wrong match only costs a short read, a missed one costs a bug.
export const TRIGGERS = {
  "tenant-isolation": /\b(multi-?tenan\w*|tenants?|organi[sz]ations?|workspaces?|team accounts?|company accounts?|customer accounts?|client accounts?|saas)\b/i,
  "billing-webhooks": /\b(pay(ment|ments|s|ing)?|billing|subscriptions?|checkout|stripe|paddle|lemon ?squeezy|refunds?|webhooks?|plans? (upgrade|downgrade)|charge[sd]?)\b/i,
  "sign-in-sessions": /\b(sign[- ]?(in|up|out)|log[- ]?(in|out)|login|passwords?|sessions?|auth\w*|oauth|magic links?|2fa|mfa|two-factor|accounts? creation)\b/i,
  "roles-permissions": /\b(roles?|permissions?|admins?|access control|rbac|invit(e|es|ation|ations)|members?|owners? only|who can)\b/i,
  "background-jobs": /\b(background|queues?|jobs?|scheduled|cron|workers?|retr(y|ies)|nightly|hourly|exports?|imports?|reports? generation)\b/i,
  email: /\b(e-?mails?|newsletters?|smtp|mailers?|unsubscribe|password resets?|invitation emails?|receipts?)\b/i,
};

export function listCards() {
  return existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")).sort() : [];
}

export function matchCards(text) {
  return listCards().filter((c) => TRIGGERS[c]?.test(String(text)));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  if (a.includes("--list")) for (const c of listCards()) console.log(`${c}: ${join(DIR, `${c}.md`)}`);
  else if (a.includes("--match")) {
    const m = matchCards(a[a.indexOf("--match") + 1] ?? "");
    if (!m.length) console.log("NO CARDS for this feature.");
    for (const c of m) console.log(`CARD ${c}: ${join(DIR, `${c}.md`)}`);
  } else {
    console.log('Use --match "<feature text>" or --list.');
    process.exitCode = 1;
  }
}
