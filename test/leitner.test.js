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

describe("demoteCard", () => {
  test("sends any card back to box 1, un-mastered, stamped as seen today", () => {
    const card = { box: 3, mastered: true, lastSeenDay: 5 };
    Leitner.demoteCard(card, 10);
    assert.equal(card.box, 1);
    assert.equal(card.mastered, false);
    assert.equal(card.lastSeenDay, 10);
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
