# Unified Stock Data Crawler

Downloads Morningstar research report PDFs plus hedge fund trends, insider trends, short interest, earnings, and key statistics from Robinhood for all stocks above a market cap threshold.

## Quick Start

```bash
# First run — opens browser for login, discovers stocks, fetches all data
bun bin/fetch-research-reports.ts

# Resume after interruption (skips already-processed stocks)
bun bin/fetch-research-reports.ts --resume

# Test specific stocks
bun bin/fetch-research-reports.ts --symbols AAPL,PLTR,MSFT

# Use a specific browser
bun bin/fetch-research-reports.ts --chrome /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome
```

## How It Works

Three stages, run sequentially:

### Stage 1: Authentication

Playwright opens a browser window for manual login. The user completes login (email, password, MFA) — the script never interacts with the DOM. After detecting a successful redirect away from `/login`, it:

1. Navigates to `robinhood.com/` to trigger background API calls
2. Intercepts the `Authorization: Bearer ...` header from any `api.robinhood.com` request
3. Extracts browser cookies from the Playwright context
4. Closes the browser — it's no longer needed

The captured auth headers and cookies are used for all subsequent `fetch()` calls.

### Stage 2: Stock Discovery

Two-pass process using the Robinhood REST API:

**Pass 1 — Enumerate all tradable stocks:**

Paginates `GET https://api.robinhood.com/instruments/?active_instruments_only=true`, collecting every instrument where `type=stock`, `state=active`, `tradability=tradable`. Each page returns ~100 instruments. This yields the full Robinhood stock universe (~10,000+ instruments) along with their instrument UUIDs.

- Endpoint: `GET /instruments/?active_instruments_only=true`
- Pagination: cursor-based via `next` field
- Rate: 300ms delay between pages
- Output: array of `{ symbol, instrumentId }` pairs

**Pass 2 — Filter by market cap:**

Batches of 10 symbols are sent to the fundamentals endpoint. Stocks with `market_cap > $50M` are kept.

- Endpoint: `GET /fundamentals/?symbols=AAPL,MSFT,...` (comma-separated, up to 10)
- Filter: `market_cap` field (string, parsed as float) > 50,000,000
- Rate: 200ms delay between batches
- Output: ~4,000 qualifying stocks (as of March 2026)

Results are saved to `research-reports/symbols-v2.json` (with instrument IDs) and `research-reports/symbols.json` (symbols only).

### Stage 3: Fetch All Data

For each qualifying stock, **8 API calls fire concurrently** via `Promise.allSettled()`:

| # | Endpoint | Output File | Description |
|---|----------|-------------|-------------|
| 1 | `GET /discovery/ratings/{id}/overview/` | `metadata.json` + PDF | Morningstar research report |
| 2 | `GET /marketdata/hedgefunds/summary/{id}/` | `hedge-funds-summary.json` | Quarterly hedge fund buying/selling |
| 3 | `GET /marketdata/hedgefunds/transactions/{id}/` | `hedge-funds-transactions.json` | Per-fund breakdown (manager, institution, action, shares) |
| 4 | `GET /marketdata/insiders/summary/{id}/` | `insiders-summary.json` | Monthly insider buying/selling |
| 5 | `GET /marketdata/insiders/transactions/{id}/` | `insiders-transactions.json` | Per-insider breakdown (name, position, type, amount) |
| 6 | `GET /marketdata/fundamentals/short/v1/?ids={id}` | `short-interest.json` | Short interest data (90-day window) |
| 7 | `GET /marketdata/earnings/?symbol={SYM}` | `earnings.json` | EPS estimated vs actual per quarter |
| 8 | `GET /fundamentals/{SYM}/` | `fundamentals.json` | Key statistics (PE, market cap, dividend, etc.) |

- All 8 calls run in parallel per stock, then a 200ms delay before the next stock
- 404/403 responses are silently skipped (not all stocks have all data types)
- A stock is marked `completed` once all endpoints have been attempted
- Rate: ~200 stocks/minute (~15 minutes for all 4,000 stocks)
- Coverage: Morningstar PDFs for ~790 stocks; hedge fund/insider/earnings data for most stocks

## Output Structure

