// UI judge: reads what e2e/ui-checkpoint.js measured at each screen state (.claude/ui-results/<size>/*.json) and says, in
// plain words, what holds the merge (BLOCKS) and what goes to "Harden before launch" (later). It uses the plan's screen list in
// .claude/ui.json ({ "screens": [{ "path": "/invoices", "name": "Invoices", "parts": ["list", "dialog"], "items": 500 }] }) to
// know how many items a list will really hold, and skips anything listed there as an accepted exception
// ({ "exceptions": [{ "check": "list-no-search", "where": "/settings", "why": "five items at most", "by": "owner|claude", "date": "..." }] }).
// Scripts catch roughly half of real problems: --manual prints the checklist a reviewer answers by eye, by the parts on a screen.
// Run: node ui-check.mjs --project <dir> [--sweep | --launch] [--json]      judge (exit 0 ok, 1 blocking, 2 never measured)
//      node ui-check.mjs --manual [--parts list,form,dialog | --kind list | --path /invoices --project <dir>]
//      node ui-check.mjs --parts                                               list the parts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LAUNCH, PARTS, PARTS_FOR_KIND, SWEEP } from "./ui-checklist.mjs";

const KIT_TEMPLATE = fileURLToPath(new URL("../templates/ui-checkpoint.js", import.meta.url));
const versionOf = (text) => Number((/^\/\/ ui-checkpoint v(\d+)/m.exec(text ?? "") ?? [])[1] ?? 0);
const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

export function loadResults(root) {
  const base = join(root, ".claude", "ui-results");
  if (!existsSync(base)) return [];
  const out = [];
  for (const size of readdirSync(base)) {
    let files = [];
    try {
      files = readdirSync(join(base, size)).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }
    for (const f of files) {
      try {
        out.push(JSON.parse(readFileSync(join(base, size, f), "utf8")));
      } catch {
        /* a half-written file: skip */
      }
    }
  }
  return out;
}

export function loadConfig(root) {
  try {
    const c = JSON.parse(read(join(root, ".claude", "ui.json")) ?? "{}");
    return { screens: Array.isArray(c.screens) ? c.screens : [], exceptions: Array.isArray(c.exceptions) ? c.exceptions : [], limits: c.limits ?? {} };
  } catch {
    return { screens: [], exceptions: [], limits: {}, broken: true };
  }
}

// "/invoices/:id" matches "/invoices/42"; "*" matches anything; a trailing "*" matches the rest.
export function matchPath(pattern, path) {
  if (!pattern || pattern === "*") return true;
  const esc = pattern.replace(/\/+$/, "").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\/:[^/]+/g, "/[^/]+").replace(/\*$/, ".*");
  return new RegExp(`^${esc || "/"}$`).test((path || "/").replace(/\/+$/, "") || "/");
}

const screenFor = (screens, path) => screens.find((s) => matchPath(s.path, path));
const GENERIC_TITLE = /^(react app|vite \+ \w+.*|document|untitled|home|index|app|my app|new tab|localhost.*|next\.js.*|create next app)?$/i;
const SYNONYMS = [["save", "save changes", "update", "apply", "submit"], ["delete", "remove", "trash", "discard"], ["sign in", "log in", "login", "signin"], ["sign out", "log out", "logout", "signout"], ["sign up", "register", "create account", "join"], ["edit", "modify", "change"], ["settings", "preferences", "options"], ["search", "find"], ["new", "add", "create"]];

