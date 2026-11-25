---
description: Use when the user asks if the project is secure, wants a security audit or hardening review, or when first working in an existing codebase with real users or data. Audits the WHOLE project, not just recent changes.
---

Audit the whole project's security and report in plain words: $ARGUMENTS

You are looking at the entire codebase, not a diff. Read-only: change nothing until the user approves fixes.

## 1. Run the tools first (cheap and objective)
- Secret scan of everything tracked, including old history: `node "${CLAUDE_PLUGIN_ROOT}/scripts/secret-scan.mjs" --files $(git ls-files)`
  and, for history, `git log -p --all` through the same scanner if the project has been public or shared.
- The ecosystem's dependency audit (`npm audit`, `pip-audit`, `cargo audit`, `bundler-audit`, `govulncheck`) and any
  static analyser that is already installed (`semgrep`, `bandit`, `gosec`). Don't install anything.
- Dependencies: list direct dependencies and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/pkg-check.mjs" <npm|pypi|cargo> <name>`
  on any you don't recognise. Flag names that don't exist, brand-new ones, and any that run install scripts.

## 2. Have the security reviewer read it
Launch the starter-kit `security-reviewer` agent in **whole-project mode**: tell it to audit the entire repository
and give it the tool results from step 1. If the project is large, launch several, each assigned a part (for
example: server and API; database and permissions; front end; build and deploy configuration), and merge the results.

## 3. Report
- **Verdict** in one line: safe to launch / fix first / stop and fix now.
- **Fix now** (real holes), **fix soon**, **nice to have**, each item: what's wrong in plain words, where
  (`file:line`), how an attacker could use it, and the fix.
- **What's already good**, briefly, so the user knows what not to break.
- Anything you could not check, and any leaked key that must be rotated (generate a new one and disable the old).
Offer to fix the "fix now" items with `/starter-kit:feature`, one at a time, and ask for the go-ahead before starting.
