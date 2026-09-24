import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyEdit, applyEdits, getAtPath, type ApplyResult, type EditOp } from "@/lib/edit";
import { makeSpec, P } from "./fixture";

/** Narrows the result so a failed expectation reports the failure, not `undefined`. */
function ok(result: ApplyResult) {
  assert.ok(result.ok, result.ok ? "" : `${result.failure.reason}: ${result.failure.message}`);
  return result.spec;
}

function failure(result: ApplyResult) {
  assert.ok(!result.ok, "expected a failure, got ok");
  return result.failure;
}

describe("applyEdit — the free half", () => {
  it("writes a free text leaf", () => {
    const spec = ok(applyEdit(makeSpec(), { op: "set", path: P.headline, value: "New" }));
    assert.equal(getAtPath(spec, P.headline), "New");
  });

  it("does not mutate the spec it was given", () => {
    const original = makeSpec();
    applyEdit(original, { op: "set", path: P.headline, value: "New" });
    assert.equal(getAtPath(original, P.headline), "Original headline");
  });

  it("writes contact details the client owns", () => {
    const spec = ok(applyEdit(makeSpec(), { op: "set", path: P.clientEmail, value: "new@acme.test" }));
    assert.equal(getAtPath(spec, P.clientEmail), "new@acme.test");
  });

  // A string-list control posts one entry per line; the document stores an array.
  it("splits a string-list leaf on newlines and drops blank entries", () => {
    const spec = ok(
      applyEdit(makeSpec(), { op: "set", path: P.projectTags, value: "one\n\n two \nthree" }),
    );
    assert.deepEqual(getAtPath(spec, P.projectTags), ["one", "two", "three"]);
  });

  it("sanitizes a rich-text leaf on write, not only at render", () => {
    const spec = ok(
      applyEdit(makeSpec(), {
        op: "set",
        path: P.story,
        value: '<p>Safe</p><script>alert("x")</script>',
      }),
    );
    assert.ok(!String(getAtPath(spec, P.story)).includes("<script"));
  });
});

describe("applyEdit — the paid half", () => {
  // The price list IS the partition. These paths are re-checked server-side because a POST
  // does not have to come from the editor.
  for (const [label, path, value] of [
    ["a link target", P.ctaHref, "/elsewhere"],
    ["a design token", P.primaryHue, "0"],
    ["a page slug", P.pageSlug, "/home"],
  ] as const) {
    it(`refuses ${label} as forbidden`, () => {
      assert.equal(failure(applyEdit(makeSpec(), { op: "set", path, value })).reason, "forbidden");
    });
  }

  it("reports a free path that names nothing as missing", () => {
    const f = failure(
      applyEdit(makeSpec(), { op: "set", path: "pages[0].sections[9].props.headline", value: "x" }),
    );
    assert.equal(f.reason, "missing");
  });
});

describe("applyEdit — accessibility floor", () => {
  it("blocks an image upload while its alt sibling is blank", () => {
    const f = failure(applyEdit(makeSpec(), { op: "set", path: P.founderImage, value: "/f.jpg" }));
    assert.equal(f.reason, "alt-required");
    assert.match(f.message, /founder name/i);
  });

  it("allows the upload once the alt sibling is filled", () => {
    const spec = ok(
      applyEdits(makeSpec(), [
        { op: "set", path: P.founderName, value: "Ada" },
        { op: "set", path: P.founderImage, value: "/f.jpg" },
      ]),
    );
    assert.equal(getAtPath(spec, P.founderImage), "/f.jpg");
  });

  it("still allows clearing an image while the alt sibling is blank", () => {
    const spec = ok(applyEdit(makeSpec(), { op: "set", path: P.founderImage, value: "" }));
    assert.equal(getAtPath(spec, P.founderImage), "");
  });
});

describe("applyEdit — lists", () => {
  it("appends a blank item shaped like its sibling", () => {
    const spec = ok(applyEdit(makeSpec(), { op: "list-add", path: P.services }));
    assert.deepEqual(getAtPath(spec, P.services), [
      { title: "Only service", description: "The one item." },
      { title: "", description: "" },
    ]);
  });

  // The >=1 floor: an empty list is the headed-but-empty section, caught here rather than
  // at the publish gate.
  it("refuses to remove the last item", () => {
    const f = failure(applyEdit(makeSpec(), { op: "list-remove", path: P.services, index: 0 }));
    assert.equal(f.reason, "floor");
  });

  it("removes an item once the list is above the floor", () => {
    const spec = ok(
      applyEdits(makeSpec(), [
        { op: "list-add", path: P.services },
        { op: "list-remove", path: P.services, index: 0 },
      ]),
    );
    assert.deepEqual(getAtPath(spec, P.services), [{ title: "", description: "" }]);
  });

  it("reports an out-of-range index as missing", () => {
    const f = failure(
      applyEdits(makeSpec(), [
        { op: "list-add", path: P.services },
        { op: "list-remove", path: P.services, index: 7 },
      ]),
    );
    assert.equal(f.reason, "missing");
  });
});

describe("applyEdits — batching", () => {
  it("applies operations in order", () => {
    const spec = ok(
      applyEdits(makeSpec(), [
        { op: "set", path: P.headline, value: "First" },
        { op: "set", path: P.headline, value: "Second" },
      ]),
    );
    assert.equal(getAtPath(spec, P.headline), "Second");
  });

  // Stopping at the first failure is what keeps a partial write off disk.
  it("stops at the first failure and discards the batch", () => {
    const edits: EditOp[] = [
      { op: "set", path: P.headline, value: "Applied" },
      { op: "set", path: P.ctaHref, value: "/elsewhere" },
      { op: "set", path: P.serviceTitle, value: "Never reached" },
    ];
    assert.equal(failure(applyEdits(makeSpec(), edits)).path, P.ctaHref);
  });
});
