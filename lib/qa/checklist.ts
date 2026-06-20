import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chromium, type Browser, type Page } from "playwright";
import type { TestCategory, TestResult, ValidationOptions } from "./types";

type ApiValidator = (data: unknown, response: Response) => void;

export class QAChecklist {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private ownedServer: ChildProcessWithoutNullStreams | null = null;
  private readonly baseUrl = process.env.VALIDATION_BASE_URL ?? "http://127.0.0.1:3000";
  private readonly screenshotDir = path.join(process.cwd(), ".validation-reports", "screenshots");

  constructor(private readonly options: ValidationOptions) {}

  async runAll(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    await this.ensureServer();

    try {
      if (!this.options.skipScreenshots) results.push(...await this.testFrontend());
      if (!this.options.skipApi) results.push(...await this.testBackend());
      results.push(...await this.testDatabase());
      if (!this.options.skipHl) results.push(...await this.testHyperliquid());
      if (!this.options.skipBot) results.push(...await this.testTelegramBot());
      results.push(...await this.testSecurity());
      return results;
    } finally {
      await this.cleanup();
    }
  }

  private async testFrontend(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    mkdirSync(this.screenshotDir, { recursive: true });

    try {
      this.browser = await chromium.launch({ headless: this.options.headless });
      this.page = await this.browser.newPage({ viewport: { width: 1440, height: 1000 } });
    } catch (error) {
      return [this.result("frontend-playwright", "frontend", "Frontend: Playwright browser available", "fail", 0, error, "Run `npx playwright install chromium`.")];
    }

    results.push(await this.testPage("frontend-home", "Frontend: Home page loads", "/", async (page) => {
      await page.waitForSelector("h1", { timeout: 8000 });
    }));

    results.push(await this.testPage("frontend-baskets", "Frontend: Baskets discovery page loads", "/baskets", async (page) => {
      await page.waitForSelector('[data-testid="basket-card"]', { timeout: 10000 });
      const cards = await page.locator('[data-testid="basket-card"]').count();
      if (cards === 0) throw new Error("No basket cards found");
    }));

    results.push(await this.testPage("frontend-basket-detail", "Frontend: Basket detail page loads", "/baskets/demo-majors-momentum", async (page) => {
      await page.waitForSelector('[data-testid="basket-hero"]', { timeout: 10000 });
    }));

    results.push(await this.testPage("frontend-composition-chart", "Frontend: Composition chart renders", "/baskets/demo-majors-momentum", async (page) => {
      await page.waitForSelector('[data-testid="composition-chart"]', { timeout: 10000 });
    }));

    results.push(await this.testPage("frontend-performance-chart", "Frontend: Performance chart renders", "/baskets/demo-majors-momentum", async (page) => {
      await page.waitForSelector('[data-testid="performance-chart"]', { timeout: 10000 });
    }));

    results.push(await this.testPage("frontend-portfolio", "Frontend: Portfolio page loads", "/portfolio", async (page) => {
      await page.waitForSelector('[data-testid="portfolio-content"]', { timeout: 10000 });
    }));

    results.push(await this.testPage("frontend-leaderboard", "Frontend: Leaderboard page loads", "/leaderboard", async (page) => {
      await page.waitForSelector("table", { timeout: 10000 });
    }));

    results.push(await this.testPage("frontend-mirror-modal", "Frontend: Mirror modal opens", "/baskets/demo-majors-momentum", async (page) => {
      await page.click('[data-testid="mirror-button"]');
      await page.waitForSelector('[data-testid="mirror-modal"]', { timeout: 5000 });
    }));

    results.push(await this.testPage("frontend-navigation", "Frontend: Navigation links work", "/", async (page) => {
      await page.click('a[href="/baskets"]');
      await page.waitForURL("**/baskets", { timeout: 8000 });
    }));

    results.push(await this.testPage("frontend-console-errors", "Frontend: No console errors on baskets page", "/baskets", async (page) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      await page.waitForSelector('[data-testid="basket-card"]', { timeout: 10000 });
      await page.waitForTimeout(1000);
      if (errors.length > 0) throw new Error(errors.join("; "));
    }));

