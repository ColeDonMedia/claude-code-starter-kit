---
description: Use when the user asks if the project is secure, wants a security audit or hardening review, or when first working in an existing codebase with real users or data. Audits the WHOLE project, not just recent changes.
---

Audit the whole project's security and report in plain words: $ARGUMENTS

You are looking at the entire codebase, not a diff. Read-only: change nothing until the user approves fixes.

## 1. Run the tools first (cheap and objective)
- Secret scan of everything tracked, including old history: `node "${CLAUDE_PLUGIN_ROOT}/scripts/secret-scan.mjs" --files $(git ls-files)`
  and, for history, `git log -p --all` through the same scanner if the project has been public or shared.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/sec-tools.mjs" --project .`: run every RUN line. The first is the kit's own checks (every
  language's dependencies against OSV.dev, CI workflows, Dockerfiles, Compose files), which need nothing installed; the rest are
  extra scanners that happen to be on this computer. Add `npm audit` for a Node project. Never install a tool or suggest one.
- Dependencies: list direct dependencies and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/pkg-check.mjs" <npm|pypi|cargo> <name>`
  on any you don't recognise. Flag names that don't exist, brand-new ones, and any that run install scripts.

## 2. Have the security reviewer read it
Launch the starter-kit `security-reviewer` agent in **whole-project mode**: tell it to audit the entire repository
and give it the tool results from step 1. If the project is large, launch several, each assigned a part (for
example: server and API; database and permissions; front end; build and deploy configuration), and merge the results.
Pass the `model` and `effort` that `node "${CLAUDE_PLUGIN_ROOT}/scripts/model-route.mjs" --project . --role security-reviewer --mode full`
prints; if it says capped, say so at the top of the report. If `--role scout` prints SCOUT USE, first have the `scout` agent list
the entry points (routes, forms, uploads, webhooks, jobs) and hand them over with "this list may be incomplete: find what it missed".

## 3. Report
- **Verdict** in one line: safe to launch / fix first / stop and fix now.
- **Fix now** (real holes), **fix soon**, **nice to have**, each item: what's wrong in plain words, where
  (`file:line`), how an attacker could use it, and the fix.
- **What's already good**, briefly, so the user knows what not to break.
- Anything you could not check, and any leaked key that must be rotated (generate a new one and disable the old).
Offer to fix the "fix now" items with `/starter-kit:feature`, one at a time, and ask for the go-ahead before starting.
