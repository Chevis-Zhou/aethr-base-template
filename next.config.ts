import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Client sites ship as a static export — a directory of HTML, CSS, JS and images with
  // no server behind it. This is the decision the whole deploy story follows from: static
  // asset requests do not count against Cloudflare's account-wide 100,000-requests/day
  // Worker budget, which every client, the portal, checkout and the apex proxy share. An
  // SSR client site would put one client's traffic spike into everyone else's bucket.
  //
  // What this forecloses: no server-side behaviour on the productized tier ever — no auth,
  // no e-commerce, no personalisation. That costs nothing today (those are ruled L3-only,
  // not purchasable as an add-on) and the correct answer the day an add-on needs a server
  // is to price that client onto the custom tier, not to make every client site dynamic.
  //
  // The one dynamic route, `/api/contact`, lives in `src/worker.ts` instead.
  // Spec: `docs/wayfinder-product/assets/deploy-specification.md` §0 and §3.
  output: "export",

  // No image optimizer exists behind a static export. The section components already use
  // plain `<img>` with client-supplied URLs rather than `next/image`, so this only makes
  // the absence explicit and keeps `next build` from erroring if one is added later.
  images: { unoptimized: true },
};

export default nextConfig;
