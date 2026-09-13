# Rekenraket 🚀

Rekenraket ("sum rocket") is a browser-based arithmetic practice tool for
children, built as a single static page with no build step, backend, or
external dependencies. A rocket climbs up a launch rail as the child answers
sums correctly, with an optional Leitner spaced-repetition mode for
longer-term memorization.

The UI is in Dutch, aimed at Dutch-speaking children practicing:

- **Optellen** (addition, `+`)
- **Aftrekken** (subtraction, `-`)
- **Vermenigvuldigen** (multiplication, `×`)
- **Delen** (division, `÷`)

## Running it

There's nothing to build or install. Open [index.html](index.html) directly
in a browser (double-click it, or serve the folder with any static file
server). All progress, settings, and history are stored locally in the
browser's IndexedDB (database `rekenraket_db`) — nothing is sent to a server.

## Features

- **Classic mode**: pick which operations are enabled, how many sums of each
  per round, the number range per operation, and a target number of correct
  answers per round.
- **Leitner mode**: a 3-box spaced-repetition scheduler. Every combination for
  the enabled operations is seeded into box 1. A correct answer promotes a
  card to the next box (box 3 → mastered); answering too late (after the
  per-opgave timer runs out) or incorrectly sends it back to box 1. Box 1 is
  reviewed every day, box 2 every 3rd day, box 3 every 5th day.
- Optional per-opgave countdown timer, a mistake penalty (extra sums added to
  the round after a wrong answer, classic mode only), alternate question
  formats (solving for the first or second operand instead of the result),
  and visual counting blocks for addition/subtraction.
- A history screen with stats per past round (duration, seconds/opgave,
  mistakes, timeouts, settings used) and a Leitner box overview showing which
  sums are in which box.
- Sound effects, a reduced-motion mode, and a choice of two color themes.

## Project layout

- [index.html](index.html) — the entire app: markup, styles, and UI/game
  logic (rendering sums, timers, settings, history, IndexedDB persistence).
- [leitner.js](leitner.js) — the Leitner spaced-repetition rules engine,
  deliberately kept DOM-free and dependency-free so it can be shared between
  the app (as the global `Leitner`) and the Node test suite. It knows nothing
  about IndexedDB, app state, or the DOM — every function takes the data it
  needs as arguments and returns/mutates plain objects.
- [test/leitner.test.js](test/leitner.test.js) — unit tests for `leitner.js`.

## Tests

```sh
npm test
```

Runs the `leitner.js` unit tests via Node's built-in test runner
(`node --test`). There is no automated coverage for `index.html` itself
(DOM/game logic) — changes there should be checked by hand in a browser.
