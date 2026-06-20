import type { Issue } from "./types";

export class AutoFixer {
  async fix(issue: Issue): Promise<boolean> {
    switch (issue.id) {
      case "frontend-baskets":
      case "frontend-basket-detail":
      case "frontend-performance-chart":
      case "frontend-mirror-modal":
        return false;
      case "database-env":
      case "integration-telegram-token":
        return false;
      default:
        return false;
    }
  }
}
