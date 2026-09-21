/* The app's version number -- pure, DOM-free, shared between the app
   (index.html, as the global `Version`) and the Node test suite
   (test/version.test.js). Semantic versioning, MAJOR.MINOR.PATCH:
     PATCH  a bug fix or wording tweak; nothing new for the child.
     MINOR  new functionality: a feature, setting, rule or screen.
     MAJOR  a change that can break stored data: a new IndexedDB layout,
            a settings migration that can't be undone, a backup format
            that older exports can no longer be imported into.
   Bump `current` here in the same commit as the change, and keep
   package.json's "version" equal to it (test/version.test.js checks). */
(function(root, factory){
  if(typeof module === "object" && module.exports){
    module.exports = factory();
  } else {
    root.Version = factory();
  }
})(typeof self !== "undefined" ? self : this, function(){
  "use strict";

  var current = "0.3.4";

  function isValid(v){
    return typeof v === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v);
  }

  /* What the settings screen shows: "v0.1.0". */
  function label(v){
    if(v === undefined) v = current;
    return isValid(v) ? "v" + v : "";
  }

  return { current: current, isValid: isValid, label: label };
});
