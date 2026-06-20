#!/usr/bin/env tsx
import { chromium } from "playwright";

const BASE_URL = process.env.VALIDATION_BASE_URL ?? "http://127.0.0.1:3000";
const WATCH = process.argv.includes("--watch");

interface DesignCheck {
  name: string;
  pass: boolean;
  actual?: string | number | boolean | null;
  expected?: string | number;
}

async function validateDesign() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  const checks: DesignCheck[] = [];

  try {
    await page.goto(`${BASE_URL}/baskets`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForSelector('[data-testid="basket-card"]', { timeout: 10000 });

    const shellChecks = await page.evaluate(`(() => {
      function style(selector) {
        const element = document.querySelector(selector);
        return element ? window.getComputedStyle(element) : null;
      }

      function rect(selector) {
        const element = document.querySelector(selector);
        return element ? element.getBoundingClientRect() : null;
      }

      const sidebar = rect("aside");
      const header = rect("header");
      const main = style(".app-content");
      const body = style("body");
      const card = style('[data-testid="basket-card"]');
      const grid = style('[data-testid="basket-grid"]');
      const button = style('[data-testid="basket-card"] .btn');

      return [
        { name: "Body background", pass: body?.backgroundColor === "rgb(249, 250, 251)", actual: body?.backgroundColor, expected: "#F9FAFB" },
        { name: "Body text color", pass: body?.color === "rgb(17, 24, 39)", actual: body?.color, expected: "#111827" },
        { name: "Font family", pass: Boolean(body?.fontFamily.includes("Inter")), actual: body?.fontFamily, expected: "Inter" },
        { name: "Sidebar width", pass: Math.round(sidebar?.width ?? 0) === 236, actual: Math.round(sidebar?.width ?? 0), expected: 236 },
        { name: "Header height", pass: Math.round(header?.height ?? 0) === 60, actual: Math.round(header?.height ?? 0), expected: 60 },
        { name: "Main max width", pass: main?.maxWidth === "1220px", actual: main?.maxWidth, expected: "1220px" },
        { name: "Basket grid gap", pass: grid?.gap === "18px", actual: grid?.gap, expected: "18px" },
        { name: "Basket card background", pass: card?.backgroundColor === "rgb(255, 255, 255)", actual: card?.backgroundColor, expected: "#FFFFFF" },
        { name: "Basket card padding", pass: card?.padding === "20px", actual: card?.padding, expected: "20px" },
        { name: "Basket card radius", pass: card?.borderRadius === "12px", actual: card?.borderRadius, expected: "12px" },
        { name: "Button background", pass: button?.backgroundColor === "rgb(30, 64, 175)", actual: button?.backgroundColor, expected: "#1E40AF" },
        { name: "Button radius", pass: button?.borderRadius === "6px", actual: button?.borderRadius, expected: "6px" },
      ];
    })()`) as DesignCheck[];
    checks.push(...shellChecks);

    await page.goto(`${BASE_URL}/baskets/demo-majors-momentum`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForSelector('[data-testid="basket-hero"]', { timeout: 10000 });
    const detailChecks = await page.evaluate(`(() => [
      { name: "Detail composition chart", pass: Boolean(document.querySelector('[data-testid="composition-chart"]')), actual: Boolean(document.querySelector('[data-testid="composition-chart"]')), expected: "present" },
      { name: "Detail performance chart", pass: Boolean(document.querySelector('[data-testid="performance-chart"]')), actual: Boolean(document.querySelector('[data-testid="performance-chart"]')), expected: "present" },
      { name: "Mirror button", pass: Boolean(document.querySelector('[data-testid="mirror-button"]')), actual: Boolean(document.querySelector('[data-testid="mirror-button"]')), expected: "present" },
    ])()`) as DesignCheck[];
    checks.push(...detailChecks);
  } finally {
    await browser.close();
  }

  const failures = checks.filter((check) => !check.pass);
  console.log(`Design checks: ${checks.length - failures.length}/${checks.length} passed`);
  for (const failure of failures) {
    console.log(`FAIL ${failure.name}: expected ${failure.expected}, got ${failure.actual}`);
  }

  if (failures.length > 0) process.exitCode = 1;
}

async function main() {
  await validateDesign();
  if (WATCH) {
    setInterval(() => {
      validateDesign().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    }, 5 * 60 * 1000);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
