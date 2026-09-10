/** Two failure classes, per `qa-specification.md` §3. Nothing in between. */
export type Severity = "blocker" | "advisory";

export interface CheckFinding {
  severity: Severity;
  check: string;
  message: string;
  url?: string;
  selector?: string;
  expected?: string;
  actual?: string;
}

export interface CheckResult {
  check: string;
  ok: boolean;
  findings: CheckFinding[];
  /** Advisory evidence — e.g. screenshot paths. Never gates anything. */
  evidence?: Record<string, unknown>;
}

export interface QASuiteResult {
  slug: string;
  target: string;
  ranAt: string;
  results: CheckResult[];
}

export function blockers(result: QASuiteResult): CheckFinding[] {
  return result.results.flatMap((r) => r.findings.filter((f) => f.severity === "blocker"));
}

export function advisories(result: QASuiteResult): CheckFinding[] {
  return result.results.flatMap((r) => r.findings.filter((f) => f.severity === "advisory"));
}

export type Verdict = "PARKED" | "STAGED" | "PASS";

export function verdictOf(result: QASuiteResult): Verdict {
  const blockerCount = blockers(result).length;
  if (blockerCount > 0) return "PARKED";
  if (advisories(result).length > 0) return "STAGED";
  return "PASS";
}
