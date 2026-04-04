#!/usr/bin/env bun
/**
 * Probe script: calls hedge fund, insider, short interest, and other
 * undocumented endpoints to capture their response shapes.
 */

import { chromium } from "playwright-core";

const LOGIN_URL = "https://robinhood.com/login";

const INSTRUMENTS = [
	{ symbol: "AAPL", id: "450dfc6d-5510-4d40-abfb-f633b7d9be3e" },
	{ symbol: "PLTR", id: "f90de184-4f73-4aad-9a5f-407858013eb1" },
];

async function main() {
	const browser = await chromium.launch({ headless: false, channel: "chrome" });

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const page = await context.newPage();

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

	// Capture auth headers
	let capturedHeaders: Record<string, string> | null = null;
	page.on("request", (request) => {
		if (!capturedHeaders && request.url().includes("api.robinhood.com")) {
			capturedHeaders = request.headers();
		}
	});

	await page.goto("https://robinhood.com/", { timeout: 60000, waitUntil: "domcontentloaded" });
	for (let i = 0; i < 30 && !capturedHeaders; i++) {
		await new Promise((r) => setTimeout(r, 500));
	}

	if (!capturedHeaders) {
		throw new Error("Could not capture auth headers");
	}

	const browserCookies = await context.cookies();
	const cookieStr = browserCookies.map((c) => `${c.name}=${c.value}`).join("; ");

	await browser.close().catch(() => {});

	const headers: Record<string, string> = {
		authorization: (capturedHeaders as Record<string, string>).authorization || "",
		accept: "application/json",
		cookie: cookieStr,
		"user-agent": (capturedHeaders as Record<string, string>)["user-agent"] || "",
		origin: "https://robinhood.com",
		referer: "https://robinhood.com/",
	};

	console.log(`Auth: ${headers.authorization ? "yes" : "NO"}\n`);

	for (const inst of INSTRUMENTS) {
		console.log(`\n${"=".repeat(80)}`);
		console.log(`  ${inst.symbol} (${inst.id})`);
		console.log(`${"=".repeat(80)}\n`);

		const endpoints = [
			{
				name: "Hedge Funds Summary",
				url: `https://api.robinhood.com/marketdata/hedgefunds/summary/${inst.id}/`,
			},
			{
				name: "Hedge Funds Transactions",
				url: `https://api.robinhood.com/marketdata/hedgefunds/transactions/${inst.id}/`,
			},
			{
				name: "Insiders Summary",
				url: `https://api.robinhood.com/marketdata/insiders/summary/${inst.id}/`,
			},
			{
				name: "Insiders Transactions",
				url: `https://api.robinhood.com/marketdata/insiders/transactions/${inst.id}/`,
			},
			{
				name: "Short Interest (fundamentals/short)",
				url: `https://api.robinhood.com/marketdata/fundamentals/short/v1/?ids=${inst.id}&start_date=2025-01-01`,
			},
			{
				name: "Shorting Availability",
				url: `https://api.robinhood.com/instruments/${inst.id}/shorting/`,
			},
			{
				name: "Robinhood Trading Summary",
				url: `https://api.robinhood.com/marketdata/equities/summary/robinhood/${inst.id}/`,
			},
		];

		for (const ep of endpoints) {
			console.log(`--- ${ep.name} ---`);
			console.log(`GET ${ep.url}`);
			try {
				const resp = await fetch(ep.url, { headers });
				console.log(`Status: ${resp.status}`);
				if (resp.ok) {
					const data = await resp.json();
					console.log(JSON.stringify(data, null, 2).slice(0, 5000));
				} else {
					const text = await resp.text();
					console.log(`Body: ${text.slice(0, 500)}`);
				}
			} catch (err) {
				console.log(`Error: ${err}`);
			}
			console.log();
		}
	}
}

main().catch(console.error);
