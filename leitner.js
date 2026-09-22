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

  /* How many days until `box` is next due -- 0 means "due today" (matches
     boxDueToday). Box 1 is always due, so it's always 0; anything that
     isn't a real box (mastered has no due day) also gets 0, which callers
     treat as "nothing to announce" rather than as a real due date. */
  function daysUntilDue(box, day){
    if(day === undefined) day = epochDay();
    var interval = box === 2 ? 3 : box === 3 ? 5 : null;
    if(interval === null) return 0;
    var rem = day % interval;
    return rem === 0 ? 0 : interval - rem;
  }

  /* The stat-tile label for box 2/3 (see index.html's leitner panel and
     settings tiles): blank when there's nothing to say -- due today, or
     not a box with a due-day rhythm at all -- "(voor morgen!)" for
     tomorrow specifically, and "(in N dagen)" further out. Box 1 and
     "mastered" are never passed here; their tiles never carry this label. */
  function dueInLabel(box, day){
    var days = daysUntilDue(box, day);
    if(days === 0) return "";
    if(days === 1) return "(voor morgen!)";
    return "(in " + days + " dagen)";
  }

  /* Was `box` due on any day after `sinceDay`, up to and including `day`?
     This is what makes skipped days catch up: if a child skips the day box
     2 was due, that due day is still "unanswered" on the next day they
     practice, so the card shows up then (together with everything else
     they missed). Closed form: box 2/3 are due on multiples of 3/5, so
     one fell in (sinceDay, day] exactly when the multiple-count grew. */
  function boxDueSince(box, sinceDay, day){
    if(day === undefined) day = epochDay();
    if(box === 1) return day > sinceDay;
    var interval = box === 2 ? 3 : box === 3 ? 5 : null;
    if(interval === null) return false;
    return Math.floor(day / interval) > Math.floor(sinceDay / interval);
  }

  /* A card already answered today (right, wrong, or timed out -- see
     promoteCard/demoteCard, which always stamp lastSeenDay) stays out of
     today's queue even if it's still sitting in box 1 and box 1 is "due
     every day". Otherwise a wrong answer (which keeps a card in box 1) or
     a same-day refresh would put it right back in front of the child
     again today; it's only due again on a future day's reeks.
     A card is due when its box's due day came up since the card was last
     seen -- so due days the child skipped are carried over to the next day
     they practice, however many days that is. A card with no lastSeenDay
     (never seen, or manually moved into box 1) only counts today's
     rhythm; see moveCard. */
  function cardDueToday(card, day){
    if(day === undefined) day = epochDay();
    if(card.mastered || card.lastSeenDay === day) return false;
    var since = typeof card.lastSeenDay === "number" ? card.lastSeenDay : day - 1;
    return boxDueSince(card.box, since, day);
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
     was attempted today regardless.
     A card already seen today never promotes again: a card can turn up
     more than once in a day (e.g. as an extra opgave), and each correct
     answer used to move it another box -- 1 -> 2 -> 3 -> mastered in one
     sitting. One promotion per card per day. */
  function promoteCard(card, fast, day){
    if(day === undefined) day = epochDay();
    var seenToday = card.lastSeenDay === day;
    card.lastSeenDay = day;
    if(fast && !seenToday){
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

  /* A manual move (from the box detail screen) re-schedules the card
     under its NEW box's rhythm.
     Into box 1: lastSeenDay is cleared, so the card is due today (box 1 is
     due every day) -- also when it was already answered today.
     Into box 2/3: lastSeenDay = today, so the card is NOT due today and
     next comes up on the box's next due day (the next multiple of 3/5, see
     boxDueSince). Without the stamp a card moved out of box 1 was still
     due today whenever today happened to be one of the new box's days. */
  function moveCard(card, newBox, day){
    if(day === undefined) day = epochDay();
    card.box = newBox;
    card.mastered = false;
    if(newBox === 1) delete card.lastSeenDay;
    else card.lastSeenDay = day;
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

  /* The one place that decides what "a new day started" resets on the
     app's round-tracking state. Bundled into a single function instead of
     inline resets scattered at each call site, because that's exactly how
     a previous bug happened: `correct`/`streak` got reset for the new day
     but `roundMistakes`/`roundTimeouts`/`roundLongestStreak`/`roundStartTs`
     were forgotten, so today's mistakes silently accumulated on top of
     yesterday's leftover tally. Returns true when a rollover happened
     (state was mutated), false when `day` still matches `state.leitnerDay`
     and nothing changed. */
  function rolloverIfNewDay(state, day){
    if(day === undefined) day = epochDay();
    if(state.leitnerDay === day) return false;
    state.leitnerDay = day;
    state.correct = 0;
    state.streak = 0;
    state.roundStartTs = Date.now();
    state.roundMistakes = 0;
    state.roundTimeouts = 0;
    state.roundLongestStreak = 0;
    state.roundLog = [];
    return true;
  }

  /* Bulk version of moveCard for the box detail screen: every card
     currently shown in the `tab` view ("1"/"2"/"3"/"mastered") goes to
     `newBox`. Returns the moved {id, card} entries so the caller can
     persist exactly those. Moving a tab's cards into the box they're
     already in is a no-op (returns []). */
  function moveAllInView(cards, tab, newBox, day){
    if(String(newBox) === tab) return [];
    var entries = cardsInView(cards, tab);
    entries.forEach(function(e){ moveCard(e.card, newBox, day); });
    return entries;
  }

  /* cardsInView/moveAllInView hand out {id, card}; the store's putAll
     wants {id, record}. */
  function toRecordEntries(entries){
    return entries.map(function(e){ return { id: e.id, record: e.card }; });
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

  /* Vrij oefenen: which boxes can be drilled, in display order. */
  var PRACTICE_BOXES = ["1", "2", "3", "mastered"];

  /* Whatever was stored/passed -> only known boxes, each once, in display
     order. Anything that isn't an array yields []. */
  function normalizePracticeBoxes(boxes){
    if(!Array.isArray(boxes)) return [];
    return PRACTICE_BOXES.filter(function(b){ return boxes.indexOf(b) !== -1; });
  }

  /* What's preselected in the picker: box 1 (the original behaviour) when
     it has cards, otherwise the first box that does, otherwise nothing.
     `counts` is countBoxes' result. */
  function defaultPracticeBoxes(counts){
    if(counts && counts[1] > 0) return ["1"];
    var first = PRACTICE_BOXES.filter(function(b){ return counts && counts[b] > 0; })[0];
    return first ? [first] : [];
  }

  /* Picker chip press: flips `box` in `selected`. Unknown boxes and boxes
     without cards can't be selected (they can still be deselected, in case
     they emptied since). Returns a new normalized array. */
  function togglePracticeBox(selected, box, counts){
    var current = normalizePracticeBoxes(selected);
    if(PRACTICE_BOXES.indexOf(box) === -1) return current;
    if(current.indexOf(box) !== -1) return current.filter(function(b){ return b !== box; });
    if(!(counts && counts[box] > 0)) return current;
    return normalizePracticeBoxes(current.concat(box));
  }

  /* The opgave entries a Vrij oefenen round draws from: every card in each
     chosen box (unknown boxes ignored), shaped like buildOpQueue's entries.
     Unshuffled -- the caller shuffles. */
  function practiceEntries(cards, boxes){
    var out = [];
    normalizePracticeBoxes(boxes).forEach(function(box){
      cardsInView(cards, box).forEach(function(e){
        out.push({ op: e.card.op, a: e.card.a, b: e.card.b, result: e.card.result, cardId: e.id });
      });
    });
    return out;
  }

  function cardLabel(card){
    return card.a + " " + card.op + " " + card.b + " = " + card.result;
  }

  /* Every {id, card} for one operation symbol that's due today -- the
     query both pickEntryForOp (classic-mode-shaped overflow draws) and
     buildOpQueue (the day's full Leitner workload) run per enabled op. */
  function dueCardsForOp(cards, opSymbol, day, excludeIds){
    if(day === undefined) day = epochDay();
    var result = [];
    Object.keys(cards).forEach(function(id){
      var c = cards[id];
      if(excludeIds && excludeIds.has(id)) return;
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

  /* Cards to add to box 1 without disturbing anything that already
     exists -- e.g. after widening an op's "tot" range, or (re-)enabling
     an op that has no cards yet. `cards` is the app's current
     leitnerCards map; `opDefs` is the same [{symbol, max}, ...] shape
     buildSeedEntries takes, for whichever ops are enabled NOW. Only
     combos with no existing card (any box, mastered or not) come back;
     an existing card's box/mastered/lastSeenDay is never touched, so
     narrowing the range back down and widening it again doesn't reset
     progress on the combos that were always in range. Narrowing itself
     removes nothing -- combos outside the new, smaller range just keep
     whatever box they were already in. */
  function missingSeedEntries(cards, opDefs){
    return buildSeedEntries(opDefs).filter(function(e){
      return !cards[e.id];
    });
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
            /* A record that was once stored as undefined would crash every
               consumer; leave such an entry out. */
            if(cursor.value) result[cursor.key] = cursor.value;
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
    boxDueSince: boxDueSince,
    daysUntilDue: daysUntilDue,
    dueInLabel: dueInLabel,
    cardDueToday: cardDueToday,
    rolloverIfNewDay: rolloverIfNewDay,
    cardId: cardId,
    allCombosForOp: allCombosForOp,
    promoteCard: promoteCard,
    demoteCard: demoteCard,
    scoreAttempt: scoreAttempt,
    moveCard: moveCard,
    moveAllInView: moveAllInView,
    toRecordEntries: toRecordEntries,
    countBoxes: countBoxes,
    cardsInView: cardsInView,
    PRACTICE_BOXES: PRACTICE_BOXES,
    normalizePracticeBoxes: normalizePracticeBoxes,
    defaultPracticeBoxes: defaultPracticeBoxes,
    togglePracticeBox: togglePracticeBox,
    practiceEntries: practiceEntries,
    cardLabel: cardLabel,
    dueCardsForOp: dueCardsForOp,
    buildSeedEntries: buildSeedEntries,
    missingSeedEntries: missingSeedEntries,
    createStore: createStore
  };
});
