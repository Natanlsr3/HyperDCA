import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { HealthMonitor } from "@/lib/qa/health-monitor";

export const runtime = "nodejs";

export async function GET() {
  try {
    const health = await new HealthMonitor().check();
    const reportDir = path.join(process.cwd(), ".validation-reports");
    let lastReport = null;

    if (fs.existsSync(reportDir)) {
      const files = fs.readdirSync(reportDir).filter((file) => file.endsWith(".json")).sort().reverse();
      if (files[0]) {
        lastReport = JSON.parse(fs.readFileSync(path.join(reportDir, files[0]), "utf8"));
      }
    }

    return NextResponse.json({ health, lastReport, timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

