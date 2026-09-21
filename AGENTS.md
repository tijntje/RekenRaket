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

**Any new functionality or reported bug needs a test, full stop** — not
just changes that happen to already live in `leitner.js`/`rules.js`. If the
functionality or bug lives inline in `index.html` instead, that's a sign
the decision it makes belongs in a pure module per the pattern above:
extract it (or the smallest piece of it that has a testable outcome) into
`leitner.js`/`rules.js`/a new module, wire `index.html` to call it, and add
a test. E.g. the day-rollover bug where `state.roundMistakes` etc. weren't
reset alongside `state.correct` on a new day got fixed by pulling that
whole reset into `Leitner.rolloverIfNewDay()` and testing that it zeroes
every round-tracking field together — that same shape (bundle the related
resets/decisions into one tested function) is the template for future
bug fixes, not a one-off. Only reach for "no automated coverage" (below)
once extraction genuinely isn't possible.

## Keep the logboek complete

The logboek ([eventlog.js](eventlog.js), events written in `index.html` via
`logEvent(...)`) is how a game gets debugged after the fact: the child plays
on an iPad, the export/log is pasted to a developer, and the whole game has
to be replayable from it (see `test/eventlog.test.js`). A logboek with holes
defeats that purpose, so **whenever you add or change anything that affects
what happens in a game, log it in the same pass** — a new rule or scoring
decision, a new kind of opgave or queue source, a new setting, gate/screen,
button that changes state, or any other state change. Concretely:

- Log the *decision and its inputs/outputs* (e.g. card before/after, what
  was answered), not just that something happened.
- New settings are picked up automatically by `settings_change` (via
  `EventLog.settingsSnapshot`) as long as they live on `state`; per-round
  progress keys must be added to `PROGRESS_KEYS` in `eventlog.js`.
- Keep the readable form: opgaven as `5+3=x` (`EventLog.sumText`), and add a
  case to `describe` in `eventlog.js` for any new event type with a bespoke
  layout, plus tests for it in `test/eventlog.test.js`.
- The logboek is export-only: importing must never read or overwrite it.
- Keep events after `run_start`: anything that belongs to a run must be
  logged after that run's `run_start`, because `EventLog.trimEvents` cuts
  there.

## Bump the version with every change

The app's version lives in [version.js](version.js) (global `Version`,
shown at the bottom of Instellingen → Algemeen and logged in
`session_start`), and `package.json`'s `"version"` must equal it —
`test/version.test.js` fails if they drift. It is semver, MAJOR.MINOR.PATCH:

- **PATCH**: a bug fix or wording tweak; nothing new for the child.
- **MINOR**: new functionality — a feature, setting, rule, or screen.
- **MAJOR**: a change that can break stored data — a new IndexedDB layout,
  an irreversible settings migration, or a backup format older exports
  can't be imported into.

Bump it in the same pass as the change, in both files, **and add an entry
for the new version at the top of `changelog` in `version.js`** — short
Dutch sentences describing what changed for the user. The changelog opens
when the version at the bottom of Instellingen → Algemeen is tapped and
keeps every version ever released, so never delete or rewrite old entries.
`test/version.test.js` fails if the top entry isn't the current version. Stay below 1.0.0
until the owner says the app is finished.

## What stays untested

Pure UI wiring in `index.html` — rendering, timers, animations, audio,
IndexedDB plumbing, modal show/hide — has no automated coverage and isn't
expected to, because it has no outcome a test could assert on beyond "did
the DOM change," which this repo doesn't have a harness for. This is a
narrow exception, not a default: it applies to the wiring itself, not to
any decision/rule/reset that wiring happens to trigger (see above — that
belongs in a tested module). If a task changes genuine UI wiring, check it
by hand in a browser instead of trying to unit test it. Do not reach for
Playwright or any browser-automation tool in this environment to verify
changes — it isn't available here.

Before considering any task in this repo finished, run `npm test`.
