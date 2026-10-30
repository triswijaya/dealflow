import "./seed/load-env";
import { db } from "@/server/db/client";
import { runReconcile } from "@/server/reports/reconcile";

// pnpm reconcile [--organization <id>]
//
// Re-checks the money and order invariants from the data alone and prints what
// breaks them. Exits 1 on any error, so CI and a release checklist can stop on it.

const index = process.argv.indexOf("--organization");
const organizationId = index >= 0 ? process.argv[index + 1] : undefined;

const findings = await runReconcile(db, { organizationId });
const errors = findings.filter((finding) => finding.severity === "error");

if (findings.length === 0) {
  console.log("reconcile: all invariants hold");
} else {
  for (const finding of findings) {
    console.log(`${finding.severity.toUpperCase().padEnd(7)} ${finding.check} (${finding.organizationId}): ${finding.message}`);
    console.log(`        ${finding.ids.slice(0, 10).join(", ")}${finding.ids.length > 10 ? ` ... and ${finding.ids.length - 10} more` : ""}`);
  }
  console.log(`reconcile: ${errors.length} error group(s), ${findings.length - errors.length} warning group(s)`);
}
process.exit(errors.length > 0 ? 1 : 0);
