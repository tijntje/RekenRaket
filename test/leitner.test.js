"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const Leitner = require("../leitner.js");

describe("epochDay", () => {
  test("counts whole days since the Unix epoch", () => {
    assert.equal(Leitner.epochDay(), Math.floor(Date.now() / 86400000));
  });

  test("is stable within the same day", () => {
    assert.equal(Leitner.epochDay(), Leitner.epochDay());
  });

  /* Everything else in this file calls daysUntilDue/boxDueToday/dueInLabel
     with an explicit `day`, which proves the rotation math but not that
     the app's actual clock-driven calls (no `day` argument -- see
     index.html's refreshLeitnerStats/refreshLeitnerPanel) advance when a
     real day passes. Mocking Date.now to jump forward exercises that same
     no-argument path the app uses, so this is the one test that would
     catch e.g. epochDay() accidentally getting memoized. */
  test("a real day passing changes epochDay() and dueInLabel() with no arguments", () => {
    const realNow = Date.now;
    try {
      Date.now = () => realNow();
      const today = Leitner.epochDay();
      const todayLabel = Leitner.dueInLabel(3);

      Date.now = () => realNow() + 86400000;
      const tomorrow = Leitner.epochDay();
      const tomorrowLabel = Leitner.dueInLabel(3);

      assert.equal(tomorrow, today + 1);
      assert.notEqual(tomorrowLabel, todayLabel);
    } finally {
      Date.now = realNow;
    }
  });
});

describe("boxDueToday", () => {
  test("box 1 is due every day", () => {
    for (const day of [0, 1, 2, 3, 4, 5, 100]) {
      assert.equal(Leitner.boxDueToday(1, day), true);
    }
  });

  test("box 2 is due only every 3rd day", () => {
    assert.equal(Leitner.boxDueToday(2, 0), true);
    assert.equal(Leitner.boxDueToday(2, 3), true);
    assert.equal(Leitner.boxDueToday(2, 6), true);
    assert.equal(Leitner.boxDueToday(2, 1), false);
    assert.equal(Leitner.boxDueToday(2, 4), false);
  });

  test("box 3 is due only every 5th day", () => {
    assert.equal(Leitner.boxDueToday(3, 0), true);
    assert.equal(Leitner.boxDueToday(3, 5), true);
    assert.equal(Leitner.boxDueToday(3, 10), true);
    assert.equal(Leitner.boxDueToday(3, 3), false);
    assert.equal(Leitner.boxDueToday(3, 7), false);
  });

  test("an unknown box is never due", () => {
    assert.equal(Leitner.boxDueToday(4, 0), false);
  });

  test("defaults to today when no day is given", () => {
    assert.equal(Leitner.boxDueToday(1), true);
  });
});

describe("daysUntilDue", () => {
  test("box 1 is always 0 (always due)", () => {
    for (const day of [0, 1, 2, 3, 4, 5, 100]) {
      assert.equal(Leitner.daysUntilDue(1, day), 0);
    }
  });

  test("box 2 counts down to the next multiple of 3", () => {
    assert.equal(Leitner.daysUntilDue(2, 3), 0);
    assert.equal(Leitner.daysUntilDue(2, 4), 2);
    assert.equal(Leitner.daysUntilDue(2, 5), 1);
    assert.equal(Leitner.daysUntilDue(2, 6), 0);
  });

  test("box 3 counts down to the next multiple of 5", () => {
    assert.equal(Leitner.daysUntilDue(3, 5), 0);
    assert.equal(Leitner.daysUntilDue(3, 6), 4);
    assert.equal(Leitner.daysUntilDue(3, 9), 1);
    assert.equal(Leitner.daysUntilDue(3, 10), 0);
  });

  test("an unknown box (e.g. 'mastered') is always 0", () => {
    assert.equal(Leitner.daysUntilDue(4, 1), 0);
  });

  /* boxDueToday and daysUntilDue are two independent implementations of
     the same due-day rhythm (see leitner.js) -- nothing forces them to
     agree except this test. Walking a real stretch of consecutive days
     (rather than a handful of hand-picked ones) is what actually proves
     the rotation: box 2 due exactly every 3rd day, box 3 exactly every
     5th, in lockstep with "is it due today". */
  test("agrees with boxDueToday across 60 consecutive days, for every box", () => {
    for (const box of [2, 3]) {
      for (let day = 0; day < 60; day++) {
        assert.equal(Leitner.daysUntilDue(box, day) === 0, Leitner.boxDueToday(box, day),
          `box ${box}, day ${day}`);
      }
    }
  });

  test("box 2 is due exactly every 3rd day, box 3 exactly every 5th", () => {
    for (let day = 0; day < 60; day++) {
      assert.equal(Leitner.boxDueToday(2, day), day % 3 === 0, `day ${day}`);
      assert.equal(Leitner.boxDueToday(3, day), day % 5 === 0, `day ${day}`);
    }
  });
});

