/** L2 order book state — reconstructs sorted bid/ask levels from Order events. */

export interface OrderBookLevel {
  price: number;
  size: number;
  exchangeCode: string;
  count: number;
  time: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number | null;
  midpoint: number | null;
  lastUpdated: number;
  eventCount: number;
  stale: boolean;
}

export class OrderBook {
  private bids = new Map<number, OrderBookLevel>();
  private asks = new Map<number, OrderBookLevel>();
  private _lastUpdated = 0;
  private _eventCount = 0;
  private _stale = false;

  constructor(
    readonly symbol: string,
    private maxDepth = 50,
  ) {}

  /** Process a single Order event and update the book. */
  processEvent(event: Record<string, unknown>): void {
    const side = String(event.orderSide ?? event.ordeSide ?? "");
    const index = Number(event.index ?? 0);
    const price = Number(event.price ?? 0);
    const size = Number(event.size ?? 0);
    const exchangeCode = String(event.exchangeCode ?? "");
    const count = Number(event.count ?? 0);
    const time = Number(event.eventTime ?? 0);

    if (!side || !index) return;

    this._eventCount++;
    this._lastUpdated = Date.now();
    this._stale = false;

    const map = side === "BUY" ? this.bids : this.asks;

    if (size <= 0) {
      map.delete(index);
    } else {
      map.set(index, { price, size, exchangeCode, count, time });
    }
  }

  /** Return a sorted snapshot of the book, truncated to `depth` levels per side. */
  getSnapshot(depth?: number): OrderBookSnapshot {
    const d = depth ?? this.maxDepth;

    const bids = [...this.bids.values()].sort((a, b) => b.price - a.price).slice(0, d);

    const asks = [...this.asks.values()].sort((a, b) => a.price - b.price).slice(0, d);

    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;

    let spread: number | null = null;
    let midpoint: number | null = null;
    if (bestBid !== null && bestAsk !== null) {
      spread = bestAsk - bestBid;
      midpoint = (bestBid + bestAsk) / 2;
    }

    return {
      symbol: this.symbol,
      bids,
      asks,
      spread,
      midpoint,
      lastUpdated: this._lastUpdated,
      eventCount: this._eventCount,
      stale: this._stale,
    };
  }

  getBestBid(): OrderBookLevel | null {
    let best: OrderBookLevel | null = null;
    for (const level of this.bids.values()) {
      if (!best || level.price > best.price) best = level;
    }
    return best;
  }

  getBestAsk(): OrderBookLevel | null {
    let best: OrderBookLevel | null = null;
    for (const level of this.asks.values()) {
      if (!best || level.price < best.price) best = level;
    }
    return best;
  }

  /** Mark the book as stale (e.g. on disconnect). */
  markStale(): void {
    this._stale = true;
  }

  /** Clear all levels (e.g. on reconnect before re-subscribing). */
  reset(): void {
    this.bids.clear();
    this.asks.clear();
    this._eventCount = 0;
    this._stale = false;
  }
}