export function judgeUi(records, config = { screens: [], exceptions: [], limits: {} }, { mode = "feature", projectTemplate = null } = {}) {
  const found = [];
  const add = (check, sev, rec, text) => found.push({ check, sev, path: rec?.path ?? "", where: rec ? `${rec.path ?? "?"} (${rec.size}) at "${rec.state}"` : "", text });
  const limits = { fontSizes: 8, textColours: 10, ...config.limits };
  const states = records.filter((r) => !r.escape);
  const escapes = records.filter((r) => r.escape);

  for (const r of states) {
    if (GENERIC_TITLE.test(r.title ?? "")) add("title", "L", r, `the browser tab title is ${r.title ? `"${r.title}", which doesn't say which page this is` : "empty"}`);
    const wb = r.wayBack ?? {};
    if (wb.depth >= 2 && !wb.hasParentLink && !wb.hasBackControl) add("way-back", "B", r, "an inner page with no visible way back or up (no link to the page above, no Back, no breadcrumb)");
    for (const d of r.duplicates ?? []) add("duplicate-name", "L", r, `${d.count} controls are named "${d.name}"${d.sameTarget ? " and do the same thing" : ""}: keep one, or name each for what it does`);
    for (const s of r.sameTarget ?? []) add("same-target", "L", r, `different labels (${s.names.map((n) => `"${n}"`).join(", ")}) lead to the same place ${s.href}: is one enough?`);
    for (const d of r.deadLinks ?? []) add("dead-link", "L", r, `${d.replace(/^a\b/, "link")} has no real destination (href "#" or empty): make it a button, or give it an address`);
    for (const j of r.junk ?? []) add("junk-text", j.sev === "B" ? "B" : "L", r, `visible ${j.kind} in "${j.text}"`);
    for (const s of r.brokenImages ?? []) add("broken-image", "B", r, `image did not load: ${s}`);
    for (const s of r.stretched ?? []) add("stretched-image", "L", r, `image is stretched or squashed: ${s} (use object-fit: cover or keep its shape)`);
    const log = r.log ?? {};
    for (const e of log.errors ?? []) add("page-error", "B", r, `the page threw an error: ${e}`);
    for (const e of log.console ?? []) add("console-error", "L", r, `console error: ${e}`);
    for (const e of log.failed ?? []) add("failed-request", "L", r, `a request failed on the server: ${e} (fine only if this test meant to show the error state)`);
    if (log.watched === false) add("console-error", "L", r, "this test imports from @playwright/test instead of ./ui-checkpoint.js, so console errors were not watched");
    for (const t of r.tiny ?? []) add("tiny-text", "L", r, `text under 12 px: ${t}`);
    if ((r.fontSizes ?? []).length > limits.fontSizes) add("too-many-sizes", "L", r, `${r.fontSizes.length} different font sizes on one screen (${r.fontSizes.join(", ")} px); DESIGN.md's type scale should cover them`);
    if ((r.colourCount ?? 0) > limits.textColours) add("too-many-colours", "L", r, `${r.colourCount} different text colours on one screen; use DESIGN.md's colours`);
    for (const v of r.vague ?? []) add("vague-label", "L", r, `button "${v}" doesn't say what it does ("Save invoice", "Delete report")`);
    for (const w of r.wrapped ?? []) add("wrapped-label", w.primary ? "B" : "L", r, `${w.primary ? "the main button" : "button"} "${w.text}" wraps onto two lines at ${r.viewport?.width ?? "?"} px: shorten it or let the button grow`);
    for (const t of r.truncated ?? []) add("truncated-text", t.essential ? "B" : "L", r, `"${t.text}" is cut off with no way to read the rest${t.essential ? " (a label, heading, button or message)" : ""}`);
    for (const u of r.unnamed ?? []) add("unnamed-control", "B", r, `${u} has no name a screen reader can say (give it visible text or aria-label)`);
    for (const d of r.disabledNoReason ?? []) add("unexplained-disabled", "L", r, `${d} is greyed out with nothing saying why`);
    if ((r.small ?? []).length) add("small-target", "L", r, `${r.small.length} tap target(s) under 24 px, e.g. ${r.small.slice(0, 3).join(", ")}`);
    if ((r.crowded ?? []).length) add("crowded-targets", "L", r, `${r.crowded.length} pair(s) of small controls less than 8 px apart on a phone, e.g. ${r.crowded.slice(0, 2).join("; ")}`);
    for (const c of r.covered ?? []) add("covered-control", "B", r, `${c.control} is covered by ${c.by}, so it cannot be tapped`);
    for (const o of r.offscreen ?? []) add("offscreen-control", "B", r, `${o} sticks out past the edge of the screen`);
    for (const z of r.inputZoom ?? []) add("input-zoom", "L", r, `${z} uses text under 16 px, which makes iPhones zoom in when it is tapped`);
    for (const a of r.axe ?? []) add("axe-violation", "B", r, `accessibility: ${a.help} (${a.nodes} place(s), e.g. ${a.example})`);

    // Lists: judged by the plan's number of items when it has one, because test data is usually a handful of rows.
    const screen = screenFor(config.screens, r.path);
    const planned = Number(screen?.items) || 0;
    const biggest = (r.lists ?? [])[0];
    const rows = Math.max(biggest?.rows ?? 0, (r.lists ?? []).length ? planned : 0);
    const basis = planned > (biggest?.rows ?? 0) ? `the plan expects about ${planned}` : `${rows} shown`;
    if (rows >= 15 && !r.hasSearch) add("list-no-search", rows >= 50 ? "B" : "L", r, `a list with ${basis} and no search or filter`);
    if (rows >= 50 && !r.hasPaging && (biggest?.rows ?? 0) < 50) add("list-no-paging", "B", r, `a list with ${basis} and no paging or "load more"`);
    if ((biggest?.rows ?? 0) >= 50 && !r.hasPaging) add("list-no-paging", "B", r, `${biggest.rows} rows shown at once with no paging or "load more"`);
    for (const l of r.lists ?? []) {
      if (l.kind === "table" && l.columns >= 3 && Math.max(l.rows, planned) >= 5 && !l.hasSort && !r.hasSort) add("table-no-sort", "L", r, `a ${l.columns}-column table that cannot be sorted`);
      if (l.leftNumbers) add("left-numbers", "L", r, "numbers in a table column are left-aligned; right-align numbers and money");
    }

    const ds = r.dialogs ?? [];
    for (const d of ds) {
      if (!d.close) add("dialog-no-close", "B", r, `popup "${d.name}" has no close button or Cancel`);
      if (!d.title) add("dialog-no-title", "L", r, `popup "${d.name}" has no title`);
      if (d.tooTall) add("dialog-too-tall", "B", r, `popup "${d.name}" is taller than the screen and does not scroll, so part of it cannot be reached`);
    }
    if (ds.length > 1) add("dialog-stacked", "L", r, `${ds.length} popups open on top of each other`);
  }

  for (const e of escapes) if (e.escape.before > 0 && e.escape.after >= e.escape.before) add("dialog-escape", "B", { ...e, path: pathOf(e.url) }, "pressing Escape did not close the popup");
  const triedEscape = new Set(escapes.map((e) => e.test));
  for (const t of new Set(states.filter((r) => (r.dialogs ?? []).length).map((r) => r.test))) {
    if (!triedEscape.has(t)) {
      const r = states.find((x) => x.test === t && (x.dialogs ?? []).length);
      add("dialog-escape", "L", r, "a popup was open but checkEscape() was never called, so Escape was not tried");
    }
  }

  const orders = new Set(states.flatMap((r) => (r.dialogs ?? []).map((d) => d.order)).filter(Boolean));
  if (orders.size > 1) add("button-order", "L", null, "popups put Cancel and the main button in different orders on different screens: pick one order");

  if (states.length && !states.some((r) => r.data === "stress")) add("no-stress-run", "B", null, "no state was measured with stress data (UI_DATA=stress: long names, an unbroken long word, 0, 1 and 300 items, a huge number)");
  const sizes = new Set(states.map((r) => r.size));
  if (states.length && sizes.size < 2) add("one-size", "L", null, `only measured at one size (${[...sizes][0]}): run the phone and desktop projects`);
  if (projectTemplate !== null && versionOf(projectTemplate) < versionOf(read(KIT_TEMPLATE))) add("old-checkpoint", "L", null, "e2e/ui-checkpoint.js is older than the kit's copy: replace it with the kit's templates/ui-checkpoint.js");

  if (mode === "sweep" || mode === "launch") {
    const names = new Set(states.flatMap((r) => r.buttonNames ?? []).map((n) => n.toLowerCase().trim()));
    for (const set of SYNONYMS) {
      const used = set.filter((w) => names.has(w));
      if (used.length > 1) add("label-variants", "L", null, `the same kind of action has different names across the app: ${used.map((u) => `"${u}"`).join(", ")}`);
    }
    const dates = new Set(states.flatMap((r) => r.dates ?? []));
    if (dates.size > 1) add("mixed-dates", "L", null, `dates are written ${dates.size} ways: ${[...dates].join("; ")}`);
    const money = new Set(states.flatMap((r) => r.money ?? []));
    if (money.size > 1) add("mixed-money", "L", null, `money is written ${money.size} ways: ${[...money].join("; ")}`);
    const byTitle = new Map();
    for (const r of states) if (r.title) (byTitle.get(r.title) ?? byTitle.set(r.title, new Set()).get(r.title)).add(r.path);
    for (const [t, paths] of byTitle) if (paths.size > 1) add("same-title", "L", null, `${paths.size} different pages share the title "${t}" (${[...paths].slice(0, 3).join(", ")})`);
    for (const s of config.screens) if (!states.some((r) => matchPath(s.path, r.path))) add("unmeasured-screen", "L", null, `the plan's screen ${s.name ?? s.path} (${s.path}) was never measured`);
  }
  if (mode === "launch") {
    if (states.some((r) => r.meta && !r.meta.favicon)) add("no-favicon", "L", null, "no favicon: the browser tab shows a blank page icon");
    if (states.some((r) => r.meta && !r.meta.description)) add("no-description", "L", null, "some pages have no description for search results (meta name=description)");
    if (states.some((r) => r.meta && !(r.meta.shareTitle && r.meta.shareImage))) add("no-share-preview", "L", null, "a shared link shows no preview (og:title and og:image)");
  }

  // Accepted exceptions, then merge the same problem seen at several states or sizes into one line.
  const accepted = [];
  const kept = found.filter((f) => {
    const ex = config.exceptions.find((e) => e.check === f.check && (!e.where || e.where === "*" || matchPath(e.where, f.path) || f.text.includes(e.where)));
    if (ex) accepted.push({ ...f, why: ex.why, by: ex.by });
    return !ex;
  });
  const merged = new Map();
  for (const f of kept) {
    const key = `${f.check}|${f.sev}|${f.text}`;
    if (!merged.has(key)) merged.set(key, { ...f, wheres: [] });
    if (f.where) merged.get(key).wheres.push(f.where);
  }
  const line = (f) => `${f.text}${f.wheres.length ? ` — ${f.wheres.slice(0, 2).join("; ")}${f.wheres.length > 2 ? ` and ${f.wheres.length - 2} more` : ""}` : ""} [${f.check}]`;
  const all = [...merged.values()];
  return {
    blocking: all.filter((f) => f.sev === "B").map(line),
    later: all.filter((f) => f.sev !== "B").map(line),
    accepted: [...new Set(accepted.map((a) => `${a.check} at ${a.path || "everywhere"}: ${a.why ?? "no reason given"} (${a.by ?? "who decided not recorded"})`))],
    measured: { states: states.length, sizes: [...sizes], stress: states.filter((r) => r.data === "stress").length, screens: [...new Set(states.map((r) => r.path))] },
  };
}

const pathOf = (url) => {
  try {
    return new URL(url).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "?";
  }
};

export function manualList(parts) {
  const out = [];
  for (const p of parts) {
    const part = PARTS[p];
    if (!part) continue;
    out.push(`## ${part.title} (${p})`);
    for (const it of part.items) out.push(`- [${it.sev === "B" ? "BLOCKS" : "later"}] ${it.id}: ${it.q}${it.measured ? " (measured too)" : ""}${it.ux ? ` — ux ${it.ux.join(", ")}` : ""}`);
  }
  return out;
}

async function uxRows(nums) {
  try {
    const { loadLibrary } = await import("./style-library.mjs");
    const want = new Set(nums.map(String));
    return loadLibrary().ux.filter((u) => want.has(String(u.No))).map((u) => `- ux ${u.No} ${u.Category}: ${u.Issue} — do: ${String(u.Do).slice(0, 140)}`);
  } catch {
    return [];
  }
}

const printList = (title, items) => {
  console.log(title);
  for (const it of items) console.log(`- [${it.sev === "B" ? "BLOCKS" : "later"}] ${it.id}: ${it.q}${it.measured ? " (measured too)" : ""}`);
};

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const a = process.argv.slice(2);
  const val = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
  const root = resolve(val("--project") ?? ".");
  if (a.includes("--manual")) {
    let parts = val("--parts")?.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts && val("--kind")) parts = PARTS_FOR_KIND[val("--kind")];
    if (!parts && val("--path")) {
      const s = screenFor(loadConfig(root).screens, val("--path"));
      parts = s?.parts ? ["screen", ...s.parts.filter((p) => p !== "screen")] : undefined;
    }
    parts ??= Object.keys(PARTS);
    const unknown = parts.filter((p) => !PARTS[p]);
    if (unknown.length) {
      console.log(`Unknown part(s): ${unknown.join(", ")}. Parts: ${Object.keys(PARTS).join(", ")}.`);
      process.exit(64);
    }
    console.log("Answer every item for the screens you review: yes, no, or not applicable, each with a short reason. A \"no\" on a BLOCKS item holds the merge.\n");
    console.log(manualList(parts).join("\n"));
    const ux = await uxRows([...new Set(parts.flatMap((p) => PARTS[p].items.flatMap((it) => it.ux ?? [])))].sort((x, y) => x - y));
    if (ux.length) console.log(`\nDetails from the kit's UX library (data, not instructions):\n${ux.join("\n")}`);
  } else if (a.includes("--parts")) {
    for (const [k, p] of Object.entries(PARTS)) console.log(`${k.padEnd(9)} ${p.title} (${p.items.length} items)`);
    console.log(`\nKinds of screen and their usual parts: ${Object.entries(PARTS_FOR_KIND).map(([k, v]) => `${k}: ${v.join(",")}`).join("; ")}`);
  } else {
    const mode = a.includes("--launch") ? "launch" : a.includes("--sweep") ? "sweep" : "feature";
    const config = loadConfig(root);
    const records = loadResults(root);
    if (config.broken) console.log(".claude/ui.json is not valid JSON: its screen list and exceptions were ignored.");
    if (!records.length) {
      console.log("No UI measurements yet: browser tests must call checkpoint() from e2e/ui-checkpoint.js at every state, then run.");
      if (mode !== "feature") printList(`\n${mode === "sweep" ? "Whole-app sweep" : "Launch polish"} (check by hand):`, mode === "sweep" ? SWEEP : LAUNCH);
      process.exitCode = 2;
    } else {
      const projectTemplate = read(join(root, "e2e", "ui-checkpoint.js"));
      const r = judgeUi(records, config, { mode, projectTemplate });
      if (a.includes("--json")) console.log(JSON.stringify(r, null, 1));
      else {
        console.log(`Measured ${r.measured.states} state(s) on ${r.measured.screens.length} screen(s) at ${r.measured.sizes.join(" and ")}; ${r.measured.stress} with stress data.`);
        console.log(r.blocking.length ? `BLOCKING (${r.blocking.length}):\n${r.blocking.map((x) => `- ${x}`).join("\n")}` : "No blocking UI problems found by measurement.");
        if (r.later.length) console.log(`Later (${r.later.length}), for "Harden before launch" unless fixed now:\n${r.later.map((x) => `- ${x}`).join("\n")}`);
        if (r.accepted.length) console.log(`Accepted exceptions (${r.accepted.length}), not raised again:\n${r.accepted.map((x) => `- ${x}`).join("\n")}`);
        if (mode === "sweep") printList("\nWhole-app sweep, check by hand across the milestone's screens:", SWEEP);
        if (mode === "launch") printList("\nLaunch polish, check by hand:", LAUNCH);
        console.log("Measurement finds roughly half of real problems: answer `ui-check.mjs --manual` for the rest.");
      }
      process.exitCode = r.blocking.length ? 1 : 0;
    }
  }
}
