// Are the legal basics in place before a public launch?
//   node legal-check.mjs --project <folder>      prints problems; exit 1 if there are any
//
// Checks the things that can be checked mechanically, so nothing ships with a blank privacy policy:
//   - PROJECT.md has a filled-in "Data inventory" (what personal data, why, where it lives, who sees it, how it is deleted)
//   - legal/PRIVACY_POLICY.md and legal/TERMS.md exist
//   - no unfilled placeholder remains in them ([Company legal name], [Contact email], TODO ...)
//   - each says whether a lawyer reviewed it ("Reviewed by:") or still carries the DRAFT banner (so nobody mistakes an AI draft for advice)
// It cannot tell whether the policy is LEGALLY adequate. That is what the lawyer review is for.
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { section } from "./status.mjs";

export function checkLegal(root) {
  const problems = [];
  const notes = [];
  const project = existsSync(join(root, "PROJECT.md")) ? readFileSync(join(root, "PROJECT.md"), "utf8") : "";
  const inventory = section(project, "Data inventory");
  if (!inventory.length) problems.push('PROJECT.md has no filled-in "Data inventory" (what personal data is collected, why, where it is stored, who can see it, how long it is kept, how it is deleted). The privacy policy must be built from it. If the app collects no personal data at all, write "No personal data is collected" there.');
  for (const [file, label] of [["legal/PRIVACY_POLICY.md", "privacy policy"], ["legal/TERMS.md", "terms of service"]]) {
    const p = join(root, file);
    if (!existsSync(p)) {
      problems.push(`${file} (the ${label}) does not exist`);
      continue;
    }
    const text = readFileSync(p, "utf8");
    const holes = [...text.matchAll(/\[([A-Z][A-Za-z ]{3,40})\]|\bTODO\b|\bTBD\b/g)].map((m) => m[0]);
    if (holes.length) problems.push(`${file} still has unfilled placeholders: ${[...new Set(holes)].slice(0, 5).join(", ")}`);
    const reviewed = /^Reviewed by:\s*\S+/im.test(text);
    const draft = /DRAFT/.test(text.slice(0, 600));
    if (!reviewed && !draft) problems.push(`${file} must start with the DRAFT banner or say "Reviewed by: <who, date>"`);
    if (!reviewed) notes.push(`${file} is an AI-written draft that no lawyer has reviewed`);
  }
  return { problems, notes };
}

if (process.argv[1] && basename(process.argv[1]) === "legal-check.mjs") {
  const i = process.argv.indexOf("--project");
  const r = checkLegal(resolve(i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "."));
  if (!r.problems.length) console.log("Legal basics are in place." + (r.notes.length ? `\nNote: ${r.notes.join("; ")}. Have a lawyer review before you rely on them.` : ""));
  else console.log(`Not ready for a public launch:\n- ${r.problems.join("\n- ")}`);
  process.exitCode = r.problems.length ? 1 : 0;
}
