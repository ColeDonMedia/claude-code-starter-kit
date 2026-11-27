// The kit's UI checklist: what a careful agency checks on every screen, by the PARTS on it (a list page usually has buttons, a
// list and a popup), plus a whole-app sweep for milestone acceptance and a polish list for launch.
// Each item: id, the question, B (a "no" holds the merge: data loss, a dead end, something a person cannot close or undo) or
// L (goes to "Harden before launch"), and `measured` when e2e/ui-checkpoint.js measures it (ui-check.mjs judges those; the
// reviewer still answers the item from what it saw). `ux` lists related rows of the kit's UX library (library/ui-ux-pro-max/
// ux-guidelines.csv, by No) for the details. Used by ui-check.mjs --manual, --sweep and --launch.

const i = (id, q, sev, extra = {}) => ({ id, q, sev, ...extra });

export const PARTS = {
  screen: {
    title: "Every screen",
    items: [
      i("screen.where", "Is it clear where I am: a specific page heading, the current menu item highlighted, a browser tab title naming the page?", "L", { measured: ["title"], ux: [3] }),
      i("screen.back", "On an inner page (a detail, a sub-page, a step), is there a visible way back or up, not only the browser's Back?", "B", { measured: ["way-back"], ux: [4, 6] }),
      i("screen.place", "Does going back keep my place: scroll position, the filter, the page of results, the open tab?", "L", { ux: [4] }),
      i("screen.link", "Does refreshing, or opening the address in a new tab, bring back the same view (the filter, the open item, the tab)?", "L", { ux: [5] }),
      i("screen.primary", "Is there exactly one main action, and does it look like the main one (the others visibly quieter)?", "L"),
      i("screen.dupes", "Do no two controls on the screen do the same job (two Save buttons, a link and a button to the same place)? Repeated row actions are fine.", "L", { measured: ["duplicate-name", "same-target"] }),
      i("screen.dead", "Does every control do something visible, and does no path end where the only way out is the browser?", "B", { measured: ["dead-link"] }),
      i("screen.hover", "Is nothing only reachable by hovering (menus, row actions, tooltips holding information), which a phone cannot do?", "B", { ux: [11, 29] }),
      i("screen.junk", "Is there no placeholder or broken text: undefined, null, NaN, Invalid Date, [object Object], Lorem ipsum, {{name}}, \"1 items\"?", "B", { measured: ["junk-text"] }),
      i("screen.images", "Do all images load, keep their shape (not stretched or squashed) and have a sensible fallback when missing?", "B", { measured: ["broken-image", "stretched-image"] }),
      i("screen.errors", "Does the browser console stay free of errors on this screen?", "B", { measured: ["page-error", "console-error"] }),
      i("screen.text", "Is body text at least 16 px on phones and nothing important under 12 px; lines not too long to read on desktop?", "L", { measured: ["tiny-text"], ux: [67, 73] }),
      i("screen.consistent", "Does it use only the DESIGN.md sizes, colours and spacing (no one-off font size or grey)?", "L", { measured: ["too-many-sizes", "too-many-colours"] }),
    ],
  },
  buttons: {
    title: "Buttons and links",
    items: [
      i("buttons.label", "Does each label say what happens (\"Delete invoice\", \"Send 3 reminders\"), never \"OK\", \"Submit\", \"Yes\", \"Click here\"?", "L", { measured: ["vague-label"] }),
      i("buttons.wrap", "Does every label fit on one line at phone width? A main action that wraps or is cut off holds the merge.", "B", { measured: ["wrapped-label", "truncated-text"], ux: [113, 116] }),
      i("buttons.icon", "Does every icon-only button have a name a screen reader says (aria-label) and a tooltip or a visible label on desktop?", "B", { measured: ["unnamed-control"], ux: [40] }),
      i("buttons.order", "Are Cancel and the main action in the same order and place everywhere (for example Cancel left, Save right)?", "L", { measured: ["button-order"] }),
      i("buttons.danger", "Does a delete or other destructive button look different (the danger colour) and sit apart from Save, so it is not hit by mistake?", "L", { ux: [35] }),
      i("buttons.disabled", "Does a greyed-out button say why it is off (a hint next to it), or is it better left on with an error that explains?", "L", { measured: ["unexplained-disabled"], ux: [31, 134] }),
      i("buttons.busy", "Does a button show it is working at once (spinner or \"Saving...\") and ignore a second click, so nothing is done twice?", "B", { ux: [32] }),
      i("buttons.size", "Are tap targets at least 24 px (44 px on phones) and not crammed together?", "L", { measured: ["small-target", "crowded-targets"], ux: [22, 23, 104] }),
      i("buttons.reachable", "Is no control covered by another element or pushed off the screen at either size?", "B", { measured: ["covered-control", "offscreen-control"] }),
    ],
  },
  list: {
    title: "Lists and tables",
    items: [
      i("list.find", "With the plan's expected number of items (.claude/ui.json), can a person find one: search when there could be more than ~15, filters when items have a status or category, paging or \"load more\" past ~50?", "B", { measured: ["list-no-search", "list-no-paging"], ux: [89, 90] }),
      i("list.sort", "Can a table with several columns be sorted, and does the current sort show (an arrow on the column)?", "L", { measured: ["table-no-sort"] }),
      i("list.order", "Is the default order the one people want most (usually newest first, or what needs attention first)?", "L"),
      i("list.filters", "Are the active filters visible as chips with a one-tap \"clear all\", and do they survive a refresh and Back?", "L", { ux: [115] }),
      i("list.empty", "Is \"nothing here yet\" (with a button to add the first one) different from \"no results for this filter\" (with a way to clear it)?", "B", { ux: [79, 90] }),
      i("list.count", "Does it say how many there are (\"42 invoices\", \"showing 1-20 of 42\"), with correct singular and plural?", "L", { measured: ["junk-text"] }),
      i("list.numbers", "Are numbers and money right-aligned in tables, in one format, with the currency shown?", "L", { measured: ["left-numbers"], ux: [86] }),
      i("list.phone", "Does a table still work on a phone: cards, or a deliberate sideways scroll with the first column kept, never cut off?", "B", { ux: [71] }),
      i("list.bulk", "If people will act on many items at once, is there select-all and a bulk action, with a count of what is selected?", "L", { ux: [91] }),
      i("list.row", "Is the whole row (or its main text) the link to the item, not only a small icon?", "L"),
    ],
  },
  detail: {
    title: "Detail pages",
    items: [
      i("detail.back", "Is there a way back to the list that keeps its filter, page and scroll position?", "B", { measured: ["way-back"] }),
      i("detail.actions", "Are edit, delete and the other actions for this item reachable here (and on a phone, not hidden behind hover)?", "L"),
      i("detail.missing", "Do empty values show a dash or \"Not set\", never a blank gap, \"undefined\" or \"null\"?", "B", { measured: ["junk-text"] }),
      i("detail.notfound", "Does a removed or mistyped item show a proper \"not found\" page with a way back, not a crash or an empty page?", "B"),
      i("detail.title", "Does the heading and browser tab title name this item (\"Invoice 1042\", not \"Details\")?", "L", { measured: ["title"] }),
    ],
  },
  form: {
    title: "Forms",
    items: [
      i("form.labels", "Does every field have a visible label (not only a placeholder), with required or optional marked the same way everywhere?", "B", { ux: [43, 54, 59] }),
      i("form.keyboard", "Do fields bring up the right phone keyboard (email, number, phone) and allow autofill and paste?", "L", { measured: ["input-zoom"], ux: [57, 58, 63, 137] }),
      i("form.errors", "Do errors appear next to the field, say how to fix it, stay until fixed, and clear as soon as it is fixed?", "B", { ux: [44, 55, 109, 131, 132, 139] }),
      i("form.keep", "After a failed save (a validation error or the server failing), is everything typed still there?", "B", { ux: [133] }),
      i("form.leave", "Does leaving with unsaved changes (a link, Back, closing the tab, closing the popup) ask first?", "B", { ux: [135] }),
      i("form.double", "Does a double click or double Enter on save create one thing, not two?", "B", { ux: [32] }),
      i("form.done", "After saving, is there a clear confirmation, and do I land somewhere sensible (the new item, or the list with it in view)?", "B", { ux: [61, 83] }),
      i("form.cancel", "Is there a Cancel that returns me to where I came from without saving?", "L"),
      i("form.enter", "Does Enter submit a one-line form, and not submit by accident while typing in a multi-line box or with an input method?", "L", { ux: [120] }),
      i("form.length", "Is it no longer than it needs to be: nothing asked that the app already knows, long forms split into steps with progress shown?", "L", { ux: [81, 106] }),
      i("form.formats", "Are typed formats forgiving (spaces in card or phone numbers, any date format the field accepts shown in the hint)?", "L", { ux: [136] }),
      i("form.upload", "File uploads: allowed types and size limit shown before choosing, progress while uploading, a way to remove or replace, a clear error for a wrong file?", "B"),
    ],
  },
  dialog: {
    title: "Popups, drawers and menus",
    items: [
      i("dialog.close", "Does it have a visible close button (X) and a Cancel, and does Escape close it?", "B", { measured: ["dialog-no-close", "dialog-escape"], ux: [141] }),
      i("dialog.outside", "Does a click outside close it only when nothing typed would be lost (and ask first when it would)?", "B", { ux: [135] }),
      i("dialog.title", "Does it have a title saying what it is for?", "L", { measured: ["dialog-no-title"] }),
      i("dialog.fit", "Does it fit a phone screen, with its own content scrolling and its buttons always reachable (not under the keyboard)?", "B", { measured: ["dialog-too-tall"] }),
      i("dialog.stack", "Is there never a popup on top of another popup?", "L", { measured: ["dialog-stacked"] }),
      i("dialog.buttons", "Do its buttons say what they do (\"Delete report\" and \"Keep report\", not \"OK\" and \"Cancel\"), and does a delete confirmation name what will be deleted?", "L", { measured: ["vague-label"], ux: [35] }),
      i("dialog.focus", "Does focus move into it on open, stay inside while open, and go back to the button that opened it on close?", "B", { ux: [141] }),
      i("dialog.page", "Is the page behind it still and not scrolling, and is the popup the only thing that responds?", "L"),
      i("dialog.menu", "Menus: does one close when another opens, on Escape and on a click elsewhere, and is the open item obvious?", "L"),
    ],
  },
  messages: {
    title: "Messages (toasts, banners, alerts)",
    items: [
      i("messages.errors", "Do error messages stay until dealt with (never vanish on a timer), say what happened in plain words, and say what to do next?", "B", { ux: [138, 139, 80] }),
      i("messages.success", "Do success messages fade on their own, never cover a button or the next field, and get announced to screen readers?", "L", { ux: [82, 83] }),
      i("messages.undo", "Do messages after a reversible action offer Undo?", "L", { ux: [140] }),
    ],
  },
  states: {
    title: "States",
    items: [
      i("states.all", "Does each screen have a real version of: empty, loading, error, success, not found, not signed in, not allowed, session expired?", "B", { ux: [10, 79, 80] }),
      i("states.first", "Does a first-time user with no data see what the screen is for and the one thing to do first?", "L", { ux: [79, 88] }),
      i("states.slow", "On a slow connection is there a skeleton or the previous data at once, nothing jumping as it loads, and nothing double-sent if they tap again?", "B", { ux: [78, 19] }),
      i("states.offline", "When the connection drops, does it say so and keep what was typed, rather than failing silently?", "L"),
      i("states.stress", "Was it checked with stress data: the longest realistic name, one very long unbroken word, zero, one and a few hundred items, a huge number, a missing picture?", "B", { measured: ["no-stress-run"], ux: [111, 113] }),
    ],
  },
  safety: {
    title: "Safety",
    items: [
      i("safety.response", "Does every action give a visible response within a moment (pressed state, spinner, message)?", "B", { ux: [30, 61] }),
      i("safety.delete", "Does deleting either ask first, naming the thing, or offer Undo for a few seconds?", "B", { ux: [35, 140] }),
      i("safety.final", "Does anything that cannot be undone (payments, sending, permanent deletion) say so before the final click and show a summary to check?", "B"),
      i("safety.others", "When an action affects other people (emailing clients, sharing), does it say who before doing it?", "B"),
    ],
  },
  phone: {
    title: "Phone",
    items: [
      i("phone.thumb", "Is the main action reachable with a thumb (bottom area or a sticky bar) on long screens?", "L"),
      i("phone.keyboard", "Does the on-screen keyboard never cover the field being typed in or the save button?", "B"),
      i("phone.zoom", "Do text boxes use 16 px text or more (smaller makes iPhones zoom in) and does pinch-zoom still work?", "L", { measured: ["input-zoom"], ux: [67, 68] }),
      i("phone.menu", "Does the menu work on a phone and close after choosing, with every page reachable from it?", "B"),
      i("phone.gestures", "Does nothing depend on a gesture alone (swipe to delete has a button too) or fight the browser's own swipe-back?", "L", { ux: [24, 103] }),
    ],
  },
  account: {
    title: "Account screens",
    items: [
      i("account.flows", "Are sign up, sign in, sign out and forgot password all there and linked to each other?", "B"),
      i("account.who", "Does every signed-in screen show which account is signed in, with sign out one or two taps away?", "L"),
      i("account.return", "After a session expires, does signing in again return me to where I was, with what I had typed kept where possible?", "L"),
      i("account.password", "Can the password be shown while typing, pasted and filled by a password manager, with the rules shown before the error?", "B", { ux: [60, 107, 137] }),
    ],
  },
  nav: {
    title: "Navigation",
    items: [
      i("nav.current", "Is the current page highlighted in the menu (and marked with aria-current)?", "L", { ux: [3] }),
      i("nav.same", "Is the menu the same, in the same order, on every page?", "L"),
      i("nav.reach", "Can every page in the plan be reached by clicking, not only by typing its address?", "B"),
      i("nav.deep", "On pages three or more levels down, is there a breadcrumb or a clear trail back?", "L", { ux: [6] }),
    ],
  },
};