describe("dueInLabel", () => {
  test("blank when due today", () => {
    assert.equal(Leitner.dueInLabel(2, 3), "");
    assert.equal(Leitner.dueInLabel(3, 5), "");
  });

  test("calls out tomorrow specifically", () => {
    assert.equal(Leitner.dueInLabel(2, 5), "(voor morgen!)");
    assert.equal(Leitner.dueInLabel(3, 9), "(voor morgen!)");
  });

  test("counts days further out", () => {
    assert.equal(Leitner.dueInLabel(2, 4), "(in 2 dagen)");
    assert.equal(Leitner.dueInLabel(3, 6), "(in 4 dagen)");
  });

  test("blank for a box with no due-day rhythm", () => {
    assert.equal(Leitner.dueInLabel(1, 1), "");
    assert.equal(Leitner.dueInLabel("mastered", 1), "");
  });
});

describe("cardDueToday", () => {
  test("mastered cards are never due", () => {
    const card = { box: 1, mastered: true };
    assert.equal(Leitner.cardDueToday(card, 10), false);
  });

  test("a fresh box-1 card (never seen) is due", () => {
    const card = { box: 1, mastered: false };
    assert.equal(Leitner.cardDueToday(card, 10), true);
  });

  test("a box-1 card already seen today is not due again today", () => {
    const card = { box: 1, mastered: false, lastSeenDay: 10 };
    assert.equal(Leitner.cardDueToday(card, 10), false);
  });

  test("a box-1 card seen yesterday is due again today", () => {
    const card = { box: 1, mastered: false, lastSeenDay: 9 };
    assert.equal(Leitner.cardDueToday(card, 10), true);
  });

  test("a box-2 card is not due on a non-multiple-of-3 day, even if unseen", () => {
    const card = { box: 2, mastered: false };
    assert.equal(Leitner.cardDueToday(card, 10), false);
  });

  test("a box-2 card is due on a multiple-of-3 day if not yet seen today", () => {
    const card = { box: 2, mastered: false };
    assert.equal(Leitner.cardDueToday(card, 9), true);
  });
});

describe("boxDueSince", () => {
  test("box 1 is due whenever at least one day has passed", () => {
    assert.equal(Leitner.boxDueSince(1, 9, 10), true);
    assert.equal(Leitner.boxDueSince(1, 3, 10), true);
    assert.equal(Leitner.boxDueSince(1, 10, 10), false);
  });

  test("box 2: a due day (multiple of 3) inside the gap counts", () => {
    assert.equal(Leitner.boxDueSince(2, 5, 7), true);  // day 6 was skipped
    assert.equal(Leitner.boxDueSince(2, 6, 7), false); // seen on 6, next is 9
    assert.equal(Leitner.boxDueSince(2, 7, 8), false);
    assert.equal(Leitner.boxDueSince(2, 8, 9), true);
  });

  test("box 3: a due day (multiple of 5) inside the gap counts", () => {
    assert.equal(Leitner.boxDueSince(3, 9, 11), true); // day 10 was skipped
    assert.equal(Leitner.boxDueSince(3, 10, 14), false);
    assert.equal(Leitner.boxDueSince(3, 10, 15), true);
  });

  test("not a real box: never due", () => {
    assert.equal(Leitner.boxDueSince(4, 0, 100), false);
  });

  test("agrees with boxDueToday when the gap is a single day", () => {
    [1, 2, 3].forEach(box => {
      for(let day = 1; day < 40; day++){
        assert.equal(Leitner.boxDueSince(box, day - 1, day), Leitner.boxDueToday(box, day), `box ${box} day ${day}`);
      }
    });
  });
});

