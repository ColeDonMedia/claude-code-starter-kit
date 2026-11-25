# Add-ons and vetting

[← Back to the README](../README.md) · [All documentation](README.md)

## Recommended add-ons (not bundled)

Third-party skills run with your permissions and load their instructions into every session, so this kit does not bundle them.
Install only what you need. Official Anthropic plugins first, since Anthropic maintains them:

| Need | Add-on | Source |
|---|---|---|
| UI polish, distinctive design | `frontend-design` | official marketplace: `claude plugin install frontend-design@claude-plugins-official` |
| Edit-time security warnings | `security-guidance` | official marketplace |
| Larger feature workflow with an architecture step | `feature-dev` | official marketplace |
| Reviewing pull requests | `code-review`, `pr-review-toolkit` | official marketplace |
| Real-browser testing and screenshots | `playwright` (MCP) | official marketplace |
| Current library docs, so code uses real APIs | `context7` (MCP, runs an npm package via `npx`) | official marketplace |
| Fewer file reads in typed languages (TypeScript, Python, Go, Rust, Java, C#) | the code-intelligence (language server) plugin for your language | official marketplace; Anthropic's cost advice recommends them |
| Spec-driven development (heavier than `/spec`) | GitHub Spec Kit | github/spec-kit |

Eighteen third-party repositories were cloned, scanned and read; results, pinned commits and cautions are in the
[vetting record](vetted.md). In short: `ccusage` and selected Trail of Bits and Anthropic skills are the cleanest; `rtk`,
`tdd-guard` and `ccstatusline` are useful with cautions.

## Vet before you install (`/starter-kit:vet`)

Hundreds of malicious or risky skills have been found on public registries. Share a link and Claude vets it for you:

1. Downloads the repository into an empty folder, without running anything.
2. Runs `scripts/vet-scan.mjs`: download-and-run commands, encoded payloads, throwaway upload endpoints, credential access plus
   network use, install-time scripts, binaries, hidden Unicode, hidden HTML comments and common prompt-injection phrases.
3. Reads every file, and reports a verdict.

Limits: the scan only knows patterns, injected instructions can be worded innocently, and a repository can change after it is
vetted, so pin the commit you reviewed. The safest route of all is to have Claude write its own version of an idea.

## Deliberately not included

- **Jailbreak or "safety bypass" skills.** They don't make code better, and they defeat the guardrails this kit relies on.
- **"Godmode"-style mode switches and mega-bundles.** A per-turn "max capability" hook adds tokens to every message and rewrites
  settings on install; one discipline pipeline was fully vetted (nothing malicious) but injects about 4,000 tokens per session and
  fights this kit's routing. Its one new idea, checking library APIs against current docs, is in the builder.
- **Large bundles** ("150 agents, 70 plugins"). Every skill's description costs tokens each session, and most are never used.
