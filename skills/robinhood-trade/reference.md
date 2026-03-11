# Trading MCP Tools Reference

## Stock Orders

### robinhood_place_stock_order
Place a stock order. Supports market, limit, stop, stop-limit, and trailing stop. Order type is inferred from price parameters (e.g., providing `limit_price` makes it a limit order).

**Parameters:**
- `symbol` (string, required) — stock ticker
- `side` (enum: "buy", "sell", required)
- `quantity` (number, required) — shares (supports fractional)
- `limit_price` (number, optional) — required for limit/stop_limit
- `stop_price` (number, optional) — required for stop/stop_limit
- `trail_amount` (number, optional) — required for trailing_stop
- `trail_type` (enum: "percentage", "amount", default: "percentage")
- `account_number` (string, required)
- `time_in_force` (enum: "gtc", "gfd", default: "gtc")
- `extended_hours` (boolean, default: false)

**Response:**
```json
{
  "status": "submitted",
  "order": { "id": "order-uuid", "state": "queued", "side": "buy", "type": "limit", ... }
}
```

## Option Orders

### robinhood_place_option_order
Place a single-leg or multi-leg option order (spreads, iron condors, straddles, etc.).

**Parameters:**
- `symbol` (string, required) — underlying ticker
- `legs` (array, required) — each: `{ expiration_date, strike, option_type, side, position_effect, ratio_quantity }`
- `price` (number, required) — limit price (single-leg) or net price (spreads)
- `quantity` (number, required) — number of contracts
- `direction` (enum: "debit", "credit", required)
- `stop_price` (number, optional) — triggers stop-limit
- `time_in_force` (enum: "gtc", "gfd", "ioc", "opg", default: "gfd")
- `account_number` (string, required)

## Crypto Orders

### robinhood_place_crypto_order
Place a crypto order.

**Parameters:**
- `symbol` (string, required) — e.g., "BTC", "ETH"
- `side` (enum: "buy", "sell", required)
- `amount_or_quantity` (number, required)
- `amount_in` (enum: "quantity", "price", default: "quantity") — what amount_or_quantity represents
- `order_type` (enum: "market", "limit", default: "market")
- `limit_price` (number, optional) — required for limit orders

## Order Query

### robinhood_get_orders
Get orders filtered by type and status.

**Parameters:**
- `order_type` (enum: "stock", "option", "crypto", default: "stock")
- `status` (enum: "open", "all", default: "all")
- `account_number` (string, optional)
- `limit` (number, default: 50) — max orders to return

## Cancel

### robinhood_cancel_order
Cancel an order by ID.

**Parameters:**
- `order_id` (string, required) — the order UUID
- `order_type` (enum: "stock", "option", "crypto", default: "stock")

## BLOCKED Operations (never use)
- Bulk cancel operations
- Fund transfers (withdraw/deposit)
