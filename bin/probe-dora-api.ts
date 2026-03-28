#!/usr/bin/env bun
/**
 * Probe the dora feed endpoint to check if it contains analyst report PDF URLs.
 * Also tries other candidate endpoints.
 */

import { chromium } from "playwright-core";
import { resolveBrowserExecutable } from "../src/server/browser-auth.js";

const LOGIN_URL = "https://robinhood.com/login";
const PLTR_INSTRUMENT_ID = "f90de184-4f73-4aad-9a5f-407858013eb1";

async function main() {
	const executablePath = resolveBrowserExecutable();
	const browser = await chromium.launch({
		headless: false,
		...(executablePath ? { executablePath } : { channel: "chrome" as const }),
	});

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const page = await context.newPage();

	// Log in
	console.log("Please log in to Robinhood...");
	await page.goto(LOGIN_URL);
	await page.waitForURL(
		(url) => {
			const path = new URL(url.toString()).pathname;
			return path !== "/login" && path !== "/login/";
		},
		{ timeout: 300000 },
	);
	console.log("Login detected!\n");

	// Capture auth headers from any API request
	let authHeaders: Record<string, string> = {};
	const headerPromise = new Promise<void>((resolve) => {
		const handler = (request: { url: () => string; headers: () => Record<string, string> }) => {
			if (request.url().includes("api.robinhood.com")) {
				authHeaders = request.headers();
				page.off("request", handler);
				resolve();
			}
		};
		page.on("request", handler);
	});

	await page.goto("https://robinhood.com/account", { waitUntil: "networkidle" });
	await headerPromise;

	const cookies = await context.cookies();
	const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

	const headers = {
		authorization: authHeaders.authorization || "",
		accept: "application/json",
		cookie: cookieStr,
		"user-agent": authHeaders["user-agent"] || "",
		origin: "https://robinhood.com",
		referer: "https://robinhood.com/",
	};

	console.log(`Auth header present: ${!!headers.authorization}\n`);

	// Try various endpoints that might contain report data
	const endpoints = [
		{
			name: "dora feed",
			url: `https://dora.robinhood.com/feed/instrument/${PLTR_INSTRUMENT_ID}/`,
		},
		{
			name: "discovery ratings overview",
			url: `https://api.robinhood.com/discovery/ratings/${PLTR_INSTRUMENT_ID}/overview/`,
		},
		{
			name: "midlands ratings",
			url: `https://api.robinhood.com/midlands/ratings/${PLTR_INSTRUMENT_ID}/`,
		},
		{
			name: "marketdata equities summary",
			url: `https://api.robinhood.com/marketdata/equities/summary/robinhood/${PLTR_INSTRUMENT_ID}/`,
		},
		{
			name: "fundamentals",
			url: `https://api.robinhood.com/marketdata/fundamentals/${PLTR_INSTRUMENT_ID}/?bounds=24_5&include_inactive=true`,
		},
	];

	for (const ep of endpoints) {
		console.log(`\n========== ${ep.name} ==========`);
		console.log(`GET ${ep.url}`);
		try {
			const resp = await fetch(ep.url, { headers });
			console.log(`Status: ${resp.status}`);
			const text = await resp.text();

			// Check if it contains report-related data
			const hasReport =
				text.includes("analyst_report") ||
				text.includes("morningstar") ||
				text.includes("Morningstar") ||
				text.includes("fair_value") ||
				text.includes("moat") ||
				text.includes("research_report") ||
				text.includes("midlands.s3");

			if (hasReport) {
				console.log("*** CONTAINS REPORT DATA ***");
				// Pretty print if JSON
				try {
					const json = JSON.parse(text);
					console.log(JSON.stringify(json, null, 2).slice(0, 5000));
				} catch {
					console.log(text.slice(0, 3000));
				}
			} else {
				console.log(`No report data found (response length: ${text.length})`);
				// Still show a snippet
				try {
					const json = JSON.parse(text);
					const keys = Object.keys(json);
					console.log(`Top-level keys: ${keys.join(", ")}`);
					// Check nested for any report-like fields
					const str = JSON.stringify(json);
					if (str.includes("report") || str.includes("analyst")) {
						console.log("*** Contains 'report' or 'analyst' somewhere in nested data ***");
						console.log(str.slice(0, 3000));
					}
				} catch {
					console.log(text.slice(0, 500));
				}
			}
		} catch (err) {
			console.log(`Error: ${err}`);
		}
	}

	// Also try: searching for any endpoint pattern with "analyst" or "report" in the URL
	// by looking at what the page's React app calls
	console.log("\n\n========== Trying direct analyst report endpoints ==========");
	const guessEndpoints = [
		`https://api.robinhood.com/analyst_reports/${PLTR_INSTRUMENT_ID}/`,
		`https://api.robinhood.com/analyst_reports/?instrument_id=${PLTR_INSTRUMENT_ID}`,
		`https://bonfire.robinhood.com/analyst_reports/${PLTR_INSTRUMENT_ID}/`,
		`https://bonfire.robinhood.com/instruments/${PLTR_INSTRUMENT_ID}/analyst_report/`,
		`https://api.robinhood.com/midlands/analyst_reports/${PLTR_INSTRUMENT_ID}/`,
		`https://dora.robinhood.com/analyst_reports/${PLTR_INSTRUMENT_ID}/`,
		`https://api.robinhood.com/instruments/${PLTR_INSTRUMENT_ID}/analyst_report/`,
		`https://bonfire.robinhood.com/research/${PLTR_INSTRUMENT_ID}/`,
		`https://api.robinhood.com/research/${PLTR_INSTRUMENT_ID}/`,
	];

	for (const url of guessEndpoints) {
		try {
			const resp = await fetch(url, { headers });
			const status = resp.status;
			if (status === 200) {
				const text = await resp.text();
				console.log(`\n*** HIT *** ${url} → ${status} (${text.length} bytes)`);
				console.log(text.slice(0, 2000));
			} else {
				console.log(`${url} → ${status}`);
			}
		} catch (err) {
			console.log(`${url} → Error: ${err}`);
		}
	}

	await browser.close();
}

main().catch(console.error);
