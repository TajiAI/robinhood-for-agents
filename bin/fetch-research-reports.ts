#!/usr/bin/env bun
/**
 * Unified Robinhood stock data crawler.
 *
 * Three stages:
 *   1. AUTH     — Open browser, user logs in, capture auth headers + cookies
 *   2. DISCOVER — Paginate instruments API, filter by market cap > $50M
 *   3. FETCH    — For each stock, fetch ALL data concurrently:
 *                 - Morningstar research report (PDF + metadata)
 *                 - Hedge fund summary + transactions
 *                 - Insider summary + transactions
 *                 - Short interest data
 *                 - Earnings (estimated vs actual)
 *                 - Key statistics / fundamentals
 *
 * Usage:
 *   bun bin/fetch-research-reports.ts [--resume] [--chrome /path/to/browser]
 *   bun bin/fetch-research-reports.ts --symbols AAPL,PLTR   # test specific stocks
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium } from "playwright-core";
import { resolveBrowserExecutable } from "../src/server/browser-auth.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OUTPUT_DIR = join(process.cwd(), "research-reports");
const PROGRESS_FILE = join(OUTPUT_DIR, "progress.json");
const SYMBOLS_FILE = join(OUTPUT_DIR, "symbols.json");
const DELAY_MS = 200;
const LOGIN_URL = "https://robinhood.com/login";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const API = "https://api.robinhood.com";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Progress {
  discovered: string[];
  completed: string[];
  skipped: string[];
  failed: string[];
  lastRun: string;
}

interface SymbolInfo {
  symbol: string;
  instrumentId: string;
}

interface RatingsOverview {
  download_url?: string;
  economic_moat?: string;
  fair_value?: { amount?: string; currency_code?: string };
  report_title?: string;
  report_published_at?: string;
  report_updated_at?: string;
  source?: string;
  star_rating?: string;
  stewardship?: string;
  uncertainty?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadProgress(): Progress {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8")) as Progress;
  }
  return { discovered: [], completed: [], skipped: [], failed: [], lastRun: "" };
}

function saveProgress(progress: Progress) {
  progress.lastRun = new Date().toISOString();
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function sanitizeFilename(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

function log(stage: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${stage}] ${msg}`);
}

/** Date string 90 days ago (for short interest endpoint's 92-day max window). */
function shortInterestStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