```
research-reports/
  symbols.json                       # Array of all qualifying ticker symbols
  symbols-v2.json                    # Array of { symbol, instrumentId } pairs
  progress.json                      # Resume state (see below)
  AAPL/
    2026-03-07-Apple-s-....pdf       # Morningstar research report PDF
    metadata.json                    # Morningstar report metadata
    hedge-funds-summary.json         # Quarterly hedge fund buy/sell aggregates
    hedge-funds-transactions.json    # Per-fund breakdown (Warren Buffett, etc.)
    insiders-summary.json            # Monthly insider buy/sell aggregates
    insiders-transactions.json       # Per-insider breakdown (Tim Cook, etc.)
    short-interest.json              # Short interest data (90-day window)
    earnings.json                    # EPS estimated vs actual per quarter
    fundamentals.json                # Key stats (PE, market cap, div yield, etc.)
  PLTR/
    2026-02-02-Palantir-....pdf
    metadata.json
    hedge-funds-summary.json
    hedge-funds-transactions.json
    insiders-summary.json
    insiders-transactions.json
    short-interest.json
    earnings.json
    fundamentals.json
  ...
```

### metadata.json

```json
{
  "symbol": "AAPL",
  "instrumentId": "450dfc6d-5510-4d40-abfb-f633b7d9be3e",
  "title": "Apple's Fortressed Software Ecosystem Drives Strong Unit Sales Growth and Profitability",
  "date": "2026-03-07",
  "author": "morningstar",
  "fairValue": "260.0000",
  "moat": "wide",
  "uncertainty": "medium",
  "stewardship": "exemplary",
  "starRating": "3",
  "pdfUrl": "https://robinhood-midlands.s3.amazonaws.com/analyst_report_pdf/..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `symbol` | string | Ticker symbol |
| `instrumentId` | string | Robinhood instrument UUID |
| `title` | string | Morningstar report title |
| `date` | string | Report update date (YYYY-MM-DD) |
| `author` | string | Always `"morningstar"` currently |
| `fairValue` | string\|null | Morningstar's estimated fair value (e.g., `"260.0000"`) |
| `moat` | string\|null | Economic moat: `"wide"`, `"narrow"`, `"none"` |
| `uncertainty` | string\|null | Fair value uncertainty: `"low"`, `"medium"`, `"high"`, `"very_high"` |
| `stewardship` | string\|null | Management quality: `"exemplary"`, `"standard"`, `"poor"` |
| `starRating` | string\|null | Morningstar stars: `"1"` through `"5"` (valuation vs fair value) |
| `pdfUrl` | string | Pre-signed S3 URL used to download (expires) |

### progress.json

```json
{
  "discovered": ["A", "AA", "AAPL", "..."],
  "completed": ["A", "AA", "AAPL", "..."],
  "skipped": ["AACB", "AAME", "..."],
  "failed": ["XYZ"],
  "lastRun": "2026-03-26T23:30:09.000Z"
}
```

| Field | Description |
|-------|-------------|
| `discovered` | All symbols that passed the market cap filter |
| `completed` | Symbols where a report was successfully downloaded |
| `skipped` | Symbols with no Morningstar report (404 or no `download_url`) |
| `failed` | Symbols where an error occurred (network timeout, API error) |
| `lastRun` | ISO timestamp of last progress save |

On `--resume`, the script skips anything already in `completed` or `skipped`. Stocks in `failed` are retried.

## API Endpoints Used

### 1. Instruments (stock universe)

```
GET https://api.robinhood.com/instruments/?active_instruments_only=true
Authorization: Bearer {access_token}
```

Paginated list of all tradable instruments. Each result includes:

| Field | Type | Used for |
|-------|------|----------|
| `id` | UUID | Instrument ID — needed for all other endpoints |
| `symbol` | string | Ticker symbol |
| `type` | string | Filter for `"stock"` (vs `"adr"`, `"etp"`, etc.) |
| `state` | string | Filter for `"active"` |
| `tradability` | string | Filter for `"tradable"` |

Pagination via `next` field (full URL to next page, or `null`).

### 2. Fundamentals (market cap filter)

```
GET https://api.robinhood.com/fundamentals/?symbols=AAPL,MSFT,GOOG
Authorization: Bearer {access_token}
```

Batch lookup of fundamental data. Up to ~10 symbols per request (comma-separated).

| Field | Type | Used for |
|-------|------|----------|
| `market_cap` | string\|null | Market capitalization as a decimal string (e.g., `"3450000000000.00"`) |

Returns `{ results: [{ market_cap, ... }, null, ...] }`. Null entries correspond to symbols with no fundamental data.

### 3. Discovery Ratings Overview (the key endpoint)

```
GET https://api.robinhood.com/discovery/ratings/{instrumentId}/overview/
Authorization: Bearer {access_token}
```

Returns Morningstar research report metadata and PDF download URL. This is the critical endpoint that makes the crawler fast — one API call per stock instead of loading a full web page.

**Response (when report exists):**

| Field | Type | Description |
|-------|------|-------------|
| `download_url` | string | Pre-signed S3 URL: `https://robinhood-midlands.s3.amazonaws.com/analyst_report_pdf/{uuid}?AWSAccessKeyId=...&Signature=...&x-amz-security-token=...&Expires=...` |
| `report_title` | string | Full report title |
| `report_published_at` | string | ISO 8601 initial publication date |
| `report_updated_at` | string | ISO 8601 last update date |
| `source` | string | `"morningstar"` |
| `star_rating` | string | `"1"` to `"5"` |
| `fair_value` | object | `{ "amount": "260.0000", "currency_code": "USD" }` |
| `economic_moat` | string | `"wide"`, `"narrow"`, `"none"` |
| `uncertainty` | string | `"low"`, `"medium"`, `"high"`, `"very_high"` |
| `stewardship` | string | `"exemplary"`, `"standard"`, `"poor"` |

