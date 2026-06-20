export type TestCategory = "frontend" | "backend" | "integration" | "database" | "security";
export type TestStatus = "pass" | "fail" | "warning" | "skip";
export type IssueSeverity = "critical" | "high" | "medium" | "low";

export interface ValidationOptions {
  mode: "check" | "fix" | "watch";
  verbose: boolean;
  headless: boolean;
  timeout: number;
  skipScreenshots: boolean;
  skipApi: boolean;
  skipHl: boolean;
  skipBot: boolean;
}

export interface TestResult {
  id: string;
  category: TestCategory;
  title: string;
  description: string;
  status: TestStatus;
  duration: number;
  error?: string;
  suggestion?: string;
  metadata?: Record<string, unknown>;
}

export interface Issue {
  id: string;
  title: string;
  category: TestCategory;
  severity: IssueSeverity;
  description: string;
  suggestion: string;
}

