#!/usr/bin/env bun
/**
 * Probe earnings-related endpoints for revenue and other data beyond EPS.
 */

import { chromium } from "playwright-core";

const LOGIN_URL = "https://robinhood.com/login";
const PLTR_ID = "f90de184-4f73-4aad-9a5f-407858013eb1";
const AAPL_ID = "450dfc6d-5510-4d40-abfb-f633b7d9be3e";

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

	const browserCookies = await context.cookies();
	const cookieStr = browserCookies.map((c) => `${c.name}=${c.value}`).join("; ");
	await browser.close().catch(() => {});

	const headers: Record<string, string> = {
		authorization: (capturedHeaders as unknown as Record<string, string>).authorization || "",
		accept: "application/json",
		cookie: cookieStr,
		"user-agent": (capturedHeaders as unknown as Record<string, string>)["user-agent"] || "",
		origin: "https://robinhood.com",
		referer: "https://robinhood.com/",
	};

	for (const [symbol, id] of [
		["AAPL", AAPL_ID],
		["PLTR", PLTR_ID],
	]) {
		console.log(`\n${"=".repeat(80)}`);
		console.log(`  ${symbol}`);
		console.log(`${"=".repeat(80)}\n`);

		const endpoints = [
			{
				name: "Bonfire QA Event Info",
				url: `https://bonfire.robinhood.com/instruments/${id}/qa/event-info/`,
			},
			{
				name: "Bonfire QA Events Section",
				url: `https://bonfire.robinhood.com/instruments/${id}/qa/events-section/`,
			},
			{
				name: "Marketdata Earnings (by instrument)",
				url: `https://api.robinhood.com/marketdata/earnings/?instrument=%2Finstruments%2F${id}%2F`,
			},
			{
				name: "Marketdata Earnings (by symbol)",
				url: `https://api.robinhood.com/marketdata/earnings/?symbol=${symbol}`,
			},
			{
				name: "Bonfire Earnings Calendar",
				url: `https://bonfire.robinhood.com/instruments/${id}/earnings/`,
			},
			{
				name: "Marketdata Revenue",
				url: `https://api.robinhood.com/marketdata/revenue/?instrument_id=${id}`,
			},
			{
				name: "Marketdata Financials",
				url: `https://api.robinhood.com/marketdata/financials/${id}/`,
			},
			{
				name: "Marketdata Earnings Detail",
				url: `https://api.robinhood.com/marketdata/earnings/${id}/`,
			},
		];

		for (const ep of endpoints) {
			console.log(`--- ${ep.name} ---`);
			console.log(`GET ${ep.url}`);
			try {
				const resp = await fetch(ep.url, { headers });
				console.log(`Status: ${resp.status}`);
				if (resp.ok) {
					const text = await resp.text();
					try {
						const data = JSON.parse(text);
						console.log(JSON.stringify(data, null, 2).slice(0, 4000));
					} catch {
						console.log(text.slice(0, 2000));
					}
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
