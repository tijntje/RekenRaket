/* The logboek: a chronological event log of what happened in the game --
   pure, DOM-free, shared between the app (index.html, as the global
   `EventLog`) and the Node test suite (test/eventlog.test.js). It builds,
   trims and formats plain event objects; keeping them in memory, saving
   them to IndexedDB and printing them to the console is index.html's job.
   The point is being able to reconstruct afterwards, without guessing,
   why a card ended up in a box: every scoring decision records the card
   before and after, the answer that was given, and what the rules made of
   it. */
(function(root, factory){
  if(typeof module === "object" && module.exports){
    module.exports = factory();
  } else {
    root.EventLog = factory();
  }
})(typeof self !== "undefined" ? self : this, function(){
  "use strict";

  var RUN_START = "run_start";
  var MAX_RUNS = 10;
  var MAX_EVENTS = 3000;

  /* `type` and `ts` always win over same-named keys in `data`. */
  function makeEvent(type, data, now){
    if(now === undefined) now = Date.now();
    var e = {};
    Object.keys(data || {}).forEach(function(k){ e[k] = data[k]; });
    e.ts = now;
    e.type = type;
    return e;
  }

  /* What a card looked like at one moment (null when there is no card:
     classic mode, or Vrij oefenen). */
  function cardSnapshot(card){
    if(!card) return null;
    return {
      box: card.box,
      mastered: !!card.mastered,
      lastSeenDay: typeof card.lastSeenDay === "number" ? card.lastSeenDay : null
    };
  }

  /* One scoring decision (an answer or a timeout on an opgave).
     `before`/`after` are cardSnapshots taken around the rule call, so
     the box move -- or the absence of one, and why -- is explicit. */
  function scoreEvent(p){
    return {
      kind: p.kind,
      sum: p.sum,
      cardId: p.cardId || null,
      given: p.given === undefined ? null : p.given,
      correct: !!p.correct,
      alreadyFaulted: !!p.alreadyFaulted,
      newMistake: !!p.verdict.isNewMistake,
      faulted: !!p.verdict.faulted,
      freePractice: !!p.freePractice,
      before: p.before,
      after: p.after,
      ms: p.ms
    };
  }

  /* Keep events from the last `maxRuns` runs (a run starts at every
     "run_start" event; anything before the first run_start counts as part
     of the first run), then hard-cap at the newest `maxEvents`. Returns
     a new array. */
  function trimEvents(events, maxRuns, maxEvents){
    if(maxRuns === undefined) maxRuns = MAX_RUNS;
    if(maxEvents === undefined) maxEvents = MAX_EVENTS;
    var list = events || [];
    var starts = [];
    list.forEach(function(e, i){ if(e && e.type === RUN_START) starts.push(i); });
    var from = 0;
    if(starts.length > maxRuns) from = starts[starts.length - maxRuns];
    var kept = list.slice(from);
    return kept.slice(Math.max(0, kept.length - maxEvents));
  }

  /* An opgave the way a child would read it: "5+3=x" when the result is
     asked for, "5+x=8" / "x+3=8" when a term is. `unknown` defaults to
     "result". */
  function sumText(o){
    var u = o.unknown || "result";
    return (u === "a" ? "x" : o.a) + o.op + (u === "b" ? "x" : o.b) + "=" + (u === "result" ? "x" : o.result);
  }

  /* The opgave with its answer filled in ("5+3=8"), for lists where no
     unknown has been chosen yet (the planned queue). */
  function fullSumText(o){
    return o.a + o.op + o.b + "=" + o.result;
  }

  /* Settings = everything on `state` that isn't per-round progress. */
  var PROGRESS_KEYS = ["correct", "streak", "target", "roundTarget", "roundStartTs",
    "roundMistakes", "roundTimeouts", "roundLongestStreak", "roundLog", "leitnerDay"];

  function settingsSnapshot(state){
    var out = {};
    Object.keys(state || {}).forEach(function(k){
      if(PROGRESS_KEYS.indexOf(k) === -1) out[k] = state[k];
    });
    return out;
  }

  /* What changed between two settings snapshots: { key: [old, new] }, or
     null when nothing did. */
  function diffSettings(prev, next){
    var changes = {};
    var any = false;
    var keys = Object.keys(prev || {});
    Object.keys(next || {}).forEach(function(k){ if(keys.indexOf(k) === -1) keys.push(k); });
    keys.forEach(function(k){
      var a = prev ? prev[k] : undefined;
      var b = next ? next[k] : undefined;
      if(JSON.stringify(a) !== JSON.stringify(b)){ changes[k] = [a === undefined ? null : a, b === undefined ? null : b]; any = true; }
    });
    return any ? changes : null;
  }

  function formatValue(v){
    if(Array.isArray(v) && v.every(function(x){ return x === null || typeof x !== "object"; })){
      return "[" + v.join(", ") + "]";
    }
    if(v !== null && typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  function seen(d){ return d === null || d === undefined ? "-" : d; }

  function cardText(snap){
    if(!snap) return "no card";
    return (snap.mastered ? "mastered" : "box " + snap.box) + ", seen " + seen(snap.lastSeenDay);
  }

  function moveText(before, after){
    if(!before || !after) return "no card";
    var from = before.mastered ? "mastered" : "box " + before.box;
    var to = after.mastered ? "mastered" : "box " + after.box;
    var text = from === to ? from + " (unchanged)" : from + " -> " + to;
    return text + ", seen " + seen(before.lastSeenDay) + " -> " + seen(after.lastSeenDay);
  }

  function generic(e){
    return Object.keys(e)
      .filter(function(k){ return k !== "ts" && k !== "type"; })
      .map(function(k){ return k + "=" + formatValue(e[k]); })
      .join(" ");
  }

  function describe(e){
    switch(e.type){
      case "question":
        return e.sum + "  card=" + (e.cardId || "none") + " (" + cardText(e.card) + ")" +
          "  progress " + e.correct + "/" + e.target + " streak " + e.streak +
          "  timer " + (e.timerSeconds > 0 ? e.timerSeconds + "s" : "off") +
          "  " + e.source + ", " + e.queueLeft + " left" +
          (e.freePractice ? "  FREE PRACTICE" : "");
      case "score":
        var verdict = e.kind === "timeout" ? "TIMEOUT" : (e.correct ? "CORRECT" : "WRONG");
        var note = e.newMistake ? " [first fault -> back to box 1]"
          : (e.alreadyFaulted ? " [already faulted: no change]" : "");
        return e.sum + "  " + e.kind + (e.kind === "answer" ? " given=" + e.given : "") +
          " -> " + verdict + note + "  " + moveText(e.before, e.after) +
          "  after " + e.ms + "ms" + (e.freePractice ? "  FREE PRACTICE" : "");
      case "late_answer":
        return e.sum + "  given=" + e.given + " -> " + (e.correct ? "right but late" : "wrong") + " (logged as " + e.loggedAs + ")";
      case "settings_change":
        return Object.keys(e.changes).map(function(k){
          return k + ": " + formatValue(e.changes[k][0]) + " -> " + formatValue(e.changes[k][1]);
        }).join(", ");
      default:
        return generic(e);
    }
  }

  /* One readable line per event: "<ISO time> <type>  <description>". */
  function formatEvent(e){
    var text = describe(e);
    var time = typeof e.ts === "number" ? new Date(e.ts).toISOString() + " " : "";
    return time + e.type + (text ? "  " + text : "");
  }

  return {
    RUN_START: RUN_START,
    MAX_RUNS: MAX_RUNS,
    MAX_EVENTS: MAX_EVENTS,
    makeEvent: makeEvent,
    cardSnapshot: cardSnapshot,
    scoreEvent: scoreEvent,
    trimEvents: trimEvents,
    sumText: sumText,
    fullSumText: fullSumText,
    settingsSnapshot: settingsSnapshot,
    diffSettings: diffSettings,
    formatEvent: formatEvent
  };
});
