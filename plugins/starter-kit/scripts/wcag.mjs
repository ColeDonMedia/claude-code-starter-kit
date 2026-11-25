// WCAG 2.2 Level A and AA, all 55 success criteria, in plain words, with how the kit checks each one:
//   axe     the axe-core accessibility engine, run in the browser tests (templates/a11y.spec.js)
//   kit     the kit's own browser checks in the same test (keyboard walk, focus, reflow, zoom, motion, target size)
//   person  needs a human: judgement, content, media, or flows a script cannot follow
// Several criteria are partly automatic: "axe+person" means the engine catches the common failures and a person checks the rest.
// Automated tools find roughly half of real accessibility problems, so the "person" items are part of every acceptance.
// 4.1.1 Parsing is not here: WCAG 2.2 removed it. Source: the W3C WCAG 2.2 Recommendation (https://www.w3.org/TR/WCAG22/).

export const CRITERIA = [
  ["1.1.1", "Non-text Content", "A", "Every image, icon and control has a text alternative that says what it is or does; decorative images are hidden from screen readers.", "axe+person"],
  ["1.2.1", "Audio-only and Video-only (Prerecorded)", "A", "Recorded audio has a transcript; silent video has a text or audio description.", "person"],
  ["1.2.2", "Captions (Prerecorded)", "A", "Recorded videos with sound have captions.", "person"],
  ["1.2.3", "Audio Description or Media Alternative (Prerecorded)", "A", "What is only shown in a video is also described (audio description or a text version).", "person"],
  ["1.2.4", "Captions (Live)", "AA", "Live video with sound has live captions.", "person"],
  ["1.2.5", "Audio Description (Prerecorded)", "AA", "Recorded video has audio description of important visual content.", "person"],
  ["1.3.1", "Info and Relationships", "A", "Headings, lists, tables, labels and groups are marked up as such, not only styled to look like them.", "axe+person"],
  ["1.3.2", "Meaningful Sequence", "A", "The reading order in the code matches the order that makes sense.", "person"],
  ["1.3.3", "Sensory Characteristics", "A", "Instructions don't rely only on shape, position, colour or sound (\"click the round button on the right\").", "person"],
  ["1.3.4", "Orientation", "AA", "Works in both portrait and landscape unless one is essential.", "person"],
  ["1.3.5", "Identify Input Purpose", "AA", "Fields about the user (name, email, address) say what they are (autocomplete), so browsers can fill them.", "axe"],
  ["1.4.1", "Use of Color", "A", "Colour is never the only way to show something (errors, links in text, required fields, chart series).", "axe+person"],
  ["1.4.2", "Audio Control", "A", "Sound that plays by itself for more than 3 seconds can be paused or muted.", "axe+person"],
  ["1.4.3", "Contrast (Minimum)", "AA", "Text has 4.5:1 contrast with its background (3:1 for large text).", "axe"],
  ["1.4.4", "Resize Text", "AA", "Text can be enlarged to 200% without losing content or function.", "kit"],
  ["1.4.5", "Images of Text", "AA", "Real text is used instead of pictures of text (logos excepted).", "person"],
  ["1.4.10", "Reflow", "AA", "At 320 px wide (400% zoom on a laptop) everything fits without scrolling sideways.", "kit"],
  ["1.4.11", "Non-text Contrast", "AA", "Control borders, focus rings, icons and chart parts that matter have 3:1 contrast.", "person"],
  ["1.4.12", "Text Spacing", "AA", "Nothing breaks when people increase line, letter, word or paragraph spacing.", "axe+person"],
  ["1.4.13", "Content on Hover or Focus", "AA", "Tooltips and pop-ups that appear on hover or focus can be dismissed, hovered and stay until moved away from.", "person"],
  ["2.1.1", "Keyboard", "A", "Everything can be done with a keyboard alone.", "kit+person"],
  ["2.1.2", "No Keyboard Trap", "A", "Keyboard focus never gets stuck in one place.", "kit"],
  ["2.1.4", "Character Key Shortcuts", "A", "Single-key shortcuts can be turned off or changed, or only work while a control has focus.", "person"],
  ["2.2.1", "Timing Adjustable", "A", "Time limits can be turned off, adjusted or extended (with a warning first).", "axe+person"],
  ["2.2.2", "Pause, Stop, Hide", "A", "Moving, blinking or auto-updating content can be paused, stopped or hidden.", "axe+person"],
  ["2.3.1", "Three Flashes or Below Threshold", "A", "Nothing flashes more than three times a second.", "person"],
  ["2.4.1", "Bypass Blocks", "A", "There is a way to skip repeated navigation (a skip link or landmarks).", "axe"],
  ["2.4.2", "Page Titled", "A", "Every page has a title that says what it is.", "axe"],
  ["2.4.3", "Focus Order", "A", "Keyboard focus moves in an order that keeps meaning and use intact.", "kit+person"],
  ["2.4.4", "Link Purpose (In Context)", "A", "Each link's purpose is clear from its text and context (no unexplained \"click here\").", "axe+person"],
  ["2.4.5", "Multiple Ways", "AA", "Pages can be found in more than one way (navigation, search, site map), except steps in a process.", "person"],
  ["2.4.6", "Headings and Labels", "AA", "Headings and labels describe their topic or purpose.", "person"],
  ["2.4.7", "Focus Visible", "AA", "The keyboard focus is always visible.", "kit"],
  ["2.4.11", "Focus Not Obscured (Minimum)", "AA", "The focused element is never completely hidden by sticky headers, banners or other content.", "kit"],
  ["2.5.1", "Pointer Gestures", "A", "Anything done with a multi-finger or path gesture (pinch, swipe a shape) can also be done with a single tap.", "person"],
  ["2.5.2", "Pointer Cancellation", "A", "Actions happen when the finger or button is released, so a mistaken press can be dragged away.", "person"],
  ["2.5.3", "Label in Name", "A", "A control's accessible name contains the words shown on it (for voice control).", "axe+person"],
  ["2.5.4", "Motion Actuation", "A", "Anything triggered by shaking or tilting can also be done with a control, and the motion can be turned off.", "person"],
  ["2.5.7", "Dragging Movements", "AA", "Anything done by dragging can also be done with simple taps or clicks.", "person"],
  ["2.5.8", "Target Size (Minimum)", "AA", "Tap targets are at least 24 by 24 px, or spaced so a 24 px circle around each doesn't overlap another.", "axe+kit"],
  ["3.1.1", "Language of Page", "A", "The page states its language.", "axe"],
  ["3.1.2", "Language of Parts", "AA", "Passages in another language are marked with that language.", "axe+person"],
  ["3.2.1", "On Focus", "A", "Moving focus onto something never changes the page or context by itself.", "person"],
  ["3.2.2", "On Input", "A", "Changing a setting or field never causes a surprise change of context without warning.", "person"],
  ["3.2.3", "Consistent Navigation", "AA", "Navigation repeated on several pages stays in the same order.", "person"],
  ["3.2.4", "Consistent Identification", "AA", "Things that do the same job look and are named the same everywhere.", "person"],
  ["3.2.6", "Consistent Help", "A", "Help (contact details, chat, a help page) is in the same place on every page that has it.", "person"],
  ["3.3.1", "Error Identification", "A", "Errors are pointed out and described in text.", "person"],
  ["3.3.2", "Labels or Instructions", "A", "Fields have labels or instructions.", "axe+person"],
  ["3.3.3", "Error Suggestion", "AA", "When the fix for an error is known, the message says what to do.", "person"],
  ["3.3.4", "Error Prevention (Legal, Financial, Data)", "AA", "Purchases, legal commitments and data changes can be reviewed, corrected or undone before they are final.", "person"],
  ["3.3.7", "Redundant Entry", "A", "Information already given in the same process is filled in or offered, not asked again.", "person"],
  ["3.3.8", "Accessible Authentication (Minimum)", "AA", "Signing in never requires remembering, transcribing or solving a puzzle unless there is an alternative; paste and password managers work.", "person"],
  ["4.1.2", "Name, Role, Value", "A", "Every control exposes its name, role and state to assistive technology.", "axe"],
  ["4.1.3", "Status Messages", "AA", "Status messages (\"saved\", \"3 results\", errors) are announced without moving focus.", "person"],
].map(([id, name, level, plain, check]) => ({ id, name, level, plain, check }));

export const NEW_IN_22 = ["2.4.11", "2.5.7", "2.5.8", "3.2.6", "3.3.7", "3.3.8"];
export const byId = (id) => CRITERIA.find((c) => c.id === id);
export const manual = () => CRITERIA.filter((c) => c.check.includes("person"));
