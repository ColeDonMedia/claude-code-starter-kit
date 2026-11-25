# Settings

[← Back to the README](../README.md) · [All documentation](README.md)

Per project, in `.claude/kit.json`. Claude never changes a setting on its own; if you ask it to, it sets the switch and, for a
protection, you approve it in a permission prompt.

## Comfort settings (take effect right away)

| Setting | Effect |
|---|---|
| `{ "lean": false }` | Turns off the token-saving reply rules. |
| `{ "plainLanguage": false }` | Turns off the plain-words rule for non-programmers. |
| `{ "autoUpdate": false }` | Stops the daily self-update (or set the environment variable `KIT_AUTOUPDATE=0`). |
| `{ "verifyGate": false }` | Lets a turn end without running the project's checks. |
| `{ "docsGate": false }` | Stops holding a turn when the records fall behind the code. |
| `{ "flightLog": false }` | Turns off the flight recorder. |
| `{ "relatedTests": false }` | Stops running related tests after each edit (see [How it works](how-it-works.md)). |
| `{ "scout": false }` | Never launches the Haiku scout, even in a big project. |
| `{ "quietOutput": false }` | Lets long test, install and build output reach Claude in full. |
| `{ "freshContext": false }` | Runs each feature's build in your chat instead of a fresh conductor context (the old way). |
| `{ "planGate": false }` | Lets a brand-new project get app code before you have approved a plan. Only set it if you really want to skip the plan. |
| `{ "rigor": "critical" }` | Puts every builder and reviewer on the strongest model the kit uses (Opus). |

## Protections (need your approval on this computer before they count)

| Setting | Effect |
|---|---|
| `{ "guard": false }` | Turns off the safety guard. |
| `{ "guardAllow": ["reset-hard"] }` | Allows specific safety-guard rules (ids at the top of `hooks/safety-guard.mjs`). |
| `{ "secretGuard": false }` | Turns off the secret guard. |
| `{ "packageGuard": false }` | Turns off the package guard. |
| `{ "dbGuard": false }` | Turns off the database guard. |
| `{ "autoGate": false }` | Turns off the push gate. |
| `{ "auto": false }` | Turns off everything automatic. |
| `{ "rigor": "prototype" }` | Lets small builds be reviewed on the builder's own model, and the red team run on Sonnet (cheaper). The security review stays on Opus. |

Commands a project supplies also run only after your approval: the `verify` list (its check commands) and a custom
`relatedTests` command.

This computer's own model ceiling (a plan without Opus) is kept outside every project, in the kit's data folder; a project file
cannot set it.

## Other per-project files

| File | Holds |
|---|---|
| `.claude/speed.json` | The speed budget: pages, actions and limits. |
| `.claude/scale.json` | The scale profile: kind of app, people, busiest moment, downtime cost. |
| `.claude/a11y.json` | Optional: which pages the accessibility test visits. |
| `.claude/*-results*.json` | Measurements from the speed, load, desktop and accessibility checks (git-ignored). |
