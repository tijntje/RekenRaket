"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const Rules = require("../rules.js");

describe("normalizeCount", () => {
  test("rounds to the nearest multiple of 5", () => {
    assert.equal(Rules.normalizeCount(12), 10);
    assert.equal(Rules.normalizeCount(13), 15);
  });

  test("clamps below 5 up to 5", () => {
    assert.equal(Rules.normalizeCount(0), 5);
    assert.equal(Rules.normalizeCount(-10), 5);
  });

  test("clamps above 60 down to 60", () => {
    assert.equal(Rules.normalizeCount(100), 60);
  });
});

describe("computeTarget", () => {
  const opDefs = [
    { enabledKey: "opAddEnabled", countKey: "opAddCount" },
    { enabledKey: "opSubEnabled", countKey: "opSubCount" }
  ];

  test("sums the counts of enabled ops only", () => {
    const s = { opAddEnabled: true, opAddCount: 10, opSubEnabled: true, opSubCount: 15 };
    assert.equal(Rules.computeTarget(opDefs, s), 25);
  });

  test("ignores disabled ops", () => {
    const s = { opAddEnabled: true, opAddCount: 10, opSubEnabled: false, opSubCount: 15 };
    assert.equal(Rules.computeTarget(opDefs, s), 10);
  });

  test("falls back to 5 when nothing is enabled", () => {
    const s = { opAddEnabled: false, opAddCount: 10, opSubEnabled: false, opSubCount: 15 };
    assert.equal(Rules.computeTarget(opDefs, s), 5);
  });
});

describe("migrateOpFields", () => {
  test("leaves an already-migrated save untouched", () => {
    const raw = { opAddEnabled: true, opAddCount: 20 };
    assert.equal(Rules.migrateOpFields(raw), raw);
  });

  test("translates legacy opAdd/opSub booleans and a single target into per-op fields", () => {
    const raw = { opAdd: true, opSub: false, target: 12 };
    const migrated = Rules.migrateOpFields(raw);
    assert.equal(migrated.opAddEnabled, true);
    assert.equal(migrated.opSubEnabled, false);
    assert.equal(migrated.opAddCount, 10);
    assert.equal(migrated.opSubCount, 10);
    assert.equal(migrated.opMulEnabled, false);
    assert.equal(migrated.opDivEnabled, false);
  });

  test("defaults opAdd/opSub to enabled when absent from the legacy save", () => {
    const migrated = Rules.migrateOpFields({ target: 10 });
    assert.equal(migrated.opAddEnabled, true);
    assert.equal(migrated.opSubEnabled, true);
  });

  test("does not mutate the original object", () => {
    const raw = { opAdd: true, opSub: true, target: 10 };
    Rules.migrateOpFields(raw);
    assert.equal(raw.opAddEnabled, undefined);
  });

  test("passes through null/undefined", () => {
    assert.equal(Rules.migrateOpFields(null), null);
    assert.equal(Rules.migrateOpFields(undefined), undefined);
  });
});

describe("migrateTimerField", () => {
  test("leaves a save without the legacy timerEnabled field untouched", () => {
    const raw = { timerSeconds: 5 };
    assert.equal(Rules.migrateTimerField(raw), raw);
  });

  test("folds timerEnabled:false into timerSeconds 0", () => {
    const migrated = Rules.migrateTimerField({ timerEnabled: false, timerSeconds: 20 });
    assert.equal(migrated.timerSeconds, 0);
  });

  test("clamps an enabled legacy duration into the 1-10 range", () => {
    assert.equal(Rules.migrateTimerField({ timerEnabled: true, timerSeconds: 30 }).timerSeconds, 10);
    assert.equal(Rules.migrateTimerField({ timerEnabled: true, timerSeconds: 7 }).timerSeconds, 7);
  });

  test("falls back to 5s when enabled with no (or a falsy) duration", () => {
    assert.equal(Rules.migrateTimerField({ timerEnabled: true, timerSeconds: 0 }).timerSeconds, 5);
    assert.equal(Rules.migrateTimerField({ timerEnabled: true }).timerSeconds, 5);
  });

  test("passes through null/undefined", () => {
    assert.equal(Rules.migrateTimerField(null), null);
    assert.equal(Rules.migrateTimerField(undefined), undefined);
  });
});

describe("migrateLegacyFields", () => {
  test("applies both op and timer migrations together", () => {
    const migrated = Rules.migrateLegacyFields({ opAdd: true, opSub: true, target: 10, timerEnabled: true, timerSeconds: 30 });
    assert.equal(migrated.opAddEnabled, true);
    assert.equal(migrated.timerSeconds, 10);
  });
});

describe("randInt", () => {
  test("stays within the inclusive [min, max] range", () => {
    for (let i = 0; i < 200; i++) {
      const n = Rules.randInt(3, 7);
      assert.ok(n >= 3 && n <= 7, `${n} out of range`);
      assert.equal(Number.isInteger(n), true);
    }
  });

  test("supports a single-value range", () => {
    for (let i = 0; i < 20; i++) assert.equal(Rules.randInt(4, 4), 4);
  });
});

describe("shuffleArray", () => {
  test("returns the same array instance, shuffled in place", () => {
    const arr = [1, 2, 3, 4, 5];
    const result = Rules.shuffleArray(arr);
    assert.equal(result, arr);
  });

  test("keeps the same elements (a permutation, nothing added or lost)", () => {
    const arr = [1, 2, 3, 4, 5];
    Rules.shuffleArray(arr);
    assert.deepEqual([...arr].sort(), [1, 2, 3, 4, 5]);
  });
});

describe("genNumbersForOp", () => {
  test("+ never exceeds the 'tot' max and result is a + b", () => {
    for (let i = 0; i < 200; i++) {
      const { a, b, result } = Rules.genNumbersForOp("+", 10);
      assert.ok(a >= 0 && b >= 0 && a + b <= 10);
      assert.equal(result, a + b);
    }
  });

  test("- never goes negative (b <= a) and result is a - b", () => {
    for (let i = 0; i < 200; i++) {
      const { a, b, result } = Rules.genNumbersForOp("-", 10);
      assert.ok(b <= a);
      assert.equal(result, a - b);
    }
  });

  test("× caps 'a' at the tot max and 'b' at 10 (tafel van 1-10)", () => {
    for (let i = 0; i < 200; i++) {
      const { a, b, result } = Rules.genNumbersForOp("×", 5);
      assert.ok(a >= 1 && a <= 5);
      assert.ok(b >= 1 && b <= 10);
      assert.equal(result, a * b);
    }
  });

  test("÷ caps the divisor at the tot max, quotient 1-10, a = b * result", () => {
    for (let i = 0; i < 200; i++) {
      const { a, b, result } = Rules.genNumbersForOp("÷", 5);
      assert.ok(b >= 1 && b <= 5);
      assert.ok(result >= 1 && result <= 10);
      assert.equal(a, b * result);
    }
  });
});

describe("formatDuration", () => {
  test("formats sub-minute durations as seconds", () => {
    assert.equal(Rules.formatDuration(45000), "45s");
  });

  test("formats minute-plus durations as Xm Ys", () => {
    assert.equal(Rules.formatDuration(90000), "1m 30s");
  });

  test("rounds to the nearest second", () => {
    assert.equal(Rules.formatDuration(1400), "1s");
    assert.equal(Rules.formatDuration(1600), "2s");
  });
});
