/* Leitner spaced-repetition rules engine -- pure, DOM-free business logic
   shared between the app (index.html, as the global `Leitner`) and the
   Node test suite (test/leitner.test.js, via require()). It knows nothing
   about IndexedDB, `state`, or the DOM: every function takes the data it
   needs as arguments and returns/mutates plain objects. index.html owns
   the `leitnerCards` map itself and the persistence/UI refresh around
   these calls. */
(function(root, factory){
  if(typeof module === "object" && module.exports){
    module.exports = factory();
  } else {
    root.Leitner = factory();
  }
})(typeof self !== "undefined" ? self : this, function(){
  "use strict";

  /* Box 1 is reviewed every day; box 2 every 3rd day (together with box 1);
     box 3 every 5th day (together with box 1). A fixed day-index (days
     since epoch) keeps the rhythm without needing a stored "day zero" per
     user. */
  function epochDay(){ return Math.floor(Date.now() / 86400000); }

  function boxDueToday(box, day){
    if(day === undefined) day = epochDay();
    if(box === 1) return true;
    if(box === 2) return day % 3 === 0;
    if(box === 3) return day % 5 === 0;
    return false;
  }

  /* A card already answered today (right, wrong, or timed out -- see
     promoteCard/demoteCard, which always stamp lastSeenDay) stays out of
     today's queue even if it's still sitting in box 1 and box 1 is "due
     every day". Otherwise a wrong answer (which keeps a card in box 1) or
     a same-day refresh would put it right back in front of the child
     again today; it's only due again on a future day's reeks. */
  function cardDueToday(card, day){
    if(day === undefined) day = epochDay();
    return !card.mastered && boxDueToday(card.box, day) && card.lastSeenDay !== day;
  }

  function cardId(op, a, b){ return op + ":" + a + ":" + b; }

  /* All valid (a,b) pairs for an op under its "tot" limit, mirroring the
     ranges the app's sum generator draws from. Used to seed box 1 in full
     on reset, so Leitner mode never has to invent new cards afterwards --
     it only ever shuffles this fixed set between boxes. */
  function allCombosForOp(op, max){
    var combos = [];
    var a, b;
    if(op === "+"){
      for(a = 0; a <= max; a++){
        for(b = 0; b <= max - a; b++) combos.push({ a: a, b: b, result: a + b });
      }
    } else if(op === "-"){
      for(a = 0; a <= max; a++){
        for(b = 0; b <= a; b++) combos.push({ a: a, b: b, result: a - b });
      }
    } else if(op === "×"){
      for(a = 1; a <= max; a++){
        for(b = 1; b <= 10; b++) combos.push({ a: a, b: b, result: a * b });
      }
    } else { // "÷"
      for(b = 1; b <= max; b++){
        for(var q = 1; q <= 10; q++) combos.push({ a: b * q, b: b, result: q });
      }
    }
    return combos;
  }

  /* A correct answer only promotes a card when the caller marks it
     `fast` (index.html decides that by whether the per-opgave timer, if
     any, had already run out -- see promoteLeitnerCard); an answer that
     doesn't qualify leaves the card in its current box, for every box
     transition. Either way, lastSeenDay always gets stamped -- the card
     was attempted today regardless. */
  function promoteCard(card, fast, day){
    if(day === undefined) day = epochDay();
    card.lastSeenDay = day;
    if(fast){
      if(card.box === 1){ card.box = 2; }
      else if(card.box === 2){ card.box = 3; }
      else if(card.box === 3){ card.mastered = true; }
    }
    return card;
  }

  function demoteCard(card, day){
    if(day === undefined) day = epochDay();
    card.box = 1;
    card.mastered = false;
    card.lastSeenDay = day;
    return card;
  }

  /* A manual move (from the box detail screen) is a deliberate
     re-categorization, not "already practiced today" -- lastSeenDay gets
     cleared so the card is immediately live for its new box, instead of
     skipping the rest of today because the OLD box/attempt had already
     marked it seen. */
  function moveCard(card, newBox){
    card.box = newBox;
    card.mastered = false;
    delete card.lastSeenDay;
    return card;
  }

  /* One opgave can involve several submissions before it's answered right
     (retries) or the timer runs out. Only the FIRST fault -- a wrong
     answer or a timeout, whichever comes first -- changes anything: it
     demotes the card (if there is one) and is the one mistake counted for
     that opgave. Everything after that -- further wrong tries, or the
     eventual correct answer -- is just the child working it out for their
     own learning: no extra demotions, no extra mistakes, and no promotion
     (an opgave that ever faulted doesn't promote its card just because it
     was eventually answered right). `card` may be null/undefined (classic
     mode has no Leitner card for a given opgave); the fault/mistake
     bookkeeping works the same either way, it just skips the box move.
     Callers keep the returned `faulted` as the opgave's running state
     (index.html's current.faulted) and use `isNewMistake` to decide
     whether to bump their own mistake counters. */
  function scoreAttempt(card, alreadyFaulted, correct, fast, day){
    if(alreadyFaulted) return { faulted: true, isNewMistake: false };
    if(correct){
      if(card) promoteCard(card, fast, day);
      return { faulted: false, isNewMistake: false };
    }
    if(card) demoteCard(card, day);
    return { faulted: true, isNewMistake: true };
  }

  function countBoxes(cards){
    var counts = { 1: 0, 2: 0, 3: 0, mastered: 0 };
    Object.keys(cards).forEach(function(id){
      var c = cards[id];
      if(c.mastered) counts.mastered++;
      else counts[c.box] = (counts[c.box] || 0) + 1;
    });
    return counts;
  }

  /* Every {id, card} in `cards` sitting in box `tab` ("1"/"2"/"3"), or
     every mastered card when tab is "mastered" -- sorted by op, then a,
     then b, for a stable, readable list. */
  function cardsInView(cards, tab){
    var list = [];
    Object.keys(cards).forEach(function(id){
      var c = cards[id];
      var inView = tab === "mastered" ? c.mastered : (!c.mastered && String(c.box) === tab);
      if(inView) list.push({ id: id, card: c });
    });
    list.sort(function(x, y){
      if(x.card.op !== y.card.op) return x.card.op < y.card.op ? -1 : 1;
      if(x.card.a !== y.card.a) return x.card.a - y.card.a;
      return x.card.b - y.card.b;
    });
    return list;
  }

  function cardLabel(card){
    return card.a + " " + card.op + " " + card.b + " = " + card.result;
  }

  /* Every {id, card} for one operation symbol that's due today -- the
     query both pickEntryForOp (classic-mode-shaped overflow draws) and
     buildOpQueue (the day's full Leitner workload) run per enabled op. */
  function dueCardsForOp(cards, opSymbol, day){
    if(day === undefined) day = epochDay();
    var result = [];
    Object.keys(cards).forEach(function(id){
      var c = cards[id];
      if(c.op === opSymbol && cardDueToday(c, day)) result.push({ id: id, card: c });
    });
    return result;
  }

  /* Box 1, seeded in full: every {id, record} for every enabled op's
     complete combination set, each starting fresh in box 1. `opDefs` is
     [{symbol, max}, ...] -- just the two things this needs from the
     app's OP_DEFS/state, so this stays free of any app-specific shape. */
  function buildSeedEntries(opDefs){
    var entries = [];
    opDefs.forEach(function(def){
      allCombosForOp(def.symbol, def.max).forEach(function(c){
        var id = cardId(def.symbol, c.a, c.b);
        entries.push({
          id: id,
          record: { op: def.symbol, a: c.a, b: c.b, result: c.result, box: 1, mastered: false }
        });
      });
    });
    return entries;
  }

  /* A tiny IndexedDB CRUD wrapper around one object store, kept here so
     it can be exercised in tests against a fake `getDb` instead of real
     IndexedDB. `getDb` must return a Promise of a db with the standard
     `transaction(storeName, mode).objectStore(storeName)` API; failures
     (no IndexedDB, a closed/blocked connection, ...) are swallowed the
     same way the app already treated persistence as best-effort. */
  function createStore(getDb, storeName){
    function put(id, record){
      return getDb().then(function(db){
        db.transaction(storeName, "readwrite").objectStore(storeName).put(record, id);
      }).catch(function(){});
    }
    function putAll(entries){
      return getDb().then(function(db){
        var store = db.transaction(storeName, "readwrite").objectStore(storeName);
        entries.forEach(function(e){ store.put(e.record, e.id); });
      }).catch(function(){});
    }
    function clear(){
      return getDb().then(function(db){
        db.transaction(storeName, "readwrite").objectStore(storeName).clear();
      }).catch(function(){});
    }
    function loadAll(callback){
      return getDb().then(function(db){
        var store = db.transaction(storeName, "readonly").objectStore(storeName);
        var result = {};
        var req = store.openCursor();
        req.onsuccess = function(e){
          var cursor = e.target.result;
          if(cursor){
            result[cursor.key] = cursor.value;
            cursor.continue();
          } else {
            callback(result);
          }
        };
        req.onerror = function(){ callback({}); };
      }).catch(function(){ callback({}); });
    }
    return { put: put, putAll: putAll, clear: clear, loadAll: loadAll };
  }

  return {
    epochDay: epochDay,
    boxDueToday: boxDueToday,
    cardDueToday: cardDueToday,
    cardId: cardId,
    allCombosForOp: allCombosForOp,
    promoteCard: promoteCard,
    demoteCard: demoteCard,
    scoreAttempt: scoreAttempt,
    moveCard: moveCard,
    countBoxes: countBoxes,
    cardsInView: cardsInView,
    cardLabel: cardLabel,
    dueCardsForOp: dueCardsForOp,
    buildSeedEntries: buildSeedEntries,
    createStore: createStore
  };
});