/** Fetch JSON from a URL, returning null on 404/403/error. */
async function fetchJson(
  url: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  try {
    const resp = await fetch(url, { headers });
    if (resp.status === 404 || resp.status === 403 || resp.status === 400) return null;
    if (!resp.ok) return null;
    return (await resp.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stage 1: Authentication
// ---------------------------------------------------------------------------

async function authenticate(browser: Browser): Promise<{
  headers: Record<string, string>;
  cookies: string;
}> {
  log("AUTH", "Opening browser — please log in to Robinhood...");

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.goto(LOGIN_URL);
  log("AUTH", "Waiting for login (5 min timeout)...");

  await Promise.race([
    page.waitForURL(
      (url) => {
        const path = new URL(url.toString()).pathname;
        return path !== "/login" && path !== "/login/";
      },
      { timeout: LOGIN_TIMEOUT_MS },
    ),
    new Promise((_, reject) =>
      browser.on("disconnected", () => reject(new Error("Browser closed before login."))),
    ),
  ]);

  await sleep(3000);
  log("AUTH", "Login detected! Capturing auth headers...");

  let capturedHeaders: Record<string, string> | null = null;
  page.on("request", (request) => {
    if (!capturedHeaders && request.url().includes("api.robinhood.com")) {
      capturedHeaders = request.headers();
    }
  });

  await page.goto("https://robinhood.com/", { timeout: 60000, waitUntil: "domcontentloaded" });

  for (let i = 0; i < 30 && !capturedHeaders; i++) {
    await sleep(500);
  }

  if (!capturedHeaders) {
    throw new Error("Could not capture auth headers — no API calls detected");
  }

  const authHeaders = capturedHeaders as Record<string, string>;
  const browserCookies = await context.cookies();
  const cookieStr = browserCookies.map((c) => `${c.name}=${c.value}`).join("; ");

  await browser.close().catch(() => {});

  const headers: Record<string, string> = {
    authorization: authHeaders.authorization || "",
    accept: "application/json",
    cookie: cookieStr,
    "user-agent": authHeaders["user-agent"] || "",
    origin: "https://robinhood.com",
    referer: "https://robinhood.com/",
  };

  log("AUTH", `Auth captured (token: ${headers.authorization ? "yes" : "NO"})`);
  return { headers, cookies: cookieStr };
}

// ---------------------------------------------------------------------------
// Stage 2: Stock Discovery
// ---------------------------------------------------------------------------

async function discoverSymbols(headers: Record<string, string>): Promise<SymbolInfo[]> {
  log("DISCOVER", "Paginating instruments API...");

  const allStocks: SymbolInfo[] = [];
  let nextUrl: string | null = `${API}/instruments/?active_instruments_only=true`;
  let pageNum = 0;

  while (nextUrl) {
    pageNum++;
    try {
      const resp = await fetch(nextUrl, { headers });
      if (!resp.ok) {
        log("DISCOVER", `Instruments API returned ${resp.status} — stopping`);
        break;
      }

      const data = (await resp.json()) as {
        next: string | null;
        results: Array<{
          symbol: string;
          id: string;
          type: string;
          state: string;
          tradability: string;
        }>;
      };

      const stocks = data.results.filter(
        (r) => r.type === "stock" && r.state === "active" && r.tradability === "tradable",
      );
      for (const s of stocks) {
        if (!allStocks.some((x) => x.symbol === s.symbol)) {
          allStocks.push({ symbol: s.symbol, instrumentId: s.id });
        }
      }

      if (pageNum % 50 === 0) {
        log("DISCOVER", `Page ${pageNum}: ${allStocks.length} stocks so far`);
      }
      nextUrl = data.next;
      await sleep(300);
    } catch (err) {
      log("DISCOVER", `Error on page ${pageNum}: ${err}`);
      break;
    }
  }

  log("DISCOVER", `Total tradable stocks: ${allStocks.length}`);

  // Filter by market cap > $50M
  log("DISCOVER", "Filtering by market cap > $50M...");
  const qualifying: SymbolInfo[] = [];
  const batchSize = 10;

  for (let i = 0; i < allStocks.length; i += batchSize) {
    const batch = allStocks.slice(i, i + batchSize);
    const symbolsParam = batch.map((s) => s.symbol).join(",");

    try {
      const resp = await fetch(`${API}/fundamentals/?symbols=${symbolsParam}`, { headers });
      if (!resp.ok) continue;

      const data = (await resp.json()) as {
        results: Array<{ market_cap?: string | null } | null>;
      };

      for (let j = 0; j < data.results.length; j++) {
        const fund = data.results[j];
        const info = batch[j];
        if (!fund || !info) continue;
        const marketCap = fund.market_cap ? Number.parseFloat(fund.market_cap) : 0;
        if (marketCap > 50_000_000) {
          qualifying.push(info);
        }
      }

      if (i % 500 === 0) {
        log(
          "DISCOVER",
          `Checked ${i + batchSize}/${allStocks.length} — ${qualifying.length} qualifying`,
        );
      }
      await sleep(200);
    } catch (err) {
      log("DISCOVER", `Error at batch ${i}: ${err}`);
    }
  }

  qualifying.sort((a, b) => a.symbol.localeCompare(b.symbol));
  log("DISCOVER", `Stocks with market cap > $50M: ${qualifying.length}`);
  return qualifying;
}

// ---------------------------------------------------------------------------
// Stage 3: Fetch all data per stock
// ---------------------------------------------------------------------------

async function fetchAllData(
  stocks: SymbolInfo[],
  headers: Record<string, string>,
  progress: Progress,
): Promise<void> {
  const alreadyDone = new Set([...progress.completed, ...progress.skipped]);
  const remaining = stocks.filter((s) => !alreadyDone.has(s.symbol));

  log("FETCH", `${remaining.length} symbols to process (${alreadyDone.size} already done)`);

  let completed = 0;
  let skipped = 0;
  const startDate = shortInterestStartDate();

  for (let i = 0; i < remaining.length; i++) {
    const stock = remaining[i] as SymbolInfo;
    const { symbol, instrumentId } = stock;
    const symbolDir = join(OUTPUT_DIR, symbol);

    // Fire all API calls concurrently
    const results = await Promise.allSettled([
      // 0: Morningstar research report
      fetchJson(`${API}/discovery/ratings/${instrumentId}/overview/`, headers),
      // 1: Hedge fund summary
      fetchJson(`${API}/marketdata/hedgefunds/summary/${instrumentId}/`, headers),
      // 2: Hedge fund transactions
      fetchJson(`${API}/marketdata/hedgefunds/transactions/${instrumentId}/`, headers),
      // 3: Insider summary
      fetchJson(`${API}/marketdata/insiders/summary/${instrumentId}/`, headers),
      // 4: Insider transactions
      fetchJson(`${API}/marketdata/insiders/transactions/${instrumentId}/`, headers),
      // 5: Short interest
      fetchJson(
        `${API}/marketdata/fundamentals/short/v1/?ids=${instrumentId}&start_date=${startDate}`,
        headers,
      ),
      // 6: Earnings
      fetchJson(`${API}/marketdata/earnings/?symbol=${symbol.toUpperCase()}`, headers),
      // 7: Fundamentals / key stats
      fetchJson(`${API}/fundamentals/${symbol.toUpperCase()}/`, headers),
    ]);

    // Check if we got any data at all
    const hasAnyData = results.some((r) => r.status === "fulfilled" && r.value !== null);

    if (!hasAnyData) {
      progress.skipped.push(symbol);
      skipped++;
      if (i % 100 === 0) {
        log("FETCH", `[${i + 1}/${remaining.length}] ${symbol}: skipped (no data)`);
      }
    } else {
      ensureDir(symbolDir);
      let dataPoints = 0;

      // 0: Morningstar report — download PDF + save metadata
      const morningstar = results[0];
      if (morningstar.status === "fulfilled" && morningstar.value) {
        const data = morningstar.value as unknown as RatingsOverview;
        if (data.download_url) {
          try {
            const pdfResp = await fetch(data.download_url);
            if (pdfResp.ok) {
              const pdfBuffer = await pdfResp.arrayBuffer();
              const dateStr = data.report_updated_at
                ? data.report_updated_at.slice(0, 10)
                : new Date().toISOString().slice(0, 10);
              const titleSlug = sanitizeFilename(data.report_title || "morningstar-report");
              writeFileSync(join(symbolDir, `${dateStr}-${titleSlug}.pdf`), Buffer.from(pdfBuffer));
            }
          } catch {
            // PDF download failed — continue with metadata
          }
          writeFileSync(
            join(symbolDir, "metadata.json"),
            JSON.stringify(
              {
                symbol,
                instrumentId,
                title: data.report_title || "",
                date: data.report_updated_at?.slice(0, 10) || "",
                author: data.source || "morningstar",
                fairValue: data.fair_value?.amount || null,
                moat: data.economic_moat || null,
                uncertainty: data.uncertainty || null,
                stewardship: data.stewardship || null,
                starRating: data.star_rating || null,
              },
              null,
              2,
            ),
          );
          dataPoints++;
        }
      }

      // 1-7: Save JSON data files
      const dataFiles: [number, string][] = [
        [1, "hedge-funds-summary.json"],
        [2, "hedge-funds-transactions.json"],
        [3, "insiders-summary.json"],
        [4, "insiders-transactions.json"],
        [5, "short-interest.json"],
        [6, "earnings.json"],
        [7, "fundamentals.json"],
      ];

      for (const [idx, filename] of dataFiles) {
        const result = results[idx];
        if (result && result.status === "fulfilled" && result.value) {
          writeFileSync(join(symbolDir, filename), JSON.stringify(result.value, null, 2));
          dataPoints++;
        }
      }

      progress.completed.push(symbol);
      completed++;
      if (completed % 50 === 0 || i < 10) {
        log(
          "FETCH",
          `[${i + 1}/${remaining.length}] ${symbol}: ${dataPoints} data points (${completed} done, ${skipped} skipped)`,
        );
      }
    }

    if (i % 10 === 0) saveProgress(progress);
    await sleep(DELAY_MS);
  }

  saveProgress(progress);
  log("FETCH", "=== COMPLETE ===");
  log("FETCH", `Completed: ${progress.completed.length}`);
  log("FETCH", `Skipped: ${progress.skipped.length}`);
  log("FETCH", `Failed: ${progress.failed.length}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const chromeIdx = args.indexOf("--chrome");
  const executablePath = chromeIdx !== -1 ? args[chromeIdx + 1] : resolveBrowserExecutable();

  ensureDir(OUTPUT_DIR);

  const progress = loadProgress();
  const isResume = args.includes("--resume") && progress.discovered.length > 0;

  // --symbols flag for testing specific stocks
  const symbolsIdx = args.indexOf("--symbols");
  const symbolsFilter = symbolsIdx !== -1 ? args[symbolsIdx + 1]?.split(",") : null;

  log("MAIN", "=== Robinhood Unified Stock Data Crawler ===");
  log("MAIN", `Output: ${OUTPUT_DIR}`);
  if (isResume) {
    log("MAIN", `Resuming: ${progress.completed.length} done, ${progress.failed.length} failed`);
  }

  // Launch browser (only needed for login)
  const launchOptions = {
    headless: false,
    ...(executablePath ? { executablePath } : { channel: "chrome" as const }),
  };

  let browser: Browser;
  try {
    browser = await chromium.launch(launchOptions);
  } catch {
    const hint = executablePath
      ? ` (${executablePath})`
      : ". Set BROWSER_PATH or use --chrome /path/to/browser";
    throw new Error(`Browser not found${hint}`);
  }

  // Stage 1: Auth
  const { headers } = await authenticate(browser);

  // Stage 2: Discover symbols
  let stocks: SymbolInfo[];
  if (symbolsFilter) {
    // --symbols flag: look up instrument IDs for the given symbols
    log("DISCOVER", `Using provided symbols: ${symbolsFilter.join(", ")}`);
    stocks = [];
    for (const sym of symbolsFilter) {
      const resp = await fetchJson(
        `${API}/instruments/?active_instruments_only=false&symbol=${sym.toUpperCase()}`,
        headers,
      );
      if (resp) {
        const results = (resp.results ?? []) as Array<{ id: string; symbol: string }>;
        const inst = results[0];
        if (inst) {
          stocks.push({ symbol: inst.symbol, instrumentId: inst.id });
        }
      }
    }
    // Clear progress for targeted runs
    progress.discovered = stocks.map((s) => s.symbol);
    progress.completed = [];
    progress.skipped = [];
    progress.failed = [];
  } else if (isResume) {
    const symbolsPath = join(OUTPUT_DIR, "symbols-v2.json");
    if (existsSync(symbolsPath)) {
      stocks = JSON.parse(readFileSync(symbolsPath, "utf-8")) as SymbolInfo[];
      log("DISCOVER", `Using cached symbol list: ${stocks.length} stocks`);
    } else {
      stocks = await discoverSymbols(headers);
      writeFileSync(symbolsPath, JSON.stringify(stocks, null, 2));
    }
    progress.discovered = stocks.map((s) => s.symbol);
    saveProgress(progress);
  } else {
    stocks = await discoverSymbols(headers);
    progress.discovered = stocks.map((s) => s.symbol);
    saveProgress(progress);
    writeFileSync(join(OUTPUT_DIR, "symbols-v2.json"), JSON.stringify(stocks, null, 2));
    writeFileSync(
      SYMBOLS_FILE,
      JSON.stringify(
        stocks.map((s) => s.symbol),
        null,
        2,
      ),
    );
    log("DISCOVER", `Saved ${stocks.length} symbols`);
  }

  if (stocks.length === 0) {
    log("MAIN", "No symbols found — exiting.");
    return;
  }

  // Stage 3: Fetch all data
  await fetchAllData(stocks, headers, progress);
  log("MAIN", "Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
