/* Export/import of the whole game -- pure, DOM-free, shared between the
   app (index.html, as the global `Backup`) and the Node test suite
   (test/backup.test.js, via require()). It only builds/validates plain
   objects and JSON text; reading the real state/IndexedDB and triggering
   downloads stays in index.html. The file serves two purposes: moving a
   game to another machine, and pasting it into a bug report, so it holds
   the full settings, every Leitner card and the last HISTORY_LIMIT runs
   (with their per-opgave logs). */
(function(root, factory){
  if(typeof module === "object" && module.exports){
    module.exports = factory();
  } else {
    root.Backup = factory();
  }
})(typeof self !== "undefined" ? self : this, function(){
  "use strict";

  var APP = "rekenraket";
  var VERSION = 1;
  var HISTORY_LIMIT = 10;

  /* The newest `limit` runs, oldest first, without the IndexedDB `_id`
     (auto-increment keys are meaningless on another machine; the import
     assigns fresh ones). Entries without a numeric ts sort as oldest. */
  function lastRuns(history, limit){
    if(limit === undefined) limit = HISTORY_LIMIT;
    var runs = (history || [])
      .map(function(h, i){ return { h: h, i: i }; })
      .sort(function(x, y){
        var dx = typeof x.h.ts === "number" ? x.h.ts : -Infinity;
        var dy = typeof y.h.ts === "number" ? y.h.ts : -Infinity;
        return dx !== dy ? (dx < dy ? -1 : 1) : x.i - y.i;
      })
      .map(function(x){
        var copy = Object.assign({}, x.h);
        delete copy._id;
        return copy;
      });
    return runs.slice(Math.max(0, runs.length - limit));
  }

  /* `logboek` is the readable event log (an array of lines, see
     EventLog.formatEvent). It is export-only, for debugging: parseBackup
     never reads it back, so importing never touches the local logboek. */
  function buildBackup(state, leitnerCards, history, now, logboek){
    if(now === undefined) now = Date.now();
    return {
      app: APP,
      version: VERSION,
      exportedAt: new Date(now).toISOString(),
      state: state,
      leitnerCards: leitnerCards,
      history: lastRuns(history),
      logboek: logboek || []
    };
  }

  function backupFilename(now){
    if(now === undefined) now = Date.now();
    return "rekenraket-backup-" + new Date(now).toISOString().slice(0, 10) + ".json";
  }

  function isPlainObject(v){
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  function validCard(c){
    return isPlainObject(c) &&
      typeof c.op === "string" &&
      typeof c.a === "number" && typeof c.b === "number" && typeof c.result === "number" &&
      (c.box === 1 || c.box === 2 || c.box === 3) &&
      typeof c.mastered === "boolean";
  }

  /* Text -> { ok: true, backup: {state, leitnerCards, history} } or
     { ok: false, error }. Nothing is applied on failure, so a wrong or
     damaged file can never half-overwrite a game: every problem is
     rejected up front with a message for the person importing. */
  function parseBackup(text){
    var data;
    try{ data = JSON.parse(text); }
    catch(e){ return { ok: false, error: "Dit bestand is geen geldige back-up (geen JSON)." }; }
    if(!isPlainObject(data) || data.app !== APP){
      return { ok: false, error: "Dit is geen Rekenraket-back-up." };
    }
    if(typeof data.version !== "number" || data.version > VERSION){
      return { ok: false, error: "Deze back-up komt van een nieuwere versie van de app." };
    }
    if(!isPlainObject(data.state)){
      return { ok: false, error: "De back-up bevat geen instellingen." };
    }
    if(!isPlainObject(data.leitnerCards)){
      return { ok: false, error: "De back-up bevat geen Leitner-kaarten." };
    }
    var ids = Object.keys(data.leitnerCards);
    for(var i = 0; i < ids.length; i++){
      if(!validCard(data.leitnerCards[ids[i]])){
        return { ok: false, error: "Ongeldige Leitner-kaart in de back-up: " + ids[i] };
      }
    }
    if(!Array.isArray(data.history) || !data.history.every(isPlainObject)){
      return { ok: false, error: "De back-up bevat een ongeldige geschiedenis." };
    }
    return {
      ok: true,
      backup: {
        state: data.state,
        leitnerCards: data.leitnerCards,
        history: lastRuns(data.history)
      }
    };
  }

  return {
    HISTORY_LIMIT: HISTORY_LIMIT,
    lastRuns: lastRuns,
    buildBackup: buildBackup,
    backupFilename: backupFilename,
    parseBackup: parseBackup
  };
});
