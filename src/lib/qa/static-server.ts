import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";

/**
 * Serves a Next.js `output: "export"` directory the way Cloudflare Workers Static
 * Assets does: `/foo` resolves to `foo.html` (never `foo/index.html` — that's the
 * shape this export emits), `/` resolves to `index.html`, anything else falls
 * through to `404.html` with a 404 status.
 *
 * Exists because `next start` refuses outright on `output: "export"` ("Use
 * `npx serve` instead") — the QA spec's "next build && next start" is written
 * against a pre-static-export draft of the deploy story. This is the minimal
 * stand-in that needs no new dependency and matches the real routing.
 */

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
};

function resolveFile(outDir: string, urlPath: string): string | null {
  const clean = urlPath.split("?")[0].split("#")[0];
  const decoded = decodeURIComponent(clean);

  const candidates =
    decoded === "/"
      ? ["index.html"]
      : [
          decoded.replace(/^\//, ""),
          `${decoded.replace(/^\//, "").replace(/\/$/, "")}.html`,
          path.join(decoded.replace(/^\//, ""), "index.html"),
        ];

  for (const candidate of candidates) {
    const full = path.join(outDir, candidate);
    if (!full.startsWith(path.resolve(outDir))) continue; // no path escape
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

export interface StaticServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export function serveStatic(outDir: string, port = 0): Promise<StaticServer> {
  const resolvedOut = path.resolve(outDir);
  if (!fs.existsSync(resolvedOut)) {
    throw new Error(`No build output at ${resolvedOut} — run \`pnpm build\` first.`);
  }

  const server = http.createServer((req, res) => {
    const urlPath = req.url ?? "/";
    const file = resolveFile(resolvedOut, urlPath);

    if (!file) {
      const notFound = path.join(resolvedOut, "404.html");
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : "404 Not Found");
      return;
    }

    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => {
    // 127.0.0.1 literal, not "localhost" — a sandboxed Chromium's DNS resolution for
    // hostnames is unreliable in this environment (observed as `Page.navigate` "Target
    // closed" and outright hangs against Lighthouse specifically); the literal loopback
    // address skips resolution entirely.
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const boundPort = typeof address === "object" && address ? address.port : port;
      resolve({
        url: `http://127.0.0.1:${boundPort}`,
        port: boundPort,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
