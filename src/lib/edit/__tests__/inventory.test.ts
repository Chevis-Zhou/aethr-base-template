import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyEdit,
  buildInventory,
  CHANGE_PRICE_CENTS,
  isFreePath,
  type FieldInventory,
  type InventoryField,
  type LockedControl,
} from "@/lib/edit";
import { allSectionsSpec, makeSpec, P } from "./fixture";

/** Every field in the inventory, flattened — the UI walks groups, a test should not. */
function allFields(inventory: FieldInventory): InventoryField[] {
  return [
    ...inventory.site.fields,
    ...inventory.pages.flatMap((page) => page.groups.flatMap((group) => group.fields)),
  ];
}

function allLocked(inventory: FieldInventory): LockedControl[] {
  return [
    ...inventory.locked,
    ...inventory.pages.flatMap((page) => [
      ...page.locked,
      ...page.groups.flatMap((group) => group.locked),
    ]),
  ];
}

describe("buildInventory", () => {
  it("declares which reader produced it", () => {
    assert.equal(buildInventory(makeSpec(), "acme").kind, "spec");
  });

  it("carries the slug it was built for", () => {
    assert.equal(buildInventory(makeSpec(), "acme").slug, "acme");
  });

  it("emits a group per section", () => {
    const inventory = buildInventory(makeSpec(), "acme");
    assert.equal(inventory.pages.length, 1);
    assert.equal(inventory.pages[0].groups.length, 4);
  });

  // The editor UI never sees a SiteSpec, so this is the only place the free half is named.
  it("emits the free leaves and never a paid one", () => {
    const ids = allFields(buildInventory(makeSpec(), "acme")).map((f) => f.id);
    assert.ok(ids.includes(P.headline));
    assert.ok(!ids.includes(P.ctaHref));
    assert.ok(!ids.includes(P.primaryHue));
  });

  it("carries the current value, not a placeholder", () => {
    const field = allFields(buildInventory(makeSpec(), "acme")).find((f) => f.id === P.headline);
    assert.equal(field?.value, "Original headline");
  });

  it("classifies the rich-text leaves as richtext and plain prose as text", () => {
    const fields = allFields(buildInventory(makeSpec(), "acme"));
    assert.equal(fields.find((f) => f.id === P.story)?.kind, "richtext");
    assert.equal(fields.find((f) => f.id === P.headline)?.kind, "text");
  });

  it("points an image field at the sibling that becomes its alt", () => {
    const field = allFields(buildInventory(makeSpec(), "acme")).find((f) => f.id === P.founderImage);
    assert.equal(field?.kind, "image");
    assert.equal(field?.constraints.altPath, P.founderName);
  });
});

describe("buildInventory — across every section type", () => {
  // Run against the repo's own `_all-sections.json` rather than a hand-written spec, so a
  // fifteenth section type is covered on the day its schema ships.
  const inventory = buildInventory(allSectionsSpec(), "all");

  it("covers all fourteen section types", () => {
    assert.equal(inventory.pages[0].groups.length, 14);
  });

  it("emits at least one editable field for every section", () => {
    for (const group of inventory.pages[0].groups) {
      assert.ok(group.fields.length > 0, `${group.id} emitted no fields`);
    }
  });

  // The invariant the whole partition rests on: `buildInventory` emits the free half and
  // `isFreePath` is the same rule as a predicate, enforced server-side. The two drifting
  // apart is a paid field rendered as editable — exactly the defect these tests exist for.
  it("emits nothing that isFreePath would reject", () => {
    for (const field of allFields(inventory)) {
      assert.ok(isFreePath(field.id), `inventory emitted a paid path: ${field.id}`);
    }
  });

  it("prices every locked control off the standing table", () => {
    const locked = allLocked(inventory);
    assert.ok(locked.length > 0);
    for (const control of locked) {
      assert.equal(control.priceCents, CHANGE_PRICE_CENTS[control.klass]);
    }
  });

  it("names a target on every locked control, so the change ticket can say what it is about", () => {
    for (const control of allLocked(inventory)) {
      assert.ok(control.target.length > 0, `${control.action} has no target`);
    }
  });
});

describe("isFreePath", () => {
  for (const path of [P.ctaHref, P.primaryHue, P.pageSlug, "nav[0].href", ""]) {
    it(`holds ${path || "(empty)"} on the paid side`, () => {
      assert.equal(isFreePath(path), false);
    });
  }
});

describe("CHANGE_PRICE_CENTS", () => {
  it("is the standing $100 / $300 table", () => {
    assert.deepEqual(CHANGE_PRICE_CENTS, { minor: 10_000, major: 30_000 });
  });
});

describe("the alt-sibling rule, read half vs write half", () => {
  /*
   * `spec-adapter.ts` and `apply.ts` each hold their own copy of the image → alt-sibling
   * map. They are identical today and nothing keeps them that way: the reader advertising a
   * constraint the writer does not enforce is a publishable image with no alt (QA check 7),
   * and the writer enforcing one the reader never showed is a save that fails for a reason
   * the client cannot see.
   *
   * Asserted through the interface rather than by comparing the two constants, because
   * neither is exported and a test that reached for them would be testing past the seam.
   */
  it("blocks a write to every image field the inventory gave an altPath", () => {
    const images = allFields(buildInventory(allSectionsSpec(), "all")).filter(
      (field) => field.kind === "image" && field.constraints.altPath,
    );
    assert.ok(images.length > 0, "fixture emitted no image fields with an altPath");

    for (const image of images) {
      const altPath = image.constraints.altPath!;
      const blanked = applyEdit(allSectionsSpec(), { op: "set", path: altPath, value: "" });
      assert.ok(blanked.ok, `could not blank ${altPath}`);

      const written = applyEdit(blanked.spec, { op: "set", path: image.id, value: "/new.jpg" });
      assert.ok(!written.ok, `${image.id} saved while ${altPath} was blank`);
      assert.equal(written.failure.reason, "alt-required", image.id);
    }
  });
});
