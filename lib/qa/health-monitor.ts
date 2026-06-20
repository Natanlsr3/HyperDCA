export interface HealthStatus {
  status: "healthy" | "degraded" | "critical";
  uptime: number;
  lastCheck: string;
  details: string;
}

export interface SystemHealth {
  frontend: HealthStatus;
  backend: HealthStatus;
  database: HealthStatus;
  hyperliquid: HealthStatus;
  telegramBot: HealthStatus;
  aiAdvisor: HealthStatus;
}

export class HealthMonitor {
  constructor(private readonly baseUrl = process.env.VALIDATION_BASE_URL ?? "http://127.0.0.1:3000") {}

  async check(): Promise<SystemHealth> {
    const [frontend, backend, database, hyperliquid, telegramBot, aiAdvisor] = await Promise.all([
      this.checkFrontend(),
      this.checkBackend(),
      this.checkDatabase(),
      this.checkHyperliquid(),
      this.checkTelegramBot(),
      this.checkAiAdvisor(),
    ]);

    return { frontend, backend, database, hyperliquid, telegramBot, aiAdvisor };
  }

  private async checkFrontend(): Promise<HealthStatus> {
    return this.checkHttp(`${this.baseUrl}`, "Frontend responding");
  }

  private async checkBackend(): Promise<HealthStatus> {
    return this.checkHttp(`${this.baseUrl}/api/baskets`, "Backend API responding");
  }

  private async checkDatabase(): Promise<HealthStatus> {
    const configured = isServiceDbConfigured();
    return this.status(
      configured ? "healthy" : "degraded",
      configured ? "Supabase live database configured" : "Supabase keys missing; public demo fallback active",
    );
  }

  private async checkHyperliquid(): Promise<HealthStatus> {
    try {
      const response = await fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "meta" }),
        signal: AbortSignal.timeout(5000),
      });
      return this.status(response.ok ? "healthy" : "degraded", `Hyperliquid HTTP ${response.status}`);
    } catch (error) {
      return this.status("degraded", error instanceof Error ? error.message : "Hyperliquid check failed");
    }
  }

  private async checkTelegramBot(): Promise<HealthStatus> {
    if (!process.env.TELEGRAM_BOT_TOKEN) return this.status("degraded", "TELEGRAM_BOT_TOKEN missing");
    try {
      const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, {
        signal: AbortSignal.timeout(5000),
      });
      return this.status(response.ok ? "healthy" : "degraded", `Telegram HTTP ${response.status}`);
    } catch (error) {
      return this.status("degraded", error instanceof Error ? error.message : "Telegram check failed");
    }
  }

  private async checkAiAdvisor(): Promise<HealthStatus> {
    if (process.env.OPENAI_API_KEY) return this.status("healthy", `OpenAI advisor configured (${process.env.OPENAI_MODEL ?? "gpt-5-mini"})`);
    if (process.env.GEMINI_API_KEY) return this.status("healthy", `Gemini advisor configured (${process.env.GEMINI_MODEL ?? "gemini-2.5-flash"})`);
    return this.status("degraded", "OPENAI_API_KEY or GEMINI_API_KEY missing");
  }

  private async checkHttp(url: string, healthyDetail: string): Promise<HealthStatus> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return this.status(response.ok ? "healthy" : "degraded", response.ok ? healthyDetail : `HTTP ${response.status}`);
    } catch (error) {
      return this.status("critical", error instanceof Error ? error.message : "HTTP check failed");
    }
  }

  private status(status: HealthStatus["status"], details: string): HealthStatus {
    return {
      status,
      uptime: Date.now(),
      lastCheck: new Date().toISOString(),
      details,
    };
  }
}
import { isServiceDbConfigured } from "@/lib/db/client";
