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

  var current = "0.5.0";

  /* Every released version, newest first -- shown when the version at the
     bottom of Instellingen is tapped. Each entry: { version, changes: [...] }
     with short Dutch sentences. Add the new entry at the TOP in the same
     pass as every version bump (test/version.test.js checks that the top
     entry is `current` and that the list is complete and in order). */
  var changelog = [
    { version: "0.5.0", changes: ["Nieuw: bij Leitner een kleiner \"tot\"-bereik kiezen vraagt bij het sluiten van Instellingen of de opgaven die daardoor buiten bereik vallen verwijderd mogen worden uit de dozen."] },
    { version: "0.4.1", changes: ["Fix: bij Leitner een groter \"tot\"-bereik kiezen (of een nieuwe soort opgave aanzetten) voegt de nieuwe opgaven nu meteen toe aan doos 1, in plaats van dat er niets verandert."] },
    { version: "0.4.0", changes: ["Nieuw: tik op het versienummer onderaan Instellingen om alle wijzigingen per versie te zien."] },
    { version: "0.3.5", changes: ["Vrij oefenen: laatste keuze heet nu \"Gemasterd\", net als in de rest van de app."] },
    { version: "0.3.4", changes: ["Overal in de app heet het nu \"doos\" in plaats van \"box\"."] },
    { version: "0.3.3", changes: [
      "Fix: alles in een doos tegelijk verplaatsen bewaarde de kaarten verkeerd, waardoor de app na herladen crashte.",
      "Kaarten zonder geldige opslag worden bij het laden overgeslagen in plaats van de app te laten crashen."
    ] },
    { version: "0.3.2", changes: ["Fix: na het verplaatsen van kaarten tussen dozen wordt de reeks van vandaag opnieuw opgebouwd, zodat het aantal opgaven klopt."] },
    { version: "0.3.1", changes: [
      "Een kaart die uit doos 1 wordt verplaatst, volgt het schema van de nieuwe doos en is vandaag niet meer aan de beurt.",
      "Vrij oefenen: kies zelf welke dozen je wilt oefenen (doos 1, 2, 3 en/of gemasterd)."
    ] },
    { version: "0.2.0", changes: ["Sommige instellingen zijn verborgen zolang Leitner actief is."] },
    { version: "0.1.0", changes: ["Versienummer toegevoegd."] }
  ];

  function isValid(v){
    return typeof v === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v);
  }

  /* What the settings screen shows: "v0.1.0". */
  function label(v){
    if(v === undefined) v = current;
    return isValid(v) ? "v" + v : "";
  }

  return { current: current, changelog: changelog, isValid: isValid, label: label };
});
