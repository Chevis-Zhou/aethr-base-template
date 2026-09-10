import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateWranglerConfig,
  hostnamesToPreserve,
  missingHostnames,
  previewHostname,
  routesFor,
  type DeployTarget,
} from "./wrangler-config";

const staging: DeployTarget = {
  slug: "acme",
  stage: "staging",
  contactEmail: "hello@acme.test",
  compatibilityDate: "2026-09-02",
};

const production: DeployTarget = {
  ...staging,
  stage: "production",
  domain: "acme.test",
};

describe("hostnamesToPreserve", () => {
  it("drops the preview host and keeps everything else", () => {
    assert.deepEqual(
      hostnamesToPreserve("acme", [
        previewHostname("acme"),
        "acme.test",
        "www.acme.test",
      ]),
      ["acme.test", "www.acme.test"],
    );
  });

  it("returns empty when only the preview host is attached", () => {
    assert.deepEqual(hostnamesToPreserve("acme", [previewHostname("acme")]), []);
  });

  it("dedupes and skips blanks", () => {
    assert.deepEqual(
      hostnamesToPreserve("acme", ["acme.test", "", "acme.test", "www.acme.test"]),
      ["acme.test", "www.acme.test"],
    );
  });
});

describe("routesFor", () => {
  it("staging is preview only", () => {
    assert.deepEqual(routesFor(staging), [previewHostname("acme")]);
  });

  it("staging with extras keeps production hosts — the 027 defect", () => {
    assert.deepEqual(
      routesFor({ ...staging, extraHostnames: ["acme.test", "www.acme.test"] }),
      [previewHostname("acme"), "acme.test", "www.acme.test"],
    );
  });

  it("production lists preview + apex + www", () => {
    assert.deepEqual(routesFor(production), [
      previewHostname("acme"),
      "acme.test",
      "www.acme.test",
    ]);
  });

  it("does not duplicate a hostname already in the stage set", () => {
    assert.deepEqual(
      routesFor({ ...production, extraHostnames: ["acme.test", "shop.acme.test"] }),
      [previewHostname("acme"), "acme.test", "www.acme.test", "shop.acme.test"],
    );
  });
});

describe("missingHostnames", () => {
  it("names absent hosts", () => {
    assert.deepEqual(
      missingHostnames(
        [previewHostname("acme"), "acme.test", "www.acme.test"],
        [previewHostname("acme")],
      ),
      ["acme.test", "www.acme.test"],
    );
  });

  it("returns empty when every expected host is attached", () => {
    const expected = routesFor(production);
    assert.deepEqual(missingHostnames(expected, expected), []);
  });
});

describe("generateWranglerConfig", () => {
  it("staging with extras emits the production custom domains", () => {
    const json = generateWranglerConfig({
      ...staging,
      extraHostnames: ["acme.test", "www.acme.test"],
    });
    const parsed = JSON.parse(json.slice(json.indexOf("{"))) as {
      routes: Array<{ pattern: string; custom_domain: boolean }>;
    };
    assert.deepEqual(
      parsed.routes.map((r) => r.pattern),
      [previewHostname("acme"), "acme.test", "www.acme.test"],
    );
    assert.ok(parsed.routes.every((r) => r.custom_domain));
  });
});
