# Options MCP Tools Reference

## robinhood_get_options
Get options chain with greeks for a stock or index symbol.

**Parameters:**
- `symbol` (string, required) — stock or index ticker (SPX, NDX, VIX, RUT, XSP supported)
- `expiration_date` (string, optional) — filter by date "YYYY-MM-DD"
- `strike_price` (number, optional) — filter by strike
- `option_type` (enum: "call", "put", optional)
- `max_strikes` (number, optional) — limit to N strikes nearest to current price (ATM). Ignored when `strike_price` is set. Useful for large chains like SPX.

**Response (equity):**
```json
{
  "chain_info": {
    "id": "chain-uuid",
    "symbol": "AAPL",
    "expiration_dates": ["2025-01-17", "2025-02-21", ...]
  },
  "options": [{
    "url": "...",
    "id": "option-uuid",
    "type": "call",
    "strike_price": "150.0000",
    "expiration_date": "2025-01-17",
    "state": "active",
    "tradability": "tradable",
    "chain_id": "chain-uuid",
    "chain_symbol": "AAPL"
  }],
  "market_data": [{
    "adjusted_mark_price": "3.50",
    "ask_price": "3.60",
    "bid_price": "3.40",
    "delta": "0.5500",
    "gamma": "0.0300",
    "theta": "-0.0500",
    "vega": "0.2000",
    "rho": "0.0100",
    "implied_volatility": "0.3000",
    "open_interest": 15000,
    "volume": 5000,
    "chance_of_profit_long": "0.4200",
    "chance_of_profit_short": "0.5800",
    "high_price": "4.00",
    "low_price": "3.00",
    "last_trade_price": "3.50"
  }]
}
```

**Response (index — additional field):**
```json
{
  "index_value": {
    "value": "5700.00",
    "symbol": "SPX",
    "instrument_id": "432fbbb8-...",
    "updated_at": "2026-03-10T17:59:38Z"
  },
  "chain_info": {
    "id": "chain-uuid",
    "symbol": "SPXW",
    "expiration_dates": ["2026-03-10", "2026-03-11", ...]
  },
  "options": [...]
}
```

**Notes:**
- `market_data` is only included when all three filter parameters (`expiration_date`, `strike_price`, `option_type`) are provided.
- `index_value` is only included for index symbols.
- **Chain selection**: For indexes with multiple chains (e.g. SPXW weeklies + SPX monthlies), the tool auto-selects based on `expiration_date`. SPXW (daily expirations, PM-settled) is preferred by default. SPX monthly (AM-settled) is selected only when the expiration is a monthly-only date.
- **After hours**: Options `state` and `tradability` may differ outside market hours. The client returns all instruments matching the filters regardless of state, so options are discoverable even when the market is closed.

## robinhood_place_option_order
Place a single-leg or multi-leg option order (spreads, iron condors, etc.). See `robinhood-trade/reference.md` for full parameter details.

## robinhood_get_orders
Use with `order_type: "option"` to view option orders.
Use with `status: "open"` to see only active orders.