describe("skipped days carry over", () => {
  test("a box-2 card whose due day was skipped is due the next day", () => {
    const card = { box: 2, mastered: false, lastSeenDay: 5 };
    assert.equal(Leitner.cardDueToday(card, 6), true);
    assert.equal(Leitner.cardDueToday(card, 7), true);
  });

  test("a box-2 card seen on its due day is not due again until the next one", () => {
    const card = { box: 2, mastered: false, lastSeenDay: 6 };
    assert.equal(Leitner.cardDueToday(card, 7), false);
    assert.equal(Leitner.cardDueToday(card, 8), false);
    assert.equal(Leitner.cardDueToday(card, 9), true);
  });

  test("skipping several days gathers every box's missed cards at once", () => {
    const cards = {
      a: { op: "+", box: 1, mastered: false, lastSeenDay: 10 },
      b: { op: "+", box: 2, mastered: false, lastSeenDay: 10 },
      c: { op: "+", box: 3, mastered: false, lastSeenDay: 10 },
    };
    // child practiced on 10, skipped 11-14, returns on 15: all three are due
    assert.deepEqual(Leitner.dueCardsForOp(cards, "+", 15).map(e => e.id), ["a", "b", "c"]);
    // ...but on day 11 (no skip) only box 1 is
    assert.deepEqual(Leitner.dueCardsForOp(cards, "+", 11).map(e => e.id), ["a"]);
  });

  test("a mastered card never carries over", () => {
    assert.equal(Leitner.cardDueToday({ box: 2, mastered: true, lastSeenDay: 1 }, 20), false);
  });

  test("a card seen today is not due even after a long gap elsewhere", () => {
    assert.equal(Leitner.cardDueToday({ box: 2, mastered: false, lastSeenDay: 15 }, 15), false);
  });
});

describe("rolloverIfNewDay", () => {
  function freshState(day){
    return {
      leitnerDay: day, correct: 5, streak: 3, roundStartTs: 1000,
      roundMistakes: 4, roundTimeouts: 2, roundLongestStreak: 6,
      roundLog: [{ op: "+", a: 1, b: 2, result: 3, outcome: "wrong", ms: 500 }]
    };
  }

  test("same day: leaves everything untouched and returns false", () => {
    const state = freshState(10);
    const changed = Leitner.rolloverIfNewDay(state, 10);
    assert.equal(changed, false);
    assert.deepEqual(state, freshState(10));
  });

  test("new day: resets correct/streak AND every round-tracking field together", () => {
    const state = freshState(10);
    const changed = Leitner.rolloverIfNewDay(state, 11);
    assert.equal(changed, true);
    assert.equal(state.leitnerDay, 11);
    assert.equal(state.correct, 0);
    assert.equal(state.streak, 0);
    // A stale round tally is exactly the bug this guards against: today's
    // mistakes/timeouts must not be added on top of yesterday's leftovers.
    assert.equal(state.roundMistakes, 0);
    assert.equal(state.roundTimeouts, 0);
    assert.equal(state.roundLongestStreak, 0);
    assert.deepEqual(state.roundLog, []);
    assert.ok(state.roundStartTs >= 1000);
  });
});

describe("cardId", () => {
  test("joins op/a/b with colons", () => {
    assert.equal(Leitner.cardId("+", 3, 4), "+:3:4");
    assert.equal(Leitner.cardId("÷", 12, 3), "÷:12:3");
  });
});

describe("allCombosForOp", () => {
  test("+ enumerates every a,b with a+b <= max", () => {
    const combos = Leitner.allCombosForOp("+", 2);
    assert.deepEqual(
      combos.map((c) => [c.a, c.b, c.result]).sort(),
      [[0, 0, 0], [0, 1, 1], [0, 2, 2], [1, 0, 1], [1, 1, 2], [2, 0, 2]].sort()
    );
  });

  test("- enumerates every a,b with 0 <= b <= a", () => {
    const combos = Leitner.allCombosForOp("-", 2);
    assert.deepEqual(
      combos.map((c) => [c.a, c.b, c.result]).sort(),
      [[0, 0, 0], [1, 0, 1], [1, 1, 0], [2, 0, 2], [2, 1, 1], [2, 2, 0]].sort()
    );
  });

  test("× steps the tafel 1..max against the multiplier 1..10", () => {
    const combos = Leitner.allCombosForOp("×", 3);
    assert.equal(combos.length, 30);
    for (const c of combos) {
      assert.ok(c.a >= 1 && c.a <= 3);
      assert.ok(c.b >= 1 && c.b <= 10);
      assert.equal(c.result, c.a * c.b);
    }
  });

  test("÷ steps the divisor 1..max against the quotient 1..10", () => {
    const combos = Leitner.allCombosForOp("÷", 3);
    assert.equal(combos.length, 30);
    for (const c of combos) {
      assert.ok(c.b >= 1 && c.b <= 3);
      assert.ok(c.result >= 1 && c.result <= 10);
      assert.equal(c.a, c.b * c.result);
    }
  });
});