**Response codes:**

| Status | Meaning |
|--------|---------|
| `200` | Report exists — check `download_url` field |
| `404` | No Morningstar coverage for this instrument |
| `401` | Not authenticated |
| `403` | May require Robinhood Gold subscription |

**S3 PDF URL anatomy:**

```
https://robinhood-midlands.s3.amazonaws.com/analyst_report_pdf/{report-uuid}
  ?response-content-type=application%2Fpdf
  &AWSAccessKeyId={temporary-key}
  &Signature={request-signature}
  &x-amz-security-token={STS-session-token}
  &Expires={unix-timestamp}
```

- URLs are pre-signed with temporary AWS STS credentials
- Expiration is typically ~1 hour from generation
- The PDF UUID is stable per report (same UUID across requests for the same stock)
- No authentication needed to download — the signature in the URL is the auth

## Discovery Process

This endpoint was found by:

1. Loading `robinhood.com/stocks/PLTR` in Playwright with full network interception
2. Logging all requests to `api.robinhood.com`, `dora.robinhood.com`, and `bonfire.robinhood.com`
3. Identifying that the PDF link was rendered in the DOM but the research data came from an API
4. Probing candidate endpoints (`/discovery/ratings/`, `/midlands/ratings/`, `/dora/feed/`, etc.)
5. `GET /discovery/ratings/{instrumentId}/overview/` returned the full report metadata + download URL

The probe scripts used for this discovery are preserved at:
- `bin/probe-report-api.ts` — intercepts all network traffic on a stock page
- `bin/probe-dora-api.ts` — tests candidate API endpoints directly

## Performance

| Approach | Speed | Time for 4,006 stocks |
|----------|-------|-----------------------|
| v1: Full page load per stock (Playwright) | ~6 stocks/min | ~11 hours |
| v2: Direct API call per stock (`fetch()`) | ~450 stocks/min | ~13 minutes |

v2 is **75x faster** because:
- No browser process after login (Playwright closes after auth capture)
- One HTTP request per stock instead of ~20+ (page load triggers charts, news, similar stocks, etc.)
- 200ms delay vs 2-5 seconds per stock
- No DOM rendering, no JavaScript execution

## Refreshing Reports

Reports are updated periodically by Morningstar (typically monthly). To refresh:

```bash
# Delete progress to re-download everything
rm research-reports/progress.json
bun bin/fetch-research-reports.ts

# Or just delete specific symbols to refresh them
rm -rf research-reports/AAPL research-reports/MSFT
# Then edit progress.json to remove AAPL/MSFT from completed[]
bun bin/fetch-research-reports.ts --resume
```

## Limitations

- **Robinhood Gold required** — Morningstar reports are a Gold subscription feature
- **~790 stocks covered** — Morningstar covers primarily large and mid-cap US equities
- **Pre-signed URLs expire** — download immediately after fetching, don't cache URLs
- **Auth token lifetime** — Bearer tokens last ~8.5 days but the crawler finishes in ~15 min
- **No incremental updates** — the script downloads the full PDF even if unchanged; compare `report_updated_at` dates to detect changes
