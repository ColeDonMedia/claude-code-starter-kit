---
description: Full pre-ship sweep — entire test suite, typecheck, lint, build, then the security review.
---

Run the full pre-ship sweep using the commands listed under "Commands" in CLAUDE.md:
1. Full test suite (run once, not watch mode).
2. Typecheck / static analysis.
3. Lint.
4. Production build / package / compile.
5. Only once steps 1–4 are green: the starter-kit `security-reviewer` agent on everything changed since
   the last ship (the diff against the main branch).

Rules:
- Use only commands from CLAUDE.md or the project's own manifest and scripts. Never invent one.
- If the project genuinely has no command for a step (for example no typecheck in a shell-script
  project), report that step as "not applicable" with the reason. Do not silently skip it.
- Report each step's real output.
- Ship only when every applicable step is green AND security-reviewer returns APPROVE.
  If anything fails, fix it and re-run the full sweep.
