"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const EventLog = require("../eventlog.js");

describe("makeEvent", () => {
  test("adds ts and type to the data", () => {
    assert.deepEqual(EventLog.makeEvent("x", { a: 1 }, 5), { a: 1, ts: 5, type: "x" });
  });

  test("ts and type win over same-named data keys", () => {
    const e = EventLog.makeEvent("real", { type: "fake", ts: 1 }, 9);
    assert.equal(e.type, "real");
    assert.equal(e.ts, 9);
  });

  test("works without data and defaults now", () => {
    const e = EventLog.makeEvent("x");
    assert.equal(e.type, "x");
    assert.equal(typeof e.ts, "number");
  });
});

describe("cardSnapshot", () => {
  test("captures box, mastered and lastSeenDay", () => {
    assert.deepEqual(EventLog.cardSnapshot({ box: 2, mastered: false, lastSeenDay: 7 }),
      { box: 2, mastered: false, lastSeenDay: 7 });
  });

  test("a never-seen card has lastSeenDay null; mastered is a boolean", () => {
    assert.deepEqual(EventLog.cardSnapshot({ box: 3 }), { box: 3, mastered: false, lastSeenDay: null });
  });

  test("no card gives null", () => {
    assert.equal(EventLog.cardSnapshot(null), null);
    assert.equal(EventLog.cardSnapshot(undefined), null);
  });

  test("is a copy, not a live reference", () => {
    const card = { box: 1, mastered: false };
    const snap = EventLog.cardSnapshot(card);
    card.box = 2;
    assert.equal(snap.box, 1);
  });
});

describe("scoreEvent", () => {
  const before = { box: 1, mastered: false, lastSeenDay: null };
  const after = { box: 2, mastered: false, lastSeenDay: 5 };

  test("records the answer, the verdict and the card before/after", () => {
    const e = EventLog.scoreEvent({
      kind: "answer", sum: "1+2=x", cardId: "+:1:2", given: 3, correct: true, alreadyFaulted: false,
      verdict: { faulted: false, isNewMistake: false }, before, after, ms: 800
    });
    assert.equal(e.kind, "answer");
    assert.equal(e.sum, "1+2=x");
    assert.equal(e.cardId, "+:1:2");
    assert.equal(e.given, 3);
    assert.equal(e.correct, true);
    assert.equal(e.newMistake, false);
    assert.equal(e.freePractice, false);
    assert.deepEqual(e.before, before);
    assert.deepEqual(e.after, after);
    assert.equal(e.ms, 800);
  });

  test("a timeout has no given answer; a new mistake is flagged", () => {
    const e = EventLog.scoreEvent({
      kind: "timeout", cardId: "+:1:2", correct: false, alreadyFaulted: false,
      verdict: { faulted: true, isNewMistake: true }, before, after: before, ms: 10000
    });
    assert.equal(e.given, null);
    assert.equal(e.newMistake, true);
    assert.equal(e.faulted, true);
  });

  test("no card (classic / free practice) keeps null snapshots and cardId", () => {
    const e = EventLog.scoreEvent({
      kind: "answer", correct: true, freePractice: true,
      verdict: { faulted: false, isNewMistake: false }, before: null, after: null, ms: 1
    });
    assert.equal(e.cardId, null);
    assert.equal(e.before, null);
    assert.equal(e.freePractice, true);
  });

  test("a wrong given answer of 0 is kept, not turned into null", () => {
    const e = EventLog.scoreEvent({
      kind: "answer", cardId: "x", given: 0, correct: false,
      verdict: { faulted: true, isNewMistake: true }, before, after: before, ms: 1
    });
    assert.equal(e.given, 0);
  });
});

describe("trimEvents", () => {
  const run = () => ({ type: "run_start" });
  const q = (i) => ({ type: "question", i });

  test("keeps everything when there are at most maxRuns runs", () => {
    const events = [run(), q(1), run(), q(2)];
    assert.equal(EventLog.trimEvents(events, 2).length, 4);
  });

  test("drops events before the run that is maxRuns from the end", () => {
    const events = [q(0), run(), q(1), run(), q(2), run(), q(3)];
    const out = EventLog.trimEvents(events, 2);
    assert.deepEqual(out.map((e) => e.i), [undefined, 2, undefined, 3]);
    assert.equal(out[0].type, "run_start");
    assert.equal(out.length, 4);
  });

  test("events before the first run_start are kept while runs fit", () => {
    const out = EventLog.trimEvents([q(0), run(), q(1)], 5);
    assert.equal(out.length, 3);
  });

  test("hard-caps at the newest maxEvents", () => {
    const events = [run()];
    for (let i = 1; i <= 10; i++) events.push(q(i));
    const out = EventLog.trimEvents(events, 10, 4);
    assert.deepEqual(out.map((e) => e.i), [7, 8, 9, 10]);
  });

  test("does not mutate the input; handles empty/undefined", () => {
    const events = [run(), run(), run()];
    EventLog.trimEvents(events, 1);
    assert.equal(events.length, 3);
    assert.deepEqual(EventLog.trimEvents([], 1), []);
    assert.deepEqual(EventLog.trimEvents(undefined), []);
  });

  test("defaults are 10 runs", () => {
    const events = [];
    for (let i = 0; i < 12; i++) events.push(run(), q(i));
    const out = EventLog.trimEvents(events);
    assert.equal(out.filter((e) => e.type === "run_start").length, 10);
  });
});

