"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const Version = require("../version.js");
const pkg = require("../package.json");

describe("Version.current", () => {
  test("is a valid MAJOR.MINOR.PATCH version", () => {
    assert.ok(Version.isValid(Version.current));
  });

  test("equals the version in package.json", () => {
    assert.equal(Version.current, pkg.version);
  });
});

describe("isValid", () => {
  test("accepts plain three-part versions", () => {
    assert.equal(Version.isValid("0.1.0"), true);
    assert.equal(Version.isValid("12.0.345"), true);
  });

  test("rejects anything else", () => {
    ["1.0", "1.0.0.0", "v1.0.0", "01.0.0", "1.0.x", "", null, undefined, 1].forEach((v) => {
      assert.equal(Version.isValid(v), false, String(v));
    });
  });
});

describe("label", () => {
  test("prefixes a valid version with v, defaulting to the current one", () => {
    assert.equal(Version.label("2.3.4"), "v2.3.4");
    assert.equal(Version.label(), "v" + Version.current);
  });

  test("is empty for an invalid version", () => {
    assert.equal(Version.label("nope"), "");
    assert.equal(Version.label(null), "");
  });
});
