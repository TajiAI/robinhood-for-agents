#!/usr/bin/env bun
/**
 * Probe script: loads a single stock page and logs ALL network requests
 * to find the specific API endpoint that returns the Morningstar report URL.
 */

import { chromium } from "playwright-core";
import { resolveBrowserExecutable } from "../src/server/browser-auth.js";

const SYMBOL = process.argv[2] || "PLTR";
const LOGIN_URL = "https://robinhood.com/login";
const STOCK_URL = `https://robinhood.com/stocks/${SYMBOL}`;

async function main() {
	const executablePath = resolveBrowserExecutable();
	const browser = await chromium.launch({
		headless: false,
		...(executablePath ? { executablePath } : { channel: "chrome" as const }),
	});

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const page = await context.newPage();

	// Log in first
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

	// Now intercept everything on the stock page
	const requests: { method: string; url: string; status?: number; body?: string }[] = [];

	page.on("request", (req) => {
		const url = req.url();
		// Only log API calls, skip static assets
		if (
			url.includes("api.robinhood.com") ||
			url.includes("bonfire.robinhood.com") ||
			url.includes("dora.robinhood.com") ||
			url.includes("midlands") ||
			url.includes("analyst") ||
			url.includes("morningstar") ||
			url.includes("research") ||
			url.includes("report")
		) {
			requests.push({ method: req.method(), url });
		}
	});

	page.on("response", async (resp) => {
		const url = resp.url();
		if (
			url.includes("analyst") ||
			url.includes("morningstar") ||
			url.includes("research") ||
			url.includes("report") ||
			url.includes("midlands.s3")
		) {
			let body = "";
			try {
				body = await resp.text();
				if (body.length > 2000) body = `${body.slice(0, 2000)}... [truncated]`;
			} catch {
				body = "[could not read body]";
			}
			console.log(`\n=== REPORT-RELATED RESPONSE ===`);
			console.log(`  URL: ${url}`);
			console.log(`  Status: ${resp.status()}`);
			console.log(`  Body: ${body}`);
			console.log(`===============================\n`);
		}
	});

	console.log(`Navigating to ${STOCK_URL}...`);
	await page.goto(STOCK_URL, { waitUntil: "networkidle" });

	// Scroll down to trigger lazy-loaded research section
	await page.evaluate(() => window.scrollBy(0, 3000));
	await new Promise((r) => setTimeout(r, 5000));

	// Print all captured API requests
	console.log("\n\n========== ALL API REQUESTS ==========");
	for (const req of requests) {
		console.log(`${req.method} ${req.url}`);
	}
	console.log(`\nTotal API requests: ${requests.length}`);

	// Also check the DOM for the report link
	const reportLinks = await page.$$eval("a[href]", (anchors) =>
		anchors
			.map((a) => ({ href: a.getAttribute("href"), text: a.textContent?.trim() }))
			.filter(
				(l) =>
					l.href?.includes("analyst") ||
					l.href?.includes("report") ||
					l.href?.includes("midlands") ||
					l.text?.includes("full report"),
			),
	);
	console.log("\n========== REPORT LINKS IN DOM ==========");
	for (const link of reportLinks) {
		console.log(`  text: "${link.text}" → href: ${link.href?.slice(0, 150)}...`);
	}

	await browser.close();
}

main().catch(console.error);