describe("promoteCard", () => {
  test("a fast answer moves box 1 -> 2", () => {
    const card = { box: 1, mastered: false };
    Leitner.promoteCard(card, true, 10);
    assert.equal(card.box, 2);
    assert.equal(card.mastered, false);
    assert.equal(card.lastSeenDay, 10);
  });

  test("a fast answer moves box 2 -> 3", () => {
    const card = { box: 2, mastered: false };
    Leitner.promoteCard(card, true, 10);
    assert.equal(card.box, 3);
  });

  test("a fast answer on box 3 masters the card (box stays 3)", () => {
    const card = { box: 3, mastered: false };
    Leitner.promoteCard(card, true, 10);
    assert.equal(card.box, 3);
    assert.equal(card.mastered, true);
  });

  test("a slow (not-fast) correct answer leaves the box unchanged", () => {
    const card = { box: 1, mastered: false };
    Leitner.promoteCard(card, false, 10);
    assert.equal(card.box, 1);
    assert.equal(card.mastered, false);
  });

  test("lastSeenDay is stamped even when the answer wasn't fast", () => {
    const card = { box: 1, mastered: false };
    Leitner.promoteCard(card, false, 10);
    assert.equal(card.lastSeenDay, 10);
  });
});

describe("promoteCard: once per day", () => {
  test("a second fast answer the same day does not promote again", () => {
    const card = { box: 1, mastered: false };
    Leitner.promoteCard(card, true, 10);
    Leitner.promoteCard(card, true, 10);
    Leitner.promoteCard(card, true, 10);
    assert.equal(card.box, 2);
    assert.equal(card.mastered, false);
  });

  test("a box 2 -> 3 card is not mastered by a same-day repeat", () => {
    const card = { box: 2, mastered: false };
    Leitner.promoteCard(card, true, 10);
    Leitner.promoteCard(card, true, 10);
    assert.equal(card.box, 3);
    assert.equal(card.mastered, false);
  });

  test("a card seen (e.g. slow answer) earlier today is not promoted by a later fast one", () => {
    const card = { box: 1, mastered: false, lastSeenDay: 10 };
    Leitner.promoteCard(card, true, 10);
    assert.equal(card.box, 1);
  });

  test("promotes again on a later day", () => {
    const card = { box: 1, mastered: false };
    Leitner.promoteCard(card, true, 10);
    Leitner.promoteCard(card, true, 11);
    assert.equal(card.box, 3);
    assert.equal(card.mastered, false);
    Leitner.promoteCard(card, true, 12);
    assert.equal(card.mastered, true);
  });

  test("a manually moved card (lastSeenDay cleared) can promote the same day", () => {
    const card = { box: 1, mastered: false, lastSeenDay: 10 };
    Leitner.moveCard(card, 2);
    Leitner.promoteCard(card, true, 10);
    assert.equal(card.box, 3);
  });
});

describe("demoteCard", () => {
  test("sends any card back to box 1, un-mastered, stamped as seen today", () => {
    const card = { box: 3, mastered: true, lastSeenDay: 5 };
    Leitner.demoteCard(card, 10);
    assert.equal(card.box, 1);
    assert.equal(card.mastered, false);
    assert.equal(card.lastSeenDay, 10);
  });
});

