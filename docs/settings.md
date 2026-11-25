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

Commands a project supplies also run only after your approval: the `verify` list (its check commands) and a custom
`relatedTests` command.

## Other per-project files

| File | Holds |
|---|---|
| `.claude/speed.json` | The speed budget: pages, actions and limits. |
| `.claude/scale.json` | The scale profile: kind of app, people, busiest moment, downtime cost. |
| `.claude/a11y.json` | Optional: which pages the accessibility test visits. |
| `.claude/*-results*.json` | Measurements from the speed, load, desktop and accessibility checks (git-ignored). |
