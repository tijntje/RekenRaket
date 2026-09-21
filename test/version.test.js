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

describe("changelog", () => {
  const cmp = (a, b) => {
    const x = a.split(".").map(Number), y = b.split(".").map(Number);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  };

  test("starts with the current version, so a bump without an entry fails", () => {
    assert.equal(Version.changelog[0].version, Version.current);
  });

  test("lists valid, unique versions from newest to oldest", () => {
    const versions = Version.changelog.map((e) => e.version);
    versions.forEach((v) => assert.ok(Version.isValid(v), v));
    assert.equal(new Set(versions).size, versions.length);
    for (let i = 1; i < versions.length; i++) {
      assert.ok(cmp(versions[i - 1], versions[i]) > 0, versions[i - 1] + " before " + versions[i]);
    }
  });

  test("every entry has at least one non-empty change", () => {
    Version.changelog.forEach((e) => {
      assert.ok(Array.isArray(e.changes) && e.changes.length > 0, e.version);
      e.changes.forEach((c) => assert.ok(typeof c === "string" && c.trim() !== "", e.version));
    });
  });

  test("keeps the very first version, 0.1.0, as its last entry", () => {
    assert.equal(Version.changelog[Version.changelog.length - 1].version, "0.1.0");
  });
});