describe("scoreAttempt", () => {
  test("a correct first try (fast) promotes the card and isn't a new mistake", () => {
    const card = { box: 1, mastered: false };
    const result = Leitner.scoreAttempt(card, false, true, true, 10);
    assert.equal(card.box, 2);
    assert.deepEqual(result, { faulted: false, isNewMistake: false });
  });

  test("a correct first try that wasn't fast leaves the box unchanged", () => {
    const card = { box: 1, mastered: false };
    const result = Leitner.scoreAttempt(card, false, true, false, 10);
    assert.equal(card.box, 1);
    assert.deepEqual(result, { faulted: false, isNewMistake: false });
  });

  test("a first wrong try demotes the card and is a new mistake", () => {
    const card = { box: 3, mastered: false };
    const result = Leitner.scoreAttempt(card, false, false, false, 10);
    assert.equal(card.box, 1);
    assert.deepEqual(result, { faulted: true, isNewMistake: true });
  });

  test("once faulted, a further wrong retry changes nothing and isn't counted again", () => {
    const card = { box: 1, mastered: false, lastSeenDay: 10 };
    const result = Leitner.scoreAttempt(card, true, false, false, 10);
    assert.equal(card.box, 1);
    assert.deepEqual(result, { faulted: true, isNewMistake: false });
  });

  test("once faulted, the eventual correct answer does not promote the card", () => {
    const card = { box: 1, mastered: false, lastSeenDay: 10 };
    const result = Leitner.scoreAttempt(card, true, true, true, 10);
    assert.equal(card.box, 1);
    assert.deepEqual(result, { faulted: true, isNewMistake: false });
  });

  test("five wrong tries then a correct one nets exactly one mistake and box 1", () => {
    const card = { box: 3, mastered: false };
    let faulted = false;
    let mistakes = 0;
    for (let i = 0; i < 5; i++) {
      const r = Leitner.scoreAttempt(card, faulted, false, false, 10);
      faulted = r.faulted;
      if (r.isNewMistake) mistakes++;
    }
    const finalTry = Leitner.scoreAttempt(card, faulted, true, true, 10);
    assert.equal(mistakes, 1);
    assert.equal(card.box, 1);
    assert.equal(finalTry.isNewMistake, false);
  });

  test("works without a card (classic mode has no Leitner card for an opgave)", () => {
    const result = Leitner.scoreAttempt(null, false, false, false, 10);
    assert.deepEqual(result, { faulted: true, isNewMistake: true });
  });

  test("a null card on an already-faulted opgave still reports no new mistake", () => {
    const result = Leitner.scoreAttempt(undefined, true, true, true, 10);
    assert.deepEqual(result, { faulted: true, isNewMistake: false });
  });
});

describe("moveCard", () => {
  test("sets the new box, un-masters, and clears lastSeenDay", () => {
    const card = { box: 1, mastered: true, lastSeenDay: 10 };
    Leitner.moveCard(card, 3);
    assert.equal(card.box, 3);
    assert.equal(card.mastered, false);
    assert.equal("lastSeenDay" in card, false);
  });
});

describe("moveAllInView", () => {
  const mk = () => ({
    "+:1:2": { op: "+", a: 1, b: 2, result: 3, box: 1, mastered: false, lastSeenDay: 4 },
    "+:2:2": { op: "+", a: 2, b: 2, result: 4, box: 2, mastered: false },
    "+:3:3": { op: "+", a: 3, b: 3, result: 6, box: 3, mastered: true },
    "+:4:4": { op: "+", a: 4, b: 4, result: 8, box: 3, mastered: true }
  });

  test("moves every mastered card to the chosen box and un-masters it", () => {
    const cards = mk();
    const moved = Leitner.moveAllInView(cards, "mastered", 1);
    assert.deepEqual(moved.map((e) => e.id), ["+:3:3", "+:4:4"]);
    assert.equal(cards["+:3:3"].box, 1);
    assert.equal(cards["+:3:3"].mastered, false);
    assert.equal(cards["+:4:4"].mastered, false);
    assert.equal(Leitner.countBoxes(cards)[1], 3);
  });

  test("leaves cards in other boxes untouched", () => {
    const cards = mk();
    Leitner.moveAllInView(cards, "mastered", 1);
    assert.equal(cards["+:2:2"].box, 2);
    assert.equal(cards["+:1:2"].lastSeenDay, 4);
  });

  test("clears lastSeenDay on moved cards", () => {
    const cards = mk();
    Leitner.moveAllInView(cards, "1", 3);
    assert.equal("lastSeenDay" in cards["+:1:2"], false);
    assert.equal(cards["+:1:2"].box, 3);
  });

  test("moving a box into itself is a no-op", () => {
    const cards = mk();
    assert.deepEqual(Leitner.moveAllInView(cards, "2", 2), []);
    assert.equal(cards["+:2:2"].box, 2);
  });

  test("an empty view moves nothing", () => {
    assert.deepEqual(Leitner.moveAllInView(mk(), "1", 2).length, 1);
    assert.deepEqual(Leitner.moveAllInView({}, "1", 2), []);
  });
});