describe("sumText / fullSumText", () => {
  const o = { op: "+", a: 5, b: 3, result: 8 };

  test("unknown result: 5+3=x (also the default)", () => {
    assert.equal(EventLog.sumText(Object.assign({ unknown: "result" }, o)), "5+3=x");
    assert.equal(EventLog.sumText(o), "5+3=x");
  });

  test("unknown a or b: x+3=8 / 5+x=8", () => {
    assert.equal(EventLog.sumText(Object.assign({ unknown: "a" }, o)), "x+3=8");
    assert.equal(EventLog.sumText(Object.assign({ unknown: "b" }, o)), "5+x=8");
  });

  test("works for every operator and zero", () => {
    assert.equal(EventLog.sumText({ op: "÷", a: 6, b: 2, result: 3 }), "6÷2=x");
    assert.equal(EventLog.sumText({ op: "×", a: 0, b: 2, result: 0, unknown: "a" }), "x×2=0");
    assert.equal(EventLog.sumText({ op: "-", a: 5, b: 0, result: 5, unknown: "b" }), "5-x=5");
  });

  test("fullSumText fills the answer in", () => {
    assert.equal(EventLog.fullSumText(o), "5+3=8");
  });
});

describe("settingsSnapshot / diffSettings", () => {
  test("snapshot drops per-round progress but keeps settings", () => {
    const snap = EventLog.settingsSnapshot({ timerSeconds: 10, correct: 4, roundLog: [1], leitnerDay: 9, leitnerBatchSize: 15 });
    assert.deepEqual(snap, { timerSeconds: 10, leitnerBatchSize: 15 });
  });

  test("snapshot is a copy", () => {
    const state = { timerSeconds: 10 };
    const snap = EventLog.settingsSnapshot(state);
    state.timerSeconds = 5;
    assert.equal(snap.timerSeconds, 10);
  });

  test("no change gives null", () => {
    assert.equal(EventLog.diffSettings({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] }), null);
    assert.equal(EventLog.diffSettings({}, {}), null);
  });

  test("reports changed keys as [old, new], including added/removed keys", () => {
    const d = EventLog.diffSettings({ a: 1, gone: 2 }, { a: 2, added: 3 });
    assert.deepEqual(d, { a: [1, 2], gone: [2, null], added: [null, 3] });
  });

  test("detects a change inside an array/object value", () => {
    assert.deepEqual(EventLog.diffSettings({ x: [1] }, { x: [2] }), { x: [[1], [2]] });
  });

  test("handles null/undefined inputs", () => {
    assert.equal(EventLog.diffSettings(null, undefined), null);
    assert.deepEqual(EventLog.diffSettings(undefined, { a: 1 }), { a: [null, 1] });
  });
});

