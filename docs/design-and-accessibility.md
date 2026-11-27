# Design and accessibility

[← Back to the README](../README.md) · [All documentation](README.md)

## The style library

"High end" starts from a real library instead of the generic look.

- The kit ships a vetted design dataset: **89 UI styles, 194 colour palettes by product type, 74 font pairings, 194 product types**
  with the styles that suit them, and **141 UX rules** with their sources.
- It comes from the MIT-licensed [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) project, after vetting.
  Only the data was taken, never its instructions, scripts or other skills ([vetting record](vetted.md)). The kit reads it with its
  own `scripts/style-library.mjs`.
- Every palette is contrast-checked before it is offered. Colours that fail are nudged (same hue, only as far as needed), and you
  are told which.

## Picking a look (`/starter-kit:design`)

1. Claude asks which two or three apps you like the look of, and one you dislike, and looks at them.
2. It finds three directions (a style, a palette and a font pairing that fit together) for your product.
3. It shows them side by side on one page, so you pick by looking, not by reading.
4. It writes your choice as `DESIGN.md` (feel, colours, type, spacing, components, speed feel, accessibility, references, quality
   bar) and as CSS variables with a visible focus ring and "reduce motion" rules.
5. Every later screen follows it; the UI reviewer scores each screen against it, and acceptance asks what feels off.

## Usability: the UI checklist

Looks are only half of a good screen. Every screen is also checked against the kit's UI checklist. Does an inner page have a way
back? Does a popup have an X and close on Escape? Does a list the plan says will hold 500 items have search, filters, sort and
paging? Do two buttons do the same job? Does any button label wrap onto two lines? Is anything typed lost after a failed save? It
is measured in a real browser at every state and answered by eye by the UI reviewer, using the 141 UX rules above for the details.
How it works: [Quality, the UI checklist](quality.md#the-ui-checklist).

## Accessibility (WCAG 2.2 AA)

| Piece | What it does |
|---|---|
| `templates/a11y.spec.js` | A browser test (copied in by setup) that runs the axe-core engine on every page at phone and desktop size, plus the kit's own checks: a keyboard walk (focus always visible, never hidden behind sticky headers, never stuck), reflow at 320 px, about 200% zoom, tap-target size, and "reduce motion". |
| `scripts/a11y-check.mjs` | Sorts the results into what blocks shipping and what is advice; `--manual` lists what a person must check. |
| `scripts/wcag.mjs` | All 55 WCAG 2.2 A and AA criteria in plain words, with how each is checked (the engine, the kit's checks, or a person). |
| Builder and reviewer | Follow the same rules; the pre-ship scan blocks on any blocking accessibility finding. |
| Acceptance | Claude does the checks a person must do (keyboard only, zoom, narrow screens, error messages, sign-in) and asks you to try the new screens with the keyboard. |

Limits: automated tools find roughly half of real accessibility problems, so screen-reader testing still needs a person, and a
public service should get a professional review before launch; a style is a starting point, and your taste decides the result.