describe("countBoxes", () => {
  test("tallies box counts and mastered separately", () => {
    const cards = {
      a: { box: 1, mastered: false },
      b: { box: 1, mastered: false },
      c: { box: 2, mastered: false },
      d: { box: 3, mastered: true }
    };
    assert.deepEqual(Leitner.countBoxes(cards), { 1: 2, 2: 1, 3: 0, mastered: 1 });
  });

  test("an empty card set counts everything as zero", () => {
    assert.deepEqual(Leitner.countBoxes({}), { 1: 0, 2: 0, 3: 0, mastered: 0 });
  });
});

describe("cardsInView", () => {
  const cards = {
    "+:1:2": { op: "+", a: 1, b: 2, result: 3, box: 1, mastered: false },
    "+:0:1": { op: "+", a: 0, b: 1, result: 1, box: 1, mastered: false },
    "-:5:2": { op: "-", a: 5, b: 2, result: 3, box: 2, mastered: false },
    "×:3:4": { op: "×", a: 3, b: 4, result: 12, box: 3, mastered: true }
  };

  test("filters to just the requested box", () => {
    const view = Leitner.cardsInView(cards, "1");
    assert.deepEqual(view.map((e) => e.id).sort(), ["+:0:1", "+:1:2"]);
  });

  test("filters to mastered cards regardless of their box", () => {
    const view = Leitner.cardsInView(cards, "mastered");
    assert.deepEqual(view.map((e) => e.id), ["×:3:4"]);
  });

  test("sorts by op, then a, then b", () => {
    const view = Leitner.cardsInView(cards, "1");
    assert.deepEqual(view.map((e) => [e.card.a, e.card.b]), [[0, 1], [1, 2]]);
  });
});

describe("cardLabel", () => {
  test("formats as 'a op b = result'", () => {
    assert.equal(Leitner.cardLabel({ a: 3, b: 4, op: "+", result: 7 }), "3 + 4 = 7");
    assert.equal(Leitner.cardLabel({ a: 12, b: 4, op: "÷", result: 3 }), "12 ÷ 4 = 3");
  });
});

describe("dueCardsForOp", () => {
  const cards = {
    "+:1:2": { op: "+", a: 1, b: 2, result: 3, box: 1, mastered: false },
    "+:0:1": { op: "+", a: 0, b: 1, result: 1, box: 1, mastered: false, lastSeenDay: 10 },
    "-:5:2": { op: "-", a: 5, b: 2, result: 3, box: 1, mastered: false },
    "+:9:9": { op: "+", a: 9, b: 9, result: 18, box: 2, mastered: false }
  };

  test("only returns cards for the requested op that are due today", () => {
    const due = Leitner.dueCardsForOp(cards, "+", 10);
    assert.deepEqual(due.map((e) => e.id).sort(), ["+:1:2"]);
  });

  test("excludes an op's cards that were already seen today", () => {
    const due = Leitner.dueCardsForOp(cards, "+", 10);
    assert.ok(!due.some((e) => e.id === "+:0:1"));
  });

  test("excludes an op's cards whose box isn't due today", () => {
    const due = Leitner.dueCardsForOp(cards, "+", 11);
    assert.ok(!due.some((e) => e.id === "+:9:9"));
  });

  test("excludes cards whose id is in excludeIds (already queued)", () => {
    const due = Leitner.dueCardsForOp(cards, "+", 10, new Set(["+:1:2"]));
    assert.deepEqual(due, []);
  });

  test("an empty excludeIds set excludes nothing", () => {
    const due = Leitner.dueCardsForOp(cards, "+", 10, new Set());
    assert.deepEqual(due.map((e) => e.id), ["+:1:2"]);
  });

  test("defaults to today when no day is given", () => {
    assert.doesNotThrow(() => Leitner.dueCardsForOp(cards, "-"));
  });
});

