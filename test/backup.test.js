"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const Backup = require("../backup.js");

const card = (over) => Object.assign({ op: "+", a: 1, b: 2, result: 3, box: 1, mastered: false }, over);
const run = (ts, extra) => Object.assign({ ts, target: 5, log: [{ op: "+", a: 1, b: 2, outcome: "correct" }] }, extra);

describe("lastRuns", () => {
  test("keeps only the newest 10, oldest first", () => {
    const history = [];
    for (let i = 1; i <= 15; i++) history.push(run(i * 100));
    const out = Backup.lastRuns(history);
    assert.equal(out.length, 10);
    assert.equal(out[0].ts, 600);
    assert.equal(out[9].ts, 1500);
  });

  test("sorts by ts even when stored out of order", () => {
    const out = Backup.lastRuns([run(300), run(100), run(200)]);
    assert.deepEqual(out.map((r) => r.ts), [100, 200, 300]);
  });

  test("strips the IndexedDB _id without mutating the input", () => {
    const input = [run(1, { _id: 7 })];
    const out = Backup.lastRuns(input);
    assert.equal("_id" in out[0], false);
    assert.equal(input[0]._id, 7);
  });

  test("fewer than the limit are all kept; empty/undefined give []", () => {
    assert.equal(Backup.lastRuns([run(1), run(2)]).length, 2);
    assert.deepEqual(Backup.lastRuns([]), []);
    assert.deepEqual(Backup.lastRuns(undefined), []);
  });

  test("exactly 10 are all kept (boundary)", () => {
    const history = [];
    for (let i = 1; i <= 10; i++) history.push(run(i));
    assert.equal(Backup.lastRuns(history).length, 10);
  });

  test("entries without a numeric ts count as oldest", () => {
    const history = [run(5), { target: 1 }];
    const out = Backup.lastRuns(history, 1);
    assert.equal(out[0].ts, 5);
  });

  test("keeps the per-opgave log", () => {
    assert.equal(Backup.lastRuns([run(1)])[0].log.length, 1);
  });
});

describe("buildBackup", () => {
  test("holds state, cards, trimmed history and an ISO timestamp", () => {
    const b = Backup.buildBackup({ timerSeconds: 10 }, { "+:1:2": card() }, [run(1), run(2)], 0);
    assert.equal(b.app, "rekenraket");
    assert.equal(b.version, 1);
    assert.equal(b.exportedAt, "1970-01-01T00:00:00.000Z");
    assert.deepEqual(b.state, { timerSeconds: 10 });
    assert.equal(Object.keys(b.leitnerCards).length, 1);
    assert.equal(b.history.length, 2);
  });

  test("defaults now when omitted", () => {
    assert.doesNotThrow(() => Backup.buildBackup({}, {}, []));
  });
});

describe("logboek (export only)", () => {
  const lines = ["2026-01-01T00:00:00.000Z question  5+3=x"];

  test("buildBackup includes the readable lines; defaults to []", () => {
    assert.deepEqual(Backup.buildBackup({}, {}, [], 0, lines).logboek, lines);
    assert.deepEqual(Backup.buildBackup({}, {}, [], 0).logboek, []);
  });

  test("parseBackup never returns the logboek, so import cannot load it", () => {
    const r = Backup.parseBackup(JSON.stringify(Backup.buildBackup({}, {}, [], 0, lines)));
    assert.equal(r.ok, true);
    assert.equal("logboek" in r.backup, false);
    assert.equal("events" in r.backup, false);
  });

  test("a malformed logboek doesn't block an import", () => {
    const b = Backup.buildBackup({}, {}, [], 0, lines);
    b.logboek = "garbage";
    assert.equal(Backup.parseBackup(JSON.stringify(b)).ok, true);
  });
});

describe("backupFilename", () => {
  test("includes the date", () => {
    assert.equal(Backup.backupFilename(Date.UTC(2026, 8, 20, 12)), "rekenraket-backup-2026-09-20.json");
  });
});

describe("parseBackup", () => {
  const good = () => Backup.buildBackup({ timerSeconds: 10 }, { "+:1:2": card() }, [run(1)], 0);
  const text = (o) => JSON.stringify(o);

  test("round-trips an export", () => {
    const r = Backup.parseBackup(text(good()));
    assert.equal(r.ok, true);
    assert.deepEqual(r.backup.state, { timerSeconds: 10 });
    assert.equal(r.backup.leitnerCards["+:1:2"].box, 1);
    assert.equal(r.backup.history.length, 1);
  });

  test("accepts a mastered card and an empty card map/history", () => {
    const b = good();
    b.leitnerCards = { "+:1:2": card({ mastered: true, box: 3 }) };
    b.history = [];
    assert.equal(Backup.parseBackup(text(b)).ok, true);
    b.leitnerCards = {};
    assert.equal(Backup.parseBackup(text(b)).ok, true);
  });

  test("re-trims an over-long history on import", () => {
    const b = good();
    b.history = [];
    for (let i = 1; i <= 12; i++) b.history.push(run(i));
    assert.equal(Backup.parseBackup(text(b)).backup.history.length, 10);
  });

  test("rejects non-JSON", () => {
    assert.equal(Backup.parseBackup("not json").ok, false);
    assert.equal(Backup.parseBackup("").ok, false);
  });

  test("rejects JSON that isn't a Rekenraket backup", () => {
    assert.equal(Backup.parseBackup("null").ok, false);
    assert.equal(Backup.parseBackup("[]").ok, false);
    assert.equal(Backup.parseBackup(text({ app: "other", version: 1 })).ok, false);
  });

  test("rejects a newer or missing version", () => {
    const b = good();
    b.version = 2;
    assert.equal(Backup.parseBackup(text(b)).ok, false);
    delete b.version;
    assert.equal(Backup.parseBackup(text(b)).ok, false);
  });

  test("rejects missing/invalid state, cards and history", () => {
    let b = good(); delete b.state;
    assert.equal(Backup.parseBackup(text(b)).ok, false);
    b = good(); b.leitnerCards = [];
    assert.equal(Backup.parseBackup(text(b)).ok, false);
    b = good(); b.history = {};
    assert.equal(Backup.parseBackup(text(b)).ok, false);
    b = good(); b.history = [1];
    assert.equal(Backup.parseBackup(text(b)).ok, false);
  });

  test("rejects a malformed card and names it", () => {
    const b = good();
    b.leitnerCards["+:9:9"] = card({ box: 4 });
    const r = Backup.parseBackup(text(b));
    assert.equal(r.ok, false);
    assert.match(r.error, /\+:9:9/);
    b.leitnerCards = { x: card({ a: "1" }) };
    assert.equal(Backup.parseBackup(text(b)).ok, false);
    b.leitnerCards = { x: null };
    assert.equal(Backup.parseBackup(text(b)).ok, false);
    b.leitnerCards = { x: card({ mastered: undefined }) };
    assert.equal(Backup.parseBackup(text(b)).ok, false);
  });
});
