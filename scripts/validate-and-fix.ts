#!/usr/bin/env tsx
import { AutoFixer } from "../lib/qa/auto-fixer";
import { QAChecklist } from "../lib/qa/checklist";
import { HealthMonitor } from "../lib/qa/health-monitor";
import { ValidationReporter } from "../lib/qa/reporter";
import type { ValidationOptions } from "../lib/qa/types";

const DEFAULT_OPTIONS: ValidationOptions = {
  mode: "check",
  verbose: false,
  headless: true,
  timeout: 30000,
  skipScreenshots: false,
  skipApi: false,
  skipHl: false,
  skipBot: false,
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log("HyperDCA validation");
  console.log(`Mode: ${options.mode}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const reporter = new ValidationReporter();
  const checklist = new QAChecklist(options);
  const fixer = new AutoFixer();
  const monitor = new HealthMonitor();

  const results = await checklist.runAll();
  reporter.addResults(results);

  let issues = reporter.findIssues();
  reporter.printSummary(issues);

  if (options.mode === "fix" && issues.length > 0) {
    console.log("\nAUTO-FIX");
    for (const issue of issues) {
      const fixed = await fixer.fix(issue);
      console.log(`${fixed ? "fixed" : "manual"}: ${issue.title}`);
    }
  }

  const health = await monitor.check();
  reporter.printHealth(health);
  const reportPath = await reporter.generateReport(health);
  console.log(`\nReport saved: ${reportPath}`);

  if (options.mode === "watch") {
    setInterval(async () => {
      const nextResults = await checklist.runAll();
      issues = reporter.findIssues(nextResults);
      console.log(`[${new Date().toISOString()}] issues=${issues.length}`);
    }, 5 * 60 * 1000);
    return;
  }

  const failed = results.some((result) => result.status === "fail");
  process.exit(failed ? 1 : 0);
}

function parseArgs(args: string[]): ValidationOptions {
  const options = { ...DEFAULT_OPTIONS };
  for (const arg of args) {
    if (arg.startsWith("--mode=")) options.mode = arg.split("=")[1] as ValidationOptions["mode"];
    if (arg === "--verbose") options.verbose = true;
    if (arg === "--no-headless") options.headless = false;
    if (arg.startsWith("--timeout=")) options.timeout = Number(arg.split("=")[1]);
    if (arg === "--skip-screenshots") options.skipScreenshots = true;
    if (arg === "--skip-api") options.skipApi = true;
    if (arg === "--skip-hl") options.skipHl = true;
    if (arg === "--skip-bot") options.skipBot = true;
  }
  return options;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

