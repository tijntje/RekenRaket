# Agent instructions for this repo

Rekenraket is a single static page ([index.html](index.html)) with no build
step. Because of that, it's tempting to write every new rule directly inline
in a `<script>` block next to the DOM code it drives — but that logic then
has no way to be tested, since it's entangled with `state`, `el.*` DOM
references, timers, and IndexedDB. Don't do that.

## The pattern: business logic lives in DOM-free modules

[leitner.js](leitner.js) (the Leitner spaced-repetition rules: box
due-dates, promote/demote, the net-mistake-per-opgave scoring rule) and
[rules.js](rules.js) (settings normalization/migration, sum generation) are
plain modules with **no** dependency on the DOM, `state`, or IndexedDB.
Every function takes the data it needs as plain arguments and returns a
value or mutates a plain object it was handed — nothing else. They're
loaded into the page as `<script src="...">` tags exposing a global
(`Leitner`, `Rules`), and also `require()`-able from Node, via the same tiny
UMD wrapper both files use. `index.html` only ever calls into them through
thin wrapper functions that bind the pure logic to the app's actual `state`/
`leitnerCards`/persistence.

**Whenever you add or change a rule that decides an outcome** — a scoring
rule, a threshold, a migration, a formula, anything with an "if X then Y"
that a test could pin down — put it in `leitner.js` or `rules.js` (or a new
module following the same pattern if it's a distinct concern), not inline
in `index.html`'s `<script>` block. `index.html` should only ever be
gluing that pure logic to DOM elements, `state`, and events.

## Every module gets a Node test suite

[test/leitner.test.js](test/leitner.test.js) and
[test/rules.test.js](test/rules.test.js) cover their respective modules
using Node's built-in test runner (`node --test`, aliased to `npm test`).
When you add a function to one of these modules, or add a new module, add
tests for it in the same pass — not as a follow-up, not "if there's time."
A task that changes a rule in `leitner.js`/`rules.js` is not done until
`npm test` covers the new/changed behavior and passes. Match the existing
`describe`/`test` style and assertion granularity (see the existing test
files) rather than introducing a new testing convention.

Cover, at minimum, for any new rule: the normal case, the edge cases the
rule explicitly handles (e.g. "already faulted", "nothing enabled", clamp
boundaries), and any case a bug could plausibly hide in (off-by-one
thresholds, `null`/`undefined` inputs where the caller can pass them).

## What stays untested

`index.html` itself (rendering, timers, animations, audio, IndexedDB
plumbing, modal show/hide) has no automated coverage and isn't expected to
— it's UI wiring, not logic with outcomes to assert on. If a task changes
that kind of code, check it by hand in a browser instead of trying to unit
test it. Do not reach for Playwright or any browser-automation tool in this
environment to verify changes — it isn't available here.

Before considering any task in this repo finished, run `npm test`.
