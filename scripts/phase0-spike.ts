#!/usr/bin/env tsx
/**
 * Phase 0 spike — validates @nktkas/hyperliquid SDK against HL mainnet.
 * Dry-run by default; set PHASE0_LIVE=1 + wallet keys for live order test.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvFile(name: string) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

import { privateKeyToAccount } from "viem/accounts";
import { createInfoClient, createSymbolConverter, getTransport } from "../lib/hl/client";
import { getPredictedFundings, getAllMids } from "../lib/hl/read";
import { executeTrade, swapUsdcToUsdh } from "../lib/hl/order";
import { createExchangeClient } from "../lib/hl/client";
import { getBuilderAddress, getBuilderMaxFee } from "../lib/hl/config";

const LIVE = process.env.PHASE0_LIVE === "1";
const MAIN_WALLET = process.env.PHASE0_MAIN_WALLET as `0x${string}` | undefined;
const AGENT_KEY = process.env.PHASE0_AGENT_PRIVATE_KEY as `0x${string}` | undefined;

async function main() {
  console.log("=== HyperDCA Phase 0 Spike ===");
  console.log(`Mode: ${LIVE ? "LIVE" : "DRY-RUN"}`);
  console.log(`Builder: ${getBuilderAddress()} maxFee=${getBuilderMaxFee()}`);

  const info = createInfoClient();
  const transport = getTransport();
  console.log("Transport:", transport ? "ok" : "fail");

  const predicted = await getPredictedFundings();
  console.log(`predictedFundings: ${predicted.length} entries`);
  const sample = predicted.slice(0, 3).map((p) => `${p[0]}`);
  console.log("  sample:", sample.join(", "));

  const vntlMids = await getAllMids("vntl");
  const mag7 = vntlMids["vntl:MAG7"];
  console.log(`allMids(vntl) vntl:MAG7 = ${mag7 ?? "MISSING"}`);

  const converter = await createSymbolConverter(["vntl", "xyz"]);
  const mag7Id = converter.getAssetId("vntl:MAG7");
  const mag7Dec = converter.getSzDecimals("vntl:MAG7");
  console.log(`SymbolConverter vntl:MAG7 assetId=${mag7Id} szDecimals=${mag7Dec}`);

  if (!LIVE) {
    console.log("\nDry-run complete. Set PHASE0_LIVE=1 with wallet keys to test live order.");
    return;
  }

  if (!MAIN_WALLET || !AGENT_KEY) {
    throw new Error("PHASE0_MAIN_WALLET and PHASE0_AGENT_PRIVATE_KEY required for live mode");
  }

  const agent = privateKeyToAccount(AGENT_KEY);
  const exchange = createExchangeClient(agent, ["", "vntl"]);

  console.log("\nTesting userDexAbstraction...");
  try {
    const abs = await info.userDexAbstraction({ user: MAIN_WALLET });
    console.log("  userDexAbstraction:", JSON.stringify(abs));
  } catch (e) {
    console.log("  userDexAbstraction unavailable:", e);
  }

  console.log("\nTesting USDH swap (@230)...");
  const swap = await swapUsdcToUsdh(exchange, converter, "@1", 11);
  console.log("  swap:", swap);

  console.log("\nTesting 1x vntl:MAG7 order with builder fee...");
  const trade = await executeTrade(exchange, converter, {
    coin: "vntl:MAG7",
    dex: "vntl",
    szDecimals: mag7Dec ?? 3,
    isCross: false,
    marginUsd: 10,
    leverage: 1,
    slippage: 0.02,
    cloid: `0x${Date.now().toString(16).padStart(32, "0")}`,
  });
  console.log("  trade:", trade);

  console.log("\nPhase 0 LIVE complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
