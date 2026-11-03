import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";

import { computeManifest, diffManifest } from "./artifact";
import { buildPolicy, scanHtml, writeHeadersFile } from "./security-headers";
import {
  applyStagingSiteComments,
  assertNoSiteComments,
  pagesWithSiteComments,
  readPortalHost,
  registerStagingLink,
  siteCommentsOrigin,
  siteCommentsTag,
  stripSiteComments,
} from "./site-comments";

const page = (title: string) =>
  `<!DOCTYPE html><html><head><title>${title}</title></head><body><main>${title}</main><script>self.__next_f.push([1,"${title}"])</script></body></html>`;

function build(extra: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-comments-"));
  const files: Record<string, string> = {
    "index.html": page("home"),
    "about/index.html": page("about"),
    "404.html": page("missing"),
    ...extra,
  };
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  writeHeadersFile(dir);
  return dir;
}

const read = (dir: string, rel: string) => fs.readFileSync(path.join(dir, rel), "utf-8");
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
const cspLines = (headers: string) => headers.split("\n").filter((l) => l.includes("Content-Security-Policy:"));

describe("site comments tag", () => {
  it("points at the client's own portal host", () => {
    assert.equal(
      siteCommentsTag({ slug: "acme", portalHost: "app.tasteled.com" }),
      '<script src="https://app.tasteled.com/site-comments/v1.js" data-client="acme" data-aethr-site-comments defer></script>',
    );
    assert.equal(siteCommentsOrigin("portal.aethrdesign.com"), "https://portal.aethrdesign.com");
  });

  it("refuses unknown hosts and invalid slugs", () => {
    assert.throws(() => siteCommentsOrigin("evil.example.com"), /Unknown portal host/);
    assert.throws(() => siteCommentsTag({ slug: "Bad Slug", portalHost: "app.tasteled.com" }), /Invalid slug/);
  });
});

describe("staging build", () => {
  it("adds the tag to every page and grants the portal in connect-src only", () => {
    const dir = build();
    const result = applyStagingSiteComments(dir, { slug: "acme", portalHost: "app.tasteled.com" });
    assert.equal(result.pages, 3);
    for (const file of ["index.html", "about/index.html", "404.html"]) {
      assert.match(read(dir, file), /<script src="https:\/\/app\.tasteled\.com\/site-comments\/v1\.js" data-client="acme"/);
    }

    const headers = read(dir, "_headers");
    for (const line of cspLines(headers)) {
      const csp = line.split("Content-Security-Policy: ")[1];
      assert.ok(directive(csp, "connect-src").includes("https://app.tasteled.com"), csp);
      assert.ok(!directive(csp, "form-action").includes("tasteled"), "form-action stays closed");
    }
    // The page's own script-src names the portal origin because the page scan found the tag.
    const home = headers.split("\n\n").find((block) => block.startsWith("/\n"))!;
    assert.ok(directive(cspLines(home)[0].split("Content-Security-Policy: ")[1], "script-src").includes("https://app.tasteled.com"));
  });

  it("is idempotent and keeps one tag per page", () => {
    const dir = build();
    applyStagingSiteComments(dir, { slug: "acme", portalHost: "portal.aethrdesign.com" });
    applyStagingSiteComments(dir, { slug: "acme", portalHost: "portal.aethrdesign.com" });
    assert.equal(read(dir, "index.html").match(/site-comments\/v1\.js/g)?.length, 1);
  });

  it("leaves editor preview shells alone", () => {
    const dir = build({ "cms-preview/index.html": page("preview") });
    const result = applyStagingSiteComments(dir, { slug: "acme", portalHost: "app.tasteled.com" }, {
      previewFrames: [{ route: "/cms-preview/", editorOrigin: "https://portal.aethrdesign.com" }],
    });
    assert.equal(result.pages, 3);
    assert.ok(!read(dir, "cms-preview/index.html").includes("site-comments"));
  });

  it("fails loudly when no page can take the tag", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-comments-"));
    fs.writeFileSync(path.join(dir, "index.html"), "<html></html>");
    assert.throws(() => applyStagingSiteComments(dir, { slug: "acme", portalHost: "app.tasteled.com" }), /not installed/);
  });
});

