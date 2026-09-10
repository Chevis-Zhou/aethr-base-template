import type { CheckFinding } from "./types";

/**
 * Post-push smoke suite, `qa-specification.md` §2. Runs against the deployed staging URL
 * after the full local suite has already passed — the local build is deterministic, this
 * catches the ways a deploy can still go wrong: wrong hostname, mixed content, a stray
 * `noindex`, or a build that silently didn't ship what was just tested.
 */

export interface SmokePage {
  path: string;
  expectedTitle: string;
  expectedDescription: string | null;
  /** Whether this page is meant to be crawlable — the negative-control fixture can flip this. */
  shouldIndex: boolean;
}

export async function runSmokeChecks(
  stagingOrigin: string,
  expectedHostname: string,
  pages: SmokePage[],
  fetchImpl: typeof fetch = fetch,
): Promise<CheckFinding[]> {
  const findings: CheckFinding[] = [];
  const origin = stagingOrigin.replace(/\/$/, "");

  let actualHostname: string;
  try {
    actualHostname = new URL(origin).hostname;
  } catch {
    findings.push({
      severity: "blocker",
      check: "smoke-hostname",
      message: `"${origin}" is not a valid URL.`,
    });
    return findings;
  }

  if (actualHostname !== expectedHostname) {
    findings.push({
      severity: "blocker",
      check: "smoke-hostname",
      message: `Deployed hostname does not match the expected staging hostname.`,
      expected: expectedHostname,
      actual: actualHostname,
    });
  }

  for (const page of pages) {
    const url = `${origin}${page.path}`;
    let res: Response;
    try {
      res = await fetchImpl(url);
    } catch (err) {
      findings.push({
        severity: "blocker",
        check: "smoke-200",
        message: `${url} failed to load: ${(err as Error).message}`,
        url,
      });
      continue;
    }

    if (res.status !== 200) {
      findings.push({
        severity: "blocker",
        check: "smoke-200",
        message: `${url} returned ${res.status}, expected 200.`,
        url,
        expected: "200",
        actual: String(res.status),
      });
      continue;
    }

    const html = await res.text();

    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const actualTitle = titleMatch?.[1] ?? "";
    if (actualTitle !== page.expectedTitle) {
      findings.push({
        severity: "blocker",
        check: "smoke-title-match",
        message: `<title> on deployed page does not match the local build.`,
        url,
        expected: page.expectedTitle,
        actual: actualTitle,
      });
    }

    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
    const actualDescription = descMatch?.[1] ?? null;
    if ((actualDescription ?? "") !== (page.expectedDescription ?? "")) {
      findings.push({
        severity: "blocker",
        check: "smoke-description-match",
        message: `Meta description on deployed page does not match the local build.`,
        url,
        expected: page.expectedDescription ?? "(none)",
        actual: actualDescription ?? "(none)",
      });
    }

    if (origin.startsWith("https://")) {
      const insecureRefs = [...html.matchAll(/(?:src|href)="http:\/\/[^"]+"/gi)];
      for (const ref of insecureRefs) {
        findings.push({
          severity: "blocker",
          check: "smoke-mixed-content",
          message: `Insecure (http://) resource reference on an https:// page: ${ref[0]}.`,
          url,
        });
      }
    }

    const robotsMatch = html.match(/<meta\s+name="robots"\s+content="([^"]*)"/i);
    const hasNoindex = robotsMatch?.[1]?.toLowerCase().includes("noindex") ?? false;
    if (page.shouldIndex && hasNoindex) {
      findings.push({
        severity: "blocker",
        check: "smoke-noindex",
        message: `Page intended to be indexed carries a noindex tag.`,
        url,
      });
    }
  }

  return findings;
}
