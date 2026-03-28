# Research Report Crawler — Design Spec

## Goal

Build a Playwright-based crawler that downloads Morningstar research report PDFs from Robinhood for all stocks with market cap > $50M.

## Approach: API Interception Hybrid

Use Playwright for login and initial page navigation, but intercept underlying API calls for speed. Direct HTTP requests replace full page loads wherever possible.

## Script

**File:** `bin/fetch-research-reports.ts`

Standalone Bun script. Three stages run sequentially:

### Stage 1: Authentication

- Launch browser via existing `resolveBrowserExecutable()` from `src/server/browser-auth.ts`
- Navigate to `robinhood.com/login`
- User completes login manually (email, password, MFA)
- Detect successful login by watching for navigation away from `/login`
- Extract cookies from the browser context for later direct HTTP requests
- Keep browser context alive throughout the script

### Stage 2: Stock Discovery

- Navigate to Robinhood stock screener
- Set up `page.on("response")` to intercept API calls
- Apply market cap > $50M filter in the UI
- Capture the screener API endpoint, headers, and payload structure
- Replay the API call with pagination to collect all qualifying symbols
- Save to `research-reports/symbols.json`
- **Fallback:** If API replay fails, paginate the screener UI and scrape symbols from the rendered page

### Stage 3: Report Download

- For each symbol from the discovery list:
  - Navigate to `robinhood.com/stocks/{SYMBOL}`
  - Intercept network responses matching `robinhood-midlands.s3.amazonaws.com/analyst_report_pdf` or the API endpoint that returns the report URL
  - If report exists: extract pre-signed S3 URL, download PDF via `fetch()`, extract metadata
  - If no report: mark as skipped
  - ~2 sec delay between symbols
- Log progress to stdout

## Output Structure

```
research-reports/
  symbols.json              # Full list of discovered symbols
  progress.json             # Resume state
  AAPL/
    2026-02-15-morningstar-report.pdf
    metadata.json           # { title, date, author, fairValue, moat, uncertainty, stewardship }
  PLTR/
    2026-02-19-morningstar-report.pdf
    metadata.json
  ...
```

## Progress & Resume

`progress.json` schema:

```json
{
  "discovered": ["AAPL", "MSFT", ...],
  "completed": ["AAPL"],
  "skipped": ["XYZ"],
  "failed": ["ABC"],
  "lastRun": "2026-03-26T10:00:00Z"
}
```

On restart, skips symbols already in `completed` or `skipped`.

## Dependencies

- `playwright-core` (already in project)
- `resolveBrowserExecutable()` from `src/server/browser-auth.ts` (reuse)
- Native `fetch` for PDF downloads (Bun built-in)
- `fs` for file I/O

## Rate Limiting

- 2-second delay between stock page navigations
- Download PDFs via direct fetch (no page load needed)
- If rate-limited (HTTP 429), exponential backoff with 3 retries

## Risks

- Robinhood screener API structure is unknown until we intercept it — fallback to UI scraping
- Pre-signed S3 URLs expire — download immediately after capture
- Morningstar reports only cover ~1,500-2,000 stocks — most small-caps will be skipped
- Long-running script (~1-2 hours) — progress file enables resume
