import fs from "node:fs";
import path from "node:path";
import type { Issue, IssueSeverity, TestResult } from "./types";

export class ValidationReporter {
  private results: TestResult[] = [];
  private readonly reportDir = path.join(process.cwd(), ".validation-reports");

  constructor() {
    fs.mkdirSync(this.reportDir, { recursive: true });
  }

  addResults(results: TestResult[]) {
    this.results.push(...results);
  }

  findIssues(results: TestResult[] = this.results): Issue[] {
    return results
      .filter((result) => result.status === "fail" || result.status === "warning")
      .map((result) => ({
        id: result.id,
        title: result.title,
        category: result.category,
        severity: this.severityFor(result),
        description: result.error ?? result.description,
        suggestion: result.suggestion ?? "Inspect this check manually.",
      }));
  }

  printSummary(issues: Issue[]) {
    const total = this.results.length;
    const passed = this.results.filter((result) => result.status === "pass").length;
    const failed = this.results.filter((result) => result.status === "fail").length;
    const warnings = this.results.filter((result) => result.status === "warning").length;
    const skipped = this.results.filter((result) => result.status === "skip").length;

    console.log("\nVALIDATION SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Warnings: ${warnings}`);
    console.log(`Skipped: ${skipped}`);

    for (const issue of issues) {
      console.log(`\n[${issue.severity.toUpperCase()}] ${issue.title}`);
      console.log(`Category: ${issue.category}`);
      console.log(`Problem: ${issue.description}`);
      console.log(`Next: ${issue.suggestion}`);
    }
  }

  printHealth(health: unknown) {
    console.log("\nSYSTEM HEALTH");
    console.log("=".repeat(80));
    console.log(JSON.stringify(health, null, 2));
  }

  async generateReport(health?: unknown): Promise<string> {
    const timestamp = new Date().toISOString();
    const filename = path.join(this.reportDir, `validation-${timestamp.replace(/[:.]/g, "-")}.json`);
    const report = {
      timestamp,
      totalTests: this.results.length,
      passed: this.results.filter((result) => result.status === "pass").length,
      failed: this.results.filter((result) => result.status === "fail").length,
      warnings: this.results.filter((result) => result.status === "warning").length,
      skipped: this.results.filter((result) => result.status === "skip").length,
      health,
      results: this.results,
      issues: this.findIssues(),
    };

    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    return filename;
  }

  private severityFor(result: TestResult): IssueSeverity {
    if (result.status === "fail" && result.category === "security") return "critical";
    if (result.status === "fail") return "high";
    if (result.status === "warning") return "medium";
    return "low";
  }
}