describe("production artifact", () => {
  it("never has the tag or the connect-src grant, and the guard enforces it", () => {
    const dir = build();
    assertNoSiteComments(dir);
    assert.deepEqual(pagesWithSiteComments(dir), []);
    const headers = read(dir, "_headers");
    assert.ok(!headers.includes("tasteled.com") && !headers.includes("site-comments"));

    applyStagingSiteComments(dir, { slug: "acme", portalHost: "app.tasteled.com" });
    assert.throws(() => assertNoSiteComments(dir), /staging-only/);
  });

  it("the production policy is unchanged by the staging option", () => {
    const assets = scanHtml("");
    const base = { assets, turnstile: false, connectOrigins: [], frameOrigins: [] };
    assert.equal(buildPolicy(base), buildPolicy({ ...base, siteCommentsOrigin: undefined }));
    assert.ok(buildPolicy({ ...base, siteCommentsOrigin: "https://app.tasteled.com" }).includes("connect-src 'self' https://app.tasteled.com"));
  });

  it("strip restores the exact production bytes, so DEPLOY matches the approved manifest", () => {
    const dir = build();
    const approved = computeManifest(dir, "acme");

    applyStagingSiteComments(dir, { slug: "acme", portalHost: "app.tasteled.com" });
    assert.equal(diffManifest(approved, computeManifest(dir, "acme")).matches, false);

    assert.equal(stripSiteComments(dir), 3);
    writeHeadersFile(dir);
    const drift = diffManifest(approved, computeManifest(dir, "acme"));
    assert.equal(drift.matches, true, JSON.stringify(drift));
    assertNoSiteComments(dir);
  });
});

describe("staging registration", () => {
  const vault = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vault-"));
    fs.mkdirSync(path.join(root, "Business/clients/acme"), { recursive: true });
    return root;
  };
  const state = (root: string, body: string) => fs.writeFileSync(path.join(root, "Business/clients/acme/state.md"), body);
  const stateText = (root: string) => fs.readFileSync(path.join(root, "Business/clients/acme/state.md"), "utf-8");
  const links = "## Links\n\n- Staging URL:\n- Production URL:\n- Repo:\n\n## Next\n- Staging URL: nope\n";

  it("reads portal-host from frontmatter", () => {
    const root = vault();
    state(root, '---\nclient: Acme\nportal-host: "app.tasteled.com"\n---\n');
    assert.equal(readPortalHost("acme", root), "app.tasteled.com");
    state(root, "---\nportal-host: example.com\n---\n");
    assert.equal(readPortalHost("acme", root), undefined);
    assert.equal(readPortalHost("missing", root), undefined);
  });

  it("fills an empty Staging URL in the Links block only", () => {
    const root = vault();
    state(root, `---\n---\n${links}`);
    assert.equal(registerStagingLink("acme", "https://acme-preview.aethrdesign.com", root), "written");
    const text = stateText(root);
    assert.match(text, /- Staging URL: https:\/\/acme-preview\.aethrdesign\.com\n- Production URL:\n/);
    assert.match(text, /## Next\n- Staging URL: nope/);
    assert.equal(registerStagingLink("acme", "https://acme-preview.aethrdesign.com", root), "unchanged");
  });

  it("does not overwrite a link someone wrote, or touch a missing file", () => {
    const root = vault();
    state(root, "## Links\n\n- Staging URL: https://elsewhere.example.com\n");
    assert.equal(registerStagingLink("acme", "https://acme-preview.aethrdesign.com", root), "kept-existing");
    assert.ok(stateText(root).includes("elsewhere.example.com"));
    assert.equal(registerStagingLink("ghost", "https://x.example", root), "no-state");
  });
});