    return results;
  }

  private async testBackend(): Promise<TestResult[]> {
    return [
      await this.testApi("backend-baskets-list", "Backend: GET /api/baskets", "/api/baskets", (data) => {
        const payload = data as { baskets?: unknown[] };
        if (!Array.isArray(payload.baskets)) throw new Error("Response field `baskets` is not an array");
        if (payload.baskets.length === 0) throw new Error("No baskets returned");
      }),
      await this.testApi("backend-basket-detail", "Backend: GET /api/baskets/[id]", "/api/baskets/demo-majors-momentum", (data) => {
        const payload = data as { basket?: { id?: string; basket_assets?: unknown[] } };
        if (!payload.basket?.id) throw new Error("Basket ID missing");
        if (!Array.isArray(payload.basket.basket_assets)) throw new Error("Basket assets missing");
      }),
      await this.testApi("backend-leaderboard", "Backend: GET /api/leaderboard", "/api/leaderboard", (data) => {
        const payload = data as { leaderboard?: unknown[] };
        if (!Array.isArray(payload.leaderboard)) throw new Error("Leaderboard not an array");
      }),
      await this.testApi("backend-portfolio-protected", "Backend: GET /api/portfolio protected", "/api/portfolio", (_data, response) => {
        if (response.status !== 401 && !response.ok) throw new Error(`Unexpected status ${response.status}`);
      }, [200, 401]),
      await this.testApi("backend-notifications-protected", "Backend: GET /api/notifications protected", "/api/notifications", (_data, response) => {
        if (response.status !== 401 && !response.ok) throw new Error(`Unexpected status ${response.status}`);
      }, [200, 401]),
    ];
  }

  private async testDatabase(): Promise<TestResult[]> {
    const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!configured) {
      return [this.result("database-env", "database", "Database: Supabase env configured", "warning", 0, undefined, "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for live database checks.")];
    }

    return [await this.testApi("database-baskets-readable", "Database: Public baskets readable", "/api/baskets", (data) => {
      const payload = data as { baskets?: unknown[] };
      if (!Array.isArray(payload.baskets)) throw new Error("Baskets query did not return an array");
    })];
  }

  private async testHyperliquid(): Promise<TestResult[]> {
    const start = Date.now();
    try {
      const response = await fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "meta" }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { universe?: unknown[] };
      if (!Array.isArray(data.universe)) throw new Error("Unexpected Hyperliquid meta response");
      return [this.result("integration-hyperliquid-meta", "integration", "Hyperliquid: API connectivity", "pass", Date.now() - start)];
    } catch (error) {
      return [this.result("integration-hyperliquid-meta", "integration", "Hyperliquid: API connectivity", "warning", Date.now() - start, error, "Check network access or Hyperliquid API availability.")];
    }
  }

  private async testTelegramBot(): Promise<TestResult[]> {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return [this.result("integration-telegram-token", "integration", "Telegram: Bot token configured", "skip", 0, undefined, "Set TELEGRAM_BOT_TOKEN to validate Telegram bot connectivity.")];
    }

    return [await this.testExternalJson("integration-telegram-me", "integration", "Telegram: getMe", `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, (data) => {
      const payload = data as { ok?: boolean };
      if (!payload.ok) throw new Error("Telegram returned ok=false");
    })];
  }

  private async testSecurity(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    results.push(await this.testApi("security-portfolio-requires-auth", "Security: Portfolio requires auth", "/api/portfolio", (_data, response) => {
      if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
    }, [401]));
    results.push(await this.testApi("security-notifications-require-auth", "Security: Notifications require auth", "/api/notifications", (_data, response) => {
      if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
    }, [401]));
    return results;
  }

  private async testPage(id: string, title: string, route: string, test: (page: Page) => Promise<void>): Promise<TestResult> {
    const start = Date.now();
    try {
      await this.page!.goto(`${this.baseUrl}${route}`, { waitUntil: "networkidle", timeout: this.options.timeout });
      await test(this.page!);
      await this.page!.screenshot({ path: path.join(this.screenshotDir, `${id}.png`), fullPage: true });
      return this.result(id, "frontend", title, "pass", Date.now() - start, undefined, undefined, { route });
    } catch (error) {
      return this.result(id, "frontend", title, "fail", Date.now() - start, error, "Compare the selector or route against the implemented UI.", { route });
    }
  }

  private async testApi(id: string, title: string, route: string, validate: ApiValidator, acceptedStatuses = [200]): Promise<TestResult> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}${route}`, { signal: AbortSignal.timeout(this.options.timeout) });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!acceptedStatuses.includes(response.status)) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
      validate(data, response);
      return this.result(id, "backend", title, "pass", Date.now() - start, undefined, undefined, { route, status: response.status });
    } catch (error) {
      return this.result(id, "backend", title, "fail", Date.now() - start, error, "Check API route implementation, auth expectations, and database fallback.", { route });
    }
  }

  private async testExternalJson(id: string, category: TestCategory, title: string, url: string, validate: (data: unknown) => void): Promise<TestResult> {
    const start = Date.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(this.options.timeout) });
      const data = await response.json();
      validate(data);
      return this.result(id, category, title, "pass", Date.now() - start);
    } catch (error) {
      return this.result(id, category, title, "warning", Date.now() - start, error);
    }
  }

  private async ensureServer() {
    try {
      const response = await fetch(this.baseUrl, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // Start a local server below.
    }

    this.ownedServer = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "pipe",
    });

    const started = Date.now();
    while (Date.now() - started < 30000) {
      try {
        const response = await fetch(this.baseUrl, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    throw new Error("Could not start or reach local Next server on http://127.0.0.1:3000");
  }

  private result(
    id: string,
    category: TestCategory,
    title: string,
    status: TestResult["status"],
    duration: number,
    error?: unknown,
    suggestion?: string,
    metadata?: Record<string, unknown>,
  ): TestResult {
    return {
      id,
      category,
      title,
      description: status === "pass" ? "Check passed" : "Check did not meet expected state",
      status,
      duration,
      error: error instanceof Error ? error.message : error ? String(error) : undefined,
      suggestion,
      metadata,
    };
  }

  private async cleanup() {
    if (this.page) await this.page.close();
    if (this.browser) await this.browser.close();
    if (this.ownedServer) this.ownedServer.kill("SIGTERM");
  }
}