// Whole-app consistency, at milestone acceptance: problems you only see by comparing screens.
export const SWEEP = [
  i("sweep.names", "Is the same thing called the same everywhere (not \"client\" here and \"customer\" there; \"Save\" not \"Save changes\" on one screen and \"Update\" on another)?", "L", { measured: ["label-variants"] }),
  i("sweep.formats", "Are dates, times, money and numbers written one way across the app?", "L", { measured: ["mixed-dates", "mixed-money"], ux: [85, 86] }),
  i("sweep.icons", "Does the same icon always mean the same thing, and does each thing always use the same icon?", "L"),
  i("sweep.places", "Do the same kinds of buttons sit in the same place on similar screens (the main action, Cancel, delete)?", "L", { measured: ["button-order"] }),
  i("sweep.titles", "Does every page have its own title (no two pages called the same)?", "L", { measured: ["same-title"] }),
  i("sweep.design", "Do sizes, colours, corner radius and spacing match DESIGN.md on every screen, not only the new ones?", "L", { measured: ["too-many-sizes", "too-many-colours"] }),
  i("sweep.states", "Do empty, loading and error states look and read alike across screens?", "L"),
  i("sweep.journey", "Walked end to end in the order a real person would, does anything feel out of place or repeated?", "L"),
];

// Finishing touches before the first launch.
export const LAUNCH = [
  i("launch.icon", "Does the browser tab show the app's icon (favicon), and is there an icon for phones' home screens?", "L", { measured: ["no-favicon"] }),
  i("launch.titles", "Does every page have a specific title and a short description for search results?", "L", { measured: ["title", "no-description"] }),
  i("launch.share", "Does a shared link show a preview (title, description, image)?", "L", { measured: ["no-share-preview"] }),
  i("launch.404", "Does a wrong address show the app's own \"page not found\" page with a way home?", "B"),
  i("launch.500", "Does a server failure show a friendly \"something went wrong\" page, never a stack trace or a blank screen?", "B"),
  i("launch.help", "Are help, contact, privacy and terms links in the same place on every page?", "L"),
  i("launch.copy", "Is all wording final: no test data, no developer words (\"null\", \"payload\", \"user_id\"), no spelling mistakes?", "L", { measured: ["junk-text"] }),
  i("launch.print", "If people will print or save a page as PDF (invoices, receipts), does it print cleanly?", "L"),
];

export const ALL = [...Object.values(PARTS).flatMap((p) => p.items), ...SWEEP, ...LAUNCH];

// Which parts usually belong on which kind of screen, for screens the plan did not describe.
export const PARTS_FOR_KIND = {
  list: ["screen", "buttons", "list", "dialog", "messages", "states", "safety", "phone", "nav"],
  detail: ["screen", "buttons", "detail", "dialog", "messages", "states", "safety", "phone", "nav"],
  form: ["screen", "buttons", "form", "messages", "states", "safety", "phone", "nav"],
  settings: ["screen", "buttons", "form", "messages", "states", "safety", "phone", "nav"],
  dashboard: ["screen", "buttons", "list", "states", "phone", "nav"],
  signin: ["screen", "buttons", "form", "account", "messages", "states", "phone"],
  landing: ["screen", "buttons", "states", "phone", "nav"],
};
