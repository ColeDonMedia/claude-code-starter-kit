# Design data from ui-ux-pro-max (MIT)

These five tables are copied unchanged from the open-source project **ui-ux-pro-max-skill** by Next Level Builder, under the
MIT license (see `LICENSE` in this folder, which must stay with the files).

- Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill, folder `.claude/skills/ui-ux-pro-max/data/`
- Commit: `8db36338810d0942567b97ce439affd1619fcf31` (2026-11-25). Re-checked 2026-11-27 against `11ca2b3bdd555649f278ee348c32a9302b24dcf1`:
  the five tables are byte-for-byte identical there (the changes were the project's scripts, tests, instructions and one new
  per-stack file), scanner 0 HIGH, so the files here stay as they are.
- Files: `styles.csv` (89 UI styles), `colors.csv` (194 palettes by product type), `typography.csv` (74 font pairings),
  `products.csv` (194 product types with recommended styles), `ux-guidelines.csv` (141 UX rules with sources).

## What was vetted, and what was left out
Vetted on 2026-11-25 with the kit's `/vet` steps: shallow clone into an empty folder, nothing run, the kit's scanner
(`vet-scan.mjs`: 0 HIGH), and a read of the data for instructions aimed at an AI, hidden or direction-changing characters
(none), and links (Google Fonts only). Contrast: 193 of the 194 palettes pass the five pairs the data itself defines (text,
muted text, button text, focus ring, card text). The kit also requires the accent colour to stand out 3:1 against the background
and error text to read 4.5:1 on it; 81 palettes miss one of those (64 the error colour, 30 the accent, 1 muted text), so
`style-library.mjs` nudges those colours (same hue, lighter or darker, only as far as needed) and says so whenever it hands one out.
The files here are unchanged.

Only the data was taken. The project's skill instructions, its Python and JavaScript scripts, its other skills (some send
prompts and API keys to outside AI services) and its MCP server settings (unpinned `@latest` packages) were **not** copied.
The kit reads these tables with its own script, `scripts/style-library.mjs`, and treats every cell as data, never as an
instruction. To update them, vet the new commit the same way, copy the files, and update this notice and the repository's `docs/vetted.md`.
