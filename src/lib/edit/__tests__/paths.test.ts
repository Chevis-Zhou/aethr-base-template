import assert from "node:assert/strict";
import { describe, it } from "node:test";

// The seam. Every test in this folder imports from here and never from a sibling file —
// if a behaviour cannot be reached through the barrel, it is not part of the interface.
import { formatPath, getAtPath, parsePath, setAtPath } from "@/lib/edit";
import { makeSpec, P } from "./fixture";

describe("parsePath", () => {
  it("splits dotted names and bracketed indices, typing indices as numbers", () => {
    assert.deepEqual(parsePath("a.b[0].c"), ["a", "b", 0, "c"]);
  });

  it("returns an empty token list for an empty path", () => {
    assert.deepEqual(parsePath(""), []);
  });

  it("round-trips through formatPath", () => {
    const path = "pages[0].sections[2].props.services[1].title";
    assert.equal(formatPath(parsePath(path)), path);
  });
});

describe("getAtPath", () => {
  it("reads through objects and arrays", () => {
    assert.equal(getAtPath(makeSpec(), P.serviceTitle), "Only service");
  });

  it("returns undefined rather than throwing when the path names nothing", () => {
    assert.equal(getAtPath(makeSpec(), "pages[0].sections[9].props.headline"), undefined);
  });
});

describe("setAtPath", () => {
  it("writes into a container that already exists", () => {
    const spec = makeSpec();
    setAtPath(spec, P.headline, "Changed");
    assert.equal(getAtPath(spec, P.headline), "Changed");
  });

  // The partition rule, stated as a test: the editor may change values, never invent
  // structure. A missing parent is a violation dressed as a typo.
  it("refuses to create a missing parent", () => {
    assert.throws(
      () => setAtPath(makeSpec(), "pages[0].sections[9].props.headline", "x"),
      /refusing to create one/,
    );
  });

  it("rejects an empty path", () => {
    assert.throws(() => setAtPath(makeSpec(), "", "x"), /Empty path/);
  });
});