describe("buildSeedEntries", () => {
  test("builds a fresh box-1 record for every combo of every op def", () => {
    const entries = Leitner.buildSeedEntries([
      { symbol: "+", max: 1 },
      { symbol: "×", max: 1 }
    ]);
    // "+" tot 1: (0,0) (0,1) (1,0) = 3 combos. "×" tot 1: 1 tafel * 10 multipliers = 10 combos.
    assert.equal(entries.length, 13);
    for (const e of entries) {
      assert.equal(e.record.box, 1);
      assert.equal(e.record.mastered, false);
      assert.equal(e.id, Leitner.cardId(e.record.op, e.record.a, e.record.b));
    }
  });

  test("an empty op-def list builds nothing", () => {
    assert.deepEqual(Leitner.buildSeedEntries([]), []);
  });
});

describe("createStore", () => {
  /* A minimal fake standing in for an IndexedDB connection, just enough
     of the `transaction(store, mode).objectStore(store)` surface that
     createStore actually calls, so this stays a zero-dependency test
     (no real IndexedDB, no fake-indexeddb package). */
  function makeFakeDb(initial){
    let data = Object.assign({}, initial || {});
    function objectStore(){
      return {
        put(record, id){ data[id] = record; },
        clear(){ data = {}; },
        openCursor(){
          const keys = Object.keys(data);
          let idx = 0;
          const req = { onsuccess: null, onerror: null };
          function emit(){
            req.result = idx < keys.length
              ? { key: keys[idx], value: data[keys[idx]], continue(){ idx++; queueMicrotask(emit); } }
              : null;
            if (req.onsuccess) req.onsuccess({ target: req });
          }
          queueMicrotask(emit);
          return req;
        }
      };
    }
    return { transaction: () => ({ objectStore }), getData: () => data };
  }

  test("put() writes a record under the given key", async () => {
    const db = makeFakeDb();
    const store = Leitner.createStore(() => Promise.resolve(db), "leitner");
    await store.put("+:1:2", { op: "+", a: 1, b: 2 });
    assert.deepEqual(db.getData(), { "+:1:2": { op: "+", a: 1, b: 2 } });
  });

  test("putAll() writes every entry in one pass", async () => {
    const db = makeFakeDb();
    const store = Leitner.createStore(() => Promise.resolve(db), "leitner");
    await store.putAll([
      { id: "a", record: { box: 1 } },
      { id: "b", record: { box: 2 } }
    ]);
    assert.deepEqual(db.getData(), { a: { box: 1 }, b: { box: 2 } });
  });

  test("clear() empties the store", async () => {
    const db = makeFakeDb({ a: { box: 1 } });
    const store = Leitner.createStore(() => Promise.resolve(db), "leitner");
    await store.clear();
    assert.deepEqual(db.getData(), {});
  });

  test("loadAll() returns every stored record keyed by id", () => {
    const db = makeFakeDb({ a: { box: 1 }, b: { box: 2 } });
    const store = Leitner.createStore(() => Promise.resolve(db), "leitner");
    return new Promise((resolve) => {
      store.loadAll((result) => {
        assert.deepEqual(result, { a: { box: 1 }, b: { box: 2 } });
        resolve();
      });
    });
  });

  test("loadAll() on an empty store resolves with an empty object", () => {
    const db = makeFakeDb();
    const store = Leitner.createStore(() => Promise.resolve(db), "leitner");
    return new Promise((resolve) => {
      store.loadAll((result) => {
        assert.deepEqual(result, {});
        resolve();
      });
    });
  });

  test("a getDb that rejects is swallowed, not thrown", async () => {
    const store = Leitner.createStore(() => Promise.reject(new Error("no indexeddb")), "leitner");
    await assert.doesNotReject(store.put("a", { box: 1 }));
    await assert.doesNotReject(store.clear());
    await assert.doesNotReject(store.putAll([]));
  });

  test("loadAll() still calls back with {} when getDb rejects", () => {
    const store = Leitner.createStore(() => Promise.reject(new Error("no indexeddb")), "leitner");
    return new Promise((resolve) => {
      store.loadAll((result) => {
        assert.deepEqual(result, {});
        resolve();
      });
    });
  });
});