describe("formatEvent", () => {
  const t = Date.UTC(2026, 0, 1, 12, 0, 1, 250);
  const iso = "2026-01-01T12:00:01.250Z";
  const snap = (box, seen, mastered) => ({ box, mastered: !!mastered, lastSeenDay: seen });

  test("question: readable sum, card state, progress, timer and source", () => {
    const e = EventLog.makeEvent("question", {
      sum: "5+3=x", cardId: "+:5:3", card: snap(1, null), correct: 2, target: 20, streak: 2,
      timerSeconds: 10, source: "queue", queueLeft: 17, freePractice: false
    }, t);
    assert.equal(EventLog.formatEvent(e),
      iso + " question  5+3=x  card=+:5:3 (box 1, seen -)  progress 2/20 streak 2  timer 10s  queue, 17 left");
  });

  test("question: timer off and free practice are shown", () => {
    const e = EventLog.makeEvent("question", {
      sum: "5+x=8", cardId: null, card: null, correct: 0, target: 5, streak: 0,
      timerSeconds: 0, source: "extra", queueLeft: 0, freePractice: true
    }, t);
    const line = EventLog.formatEvent(e);
    assert.match(line, /5\+x=8 {2}card=none \(no card\)/);
    assert.match(line, /timer off/);
    assert.match(line, /extra, 0 left/);
    assert.match(line, /FREE PRACTICE$/);
  });

  test("score: a correct answer that promotes", () => {
    const e = EventLog.makeEvent("score", EventLog.scoreEvent({
      kind: "answer", sum: "5+3=x", cardId: "+:5:3", given: 8, correct: true, alreadyFaulted: false,
      verdict: { faulted: false, isNewMistake: false }, before: snap(1, null), after: snap(2, 20716), ms: 800
    }), t);
    assert.equal(EventLog.formatEvent(e),
      iso + " score  5+3=x  answer given=8 -> CORRECT  box 1 -> box 2, seen - -> 20716  after 800ms");
  });

  test("score: a first wrong answer is flagged as the fault", () => {
    const e = EventLog.makeEvent("score", EventLog.scoreEvent({
      kind: "answer", sum: "5+3=x", cardId: "+:5:3", given: 7, correct: false, alreadyFaulted: false,
      verdict: { faulted: true, isNewMistake: true }, before: snap(2, 20715), after: snap(1, 20716), ms: 500
    }), t);
    const line = EventLog.formatEvent(e);
    assert.match(line, /given=7 -> WRONG \[first fault -> back to box 1\]/);
    assert.match(line, /box 2 -> box 1/);
  });

  test("score: an answer after an earlier fault says no change", () => {
    const e = EventLog.makeEvent("score", EventLog.scoreEvent({
      kind: "answer", sum: "5+3=x", cardId: "x", given: 8, correct: true, alreadyFaulted: true,
      verdict: { faulted: true, isNewMistake: false }, before: snap(1, 20716), after: snap(1, 20716), ms: 900
    }), t);
    const line = EventLog.formatEvent(e);
    assert.match(line, /CORRECT \[already faulted: no change\]/);
    assert.match(line, /box 1 \(unchanged\)/);
  });

  test("score: a timeout has no given; mastery and no-card are worded", () => {
    const timeout = EventLog.makeEvent("score", EventLog.scoreEvent({
      kind: "timeout", sum: "5+3=x", cardId: "x", correct: false, alreadyFaulted: false,
      verdict: { faulted: true, isNewMistake: true }, before: snap(3, 1), after: snap(1, 2), ms: 10000
    }), t);
    assert.match(EventLog.formatEvent(timeout), /timeout -> TIMEOUT/);
    assert.doesNotMatch(EventLog.formatEvent(timeout), /given=/);
    const mastered = EventLog.makeEvent("score", EventLog.scoreEvent({
      kind: "answer", sum: "5+3=x", cardId: "x", given: 8, correct: true, alreadyFaulted: false,
      verdict: { faulted: false, isNewMistake: false }, before: snap(3, 1), after: snap(3, 2, true), ms: 1
    }), t);
    assert.match(EventLog.formatEvent(mastered), /box 3 -> mastered/);
    const none = EventLog.makeEvent("score", EventLog.scoreEvent({
      kind: "answer", sum: "5+3=x", correct: true, freePractice: true,
      verdict: { faulted: false, isNewMistake: false }, before: null, after: null, ms: 1
    }), t);
    assert.match(EventLog.formatEvent(none), /no card {2}after 1ms {2}FREE PRACTICE$/);
  });

  test("late_answer", () => {
    const e = EventLog.makeEvent("late_answer", { sum: "5+3=x", given: 8, correct: true, loggedAs: "late" }, t);
    assert.equal(EventLog.formatEvent(e), iso + " late_answer  5+3=x  given=8 -> right but late (logged as late)");
  });

  test("settings_change lists old -> new per key", () => {
    const e = EventLog.makeEvent("settings_change", { changes: { timerSeconds: [10, 5], mixedFormats: [false, true] } }, t);
    assert.equal(EventLog.formatEvent(e), iso + " settings_change  timerSeconds: 10 -> 5, mixedFormats: false -> true");
  });

  test("other events: key=value pairs, arrays of strings listed, objects as JSON, null shown", () => {
    const e = EventLog.makeEvent("queue", { count: 2, sums: ["5+3=8", "1+1=2"], extra: { a: 1 }, none: null }, t);
    assert.equal(EventLog.formatEvent(e), iso + " queue  count=2 sums=[5+3=8, 1+1=2] extra={\"a\":1} none=null");
  });

  test("free-practice queue and practice_picker events show the chosen boxes and counts", () => {
    const q = EventLog.makeEvent("queue", { mode: "free_practice", count: 3, sums: ["1+1=2"], boxes: ["1", "mastered"] }, t);
    assert.equal(EventLog.formatEvent(q), iso + " queue  mode=free_practice count=3 sums=[1+1=2] boxes=[1, mastered]");
    const p = EventLog.makeEvent("practice_picker", { counts: { 1: 2, mastered: 0 }, selected: ["1"] }, t);
    assert.equal(EventLog.formatEvent(p), iso + " practice_picker  counts={\"1\":2,\"mastered\":0} selected=[1]");
  });

  test("leitnerPracticeBoxes is a setting, so settings_change logs picker changes", () => {
    const diff = EventLog.diffSettings(
      EventLog.settingsSnapshot({ leitnerPracticeBoxes: ["1"], correct: 1 }),
      EventLog.settingsSnapshot({ leitnerPracticeBoxes: ["1", "2"], correct: 2 }));
    assert.deepEqual(diff, { leitnerPracticeBoxes: [["1"], ["1", "2"]] });
  });

  test("an event with no data is just time and type", () => {
    assert.equal(EventLog.formatEvent(EventLog.makeEvent("session_start", {}, 0)), "1970-01-01T00:00:00.000Z session_start");
  });
});
