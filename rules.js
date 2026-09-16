/* Pure, DOM-free app rules -- settings normalization/migration and sum
   generation -- shared between the app (index.html, as the global `Rules`)
   and the Node test suite (test/rules.test.js, via require()). Like
   leitner.js, every function here takes the data it needs as arguments and
   returns a value or a new object; none of it touches `state`, the DOM, or
   randomness sources beyond what's passed in or Math.random. */
(function(root, factory){
  if(typeof module === "object" && module.exports){
    module.exports = factory();
  } else {
    root.Rules = factory();
  }
})(typeof self !== "undefined" ? self : this, function(){
  "use strict";

  /* The "aantal" stepper only allows multiples of 5, clamped 5-60. */
  function normalizeCount(t){
    return Math.min(60, Math.max(5, Math.round(t / 5) * 5));
  }

  /* The round target is the sum of the enabled ops' configured counts (or
     the historic default of 5 if, somehow, nothing is enabled). `opDefs`
     is [{enabledKey, countKey}, ...] -- just the two fields this needs
     from the app's OP_DEFS. */
  function computeTarget(opDefs, s){
    var total = 0;
    opDefs.forEach(function(def){
      if(s[def.enabledKey]) total += s[def.countKey];
    });
    return total > 0 ? total : 5;
  }

  /* Older saves only had opAdd/opSub booleans and one global target;
     translate those into the new per-operation enabled+count fields. A
     bare `{}` (a genuinely fresh install with no legacy save at all, not
     an old-format one) must also be left untouched -- otherwise every
     first open would get force-migrated into "only add/sub enabled",
     silently overriding whatever `defaults` actually says for the other
     ops, since `typeof {}.opAddEnabled` is "undefined" same as real
     legacy data. */
  function migrateOpFields(raw){
    if(!raw || Object.keys(raw).length === 0 || typeof raw.opAddEnabled !== "undefined") return raw;
    var legacyCount = normalizeCount(raw.target || 10);
    var migrated = Object.assign({}, raw);
    migrated.opAddEnabled = raw.opAdd !== undefined ? !!raw.opAdd : true;
    migrated.opSubEnabled = raw.opSub !== undefined ? !!raw.opSub : true;
    migrated.opAddCount = legacyCount;
    migrated.opSubCount = legacyCount;
    migrated.opMulEnabled = false; migrated.opMulCount = 10;
    migrated.opDivEnabled = false; migrated.opDivCount = 10;
    return migrated;
  }

  /* Older saves had an on/off switch plus a 5-30s stepper; the dropdown now
     folds "off" and the duration into a single 0-8 value (0 = "-", off). */
  function migrateTimerField(raw){
    if(!raw || typeof raw.timerEnabled === "undefined") return raw;
    var migrated = Object.assign({}, raw);
    migrated.timerSeconds = raw.timerEnabled ? Math.max(1, Math.min(10, Math.round(raw.timerSeconds || 5))) : 0;
    return migrated;
  }

  function migrateLegacyFields(raw){
    return migrateTimerField(migrateOpFields(raw));
  }

  function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }

  function shuffleArray(arr){
    for(var i = arr.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /* "Tot" limits the number range per soort: for + and - it caps the sum
     resp. the minuend, for x and / it caps the tafel (the factor / divisor
     that's stepped through 1-10) so e.g. "tafels tot 3" only drills tafel
     van 1 t/m 3. `max` is the caller's resolved "tot" setting for this op
     (opMaxFor in index.html). */
  function genNumbersForOp(op, max){
    var a, b;
    if(op === "+"){
      do{ a = randInt(0, max); b = randInt(0, max); } while(a + b > max);
      return { a: a, b: b, result: a + b };
    } else if(op === "-"){
      do{ a = randInt(0, max); b = randInt(0, max); } while(b > a);
      return { a: a, b: b, result: a - b };
    } else if(op === "×"){
      a = randInt(1, max); b = randInt(1, 10);
      return { a: a, b: b, result: a * b };
    } else { // "÷"
      b = randInt(1, max);
      var q = randInt(1, 10);
      return { a: b * q, b: b, result: q };
    }
  }

  /* Ranks a round's logged exercises (see index.html's roundLog) for
     display in the history detail panel: wrong answers first, then
     late-but-eventually-right ones, then plain correct ones -- so the
     entries most worth a second look surface at the top. A stable sort:
     entries within the same outcome keep the order they were actually
     done in, rather than getting shuffled by the sort itself. */
  var ROUND_LOG_OUTCOME_RANK = { wrong: 0, late: 1, correct: 2 };
  function orderRoundLog(log){
    return log
      .map(function(entry, i){ return { entry: entry, i: i }; })
      .sort(function(x, y){
        var rankDiff = ROUND_LOG_OUTCOME_RANK[x.entry.outcome] - ROUND_LOG_OUTCOME_RANK[y.entry.outcome];
        return rankDiff !== 0 ? rankDiff : x.i - y.i;
      })
      .map(function(x){ return x.entry; });
  }

  function formatDuration(ms){
    var sec = Math.round(ms / 1000);
    return sec >= 60 ? Math.floor(sec / 60) + "m " + (sec % 60) + "s" : sec + "s";
  }

  return {
    normalizeCount: normalizeCount,
    computeTarget: computeTarget,
    migrateOpFields: migrateOpFields,
    migrateTimerField: migrateTimerField,
    migrateLegacyFields: migrateLegacyFields,
    randInt: randInt,
    shuffleArray: shuffleArray,
    genNumbersForOp: genNumbersForOp,
    orderRoundLog: orderRoundLog,
    formatDuration: formatDuration
  };
});
