/**
 * Streaming test fixtures — real protocol shapes from HAR captures and
 * Robinhood Legend WebSocket observations.
 *
 * These fixtures can replay a full dxLink session: handshake → feed setup →
 * subscriptions → FEED_DATA events for all 5 event types.  Prices are based
 * on real SPY/NFLX market data (2026-03-18) with account-identifying fields
 * redacted.
 */

// ---------------------------------------------------------------------------
// Symbol & time constants
// ---------------------------------------------------------------------------

export const SYMBOL = "SPY";
export const CANDLE_SYMBOL = `${SYMBOL}{=5m,tho=false,a=m}`;
/** Baseline epoch ms — 2026-03-18 14:00 ET (market hours). */
export const BASE_TIME = 1742320800000;
/** 5-minute candle step in ms. */
export const CANDLE_STEP = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Channel layout (matches Legend's pattern: one per event type, odd IDs)
// ---------------------------------------------------------------------------

export const CHANNELS = {
  Trade: 1,
  TradeETH: 3,
  Quote: 5,
  Candle: 7,
  Order: 9,
} as const;

// ---------------------------------------------------------------------------
// Handshake sequence (channel 0)
// ---------------------------------------------------------------------------

export const HANDSHAKE = {
  /** Client → server */
  clientSetup: {
    type: "SETUP",
    channel: 0,
    version: "0.1-DXF-JS/0.5.1",
    keepaliveTimeout: 60,
    acceptKeepaliveTimeout: 60,
  },
  /** Server → client (from HAR: version "1.0-2.2.3", source "rh_md") */
  serverSetup: {
    type: "SETUP",
    channel: 0,
    keepaliveTimeout: 60,
    acceptKeepaliveTimeout: 60,
    version: "1.0-2.2.3",
    source: "rh_md",
  },
  /** Client → server */
  auth: {
    type: "AUTH",
    channel: 0,
    token: "REDACTED_STREAMING_TOKEN",
  },
  /**
   * Client → server (optional, sent after AUTH).
   * Observed in Legend HAR — not required for streaming to work.
   */
  mdSetup: {
    type: "MD_SETUP",
    enable_heartbeat_timestamp: true,
    enable_logging_raw_incoming_message: false,
    enable_subscription_debugging: false,
  },
  /**
   * Server → client: sends UNAUTHORIZED first, then AUTHORIZED.
   * Both arrive in quick succession during token validation.
   */
  authStateUnauthorized: {
    type: "AUTH_STATE",
    channel: 0,
    state: "UNAUTHORIZED",
  },
  authStateAuthorized: {
    type: "AUTH_STATE",
    channel: 0,
    state: "AUTHORIZED",
  },
  keepalive: {
    type: "KEEPALIVE",
    channel: 0,
  },
} as const;

// ---------------------------------------------------------------------------
// Streaming token response (from /marketdata/token/v1/)
// ---------------------------------------------------------------------------

export const STREAMING_TOKEN_RESPONSE = {
  status: "SUCCESS",
  data: {
    status: "SUCCESS",
    data: {
      token: "REDACTED_STREAMING_TOKEN",
      wss_url: "wss://api.robinhood.com/marketdata/streaming/legend/v2/",
      expiration: "2026-03-18T22:16:27.000Z",
      ttl_ms: "14400000",
      dxfeed_id: "REDACTED_DXFEED_ID",
    },
  },
};

// ---------------------------------------------------------------------------
// Channel open sequence
// ---------------------------------------------------------------------------

export function channelRequest(channel: number) {
  return {
    type: "CHANNEL_REQUEST",
    channel,
    service: "FEED",
    parameters: { contract: "AUTO" },
  };
}

export function channelOpened(channel: number) {
  return {
    type: "CHANNEL_OPENED",
    channel,
    service: "FEED",
    version: 1,
    parameters: { contract: "AUTO", subFormat: "LIST" },
  };
}

// ---------------------------------------------------------------------------
// FEED_SETUP + FEED_CONFIG per event type
// ---------------------------------------------------------------------------

export const FEED_SETUPS = {
  Trade: {
    setup: {
      type: "FEED_SETUP",
      channel: CHANNELS.Trade,
      acceptDataFormat: "FULL",
      acceptAggregationPeriod: 0.25,
      acceptEventFields: {
        Trade: [
          "eventType",
          "eventSymbol",
          "eventTime",
          "price",
          "size",
          "change",
          "dayVolume",
          "exchangeCode",
          "tickDirection",
        ],
      },
    },
    config: {
      type: "FEED_CONFIG",
      channel: CHANNELS.Trade,
      dataFormat: "FULL",
      aggregationPeriod: 0.25,
      eventFields: {
        Trade: [
          "eventType",
          "eventSymbol",
          "eventTime",
          "price",
          "size",
          "change",
          "dayVolume",
          "exchangeCode",
          "tickDirection",
        ],
      },
    },
  },

  TradeETH: {
    setup: {
      type: "FEED_SETUP",
      channel: CHANNELS.TradeETH,
      acceptDataFormat: "FULL",
      acceptAggregationPeriod: 0.25,
      acceptEventFields: {
        TradeETH: [
          "eventType",
          "eventSymbol",
          "eventTime",
          "price",
          "size",
          "change",
          "dayVolume",
          "exchangeCode",
          "tickDirection",
        ],
      },
    },
    config: {
      type: "FEED_CONFIG",
      channel: CHANNELS.TradeETH,
      dataFormat: "FULL",
      aggregationPeriod: 0.25,
      eventFields: {
        TradeETH: [
          "eventType",
          "eventSymbol",
          "eventTime",
          "price",
          "size",
          "change",
          "dayVolume",
          "exchangeCode",
          "tickDirection",
        ],
      },
    },
  },

  Quote: {
    setup: {
      type: "FEED_SETUP",
      channel: CHANNELS.Quote,
      acceptDataFormat: "FULL",
      acceptAggregationPeriod: 0.25,
      acceptEventFields: {
        Quote: [
          "eventType",
          "eventSymbol",
          "eventTime",
          "bidPrice",
          "bidSize",
          "bidExchangeCode",
          "bidTime",
          "askPrice",
          "askSize",
          "askExchangeCode",
          "askTime",
        ],
      },
    },
    config: {
      type: "FEED_CONFIG",
      channel: CHANNELS.Quote,
      dataFormat: "FULL",
      aggregationPeriod: 0.25,
      eventFields: {
        Quote: [
          "eventType",
          "eventSymbol",
          "eventTime",
          "bidPrice",
          "bidSize",
          "bidExchangeCode",
          "bidTime",
          "askPrice",
          "askSize",
          "askExchangeCode",
          "askTime",
        ],
      },
    },
  },

  Candle: {
    /** Observed from Legend: channel 7, acceptAggregationPeriod 0.25 */
    setup: {
      type: "FEED_SETUP",
      channel: CHANNELS.Candle,
      acceptAggregationPeriod: 0.25,
      acceptEventFields: {
        Candle: [
          "close",
          "eventFlags",
          "eventSymbol",
          "eventType",
          "eventTime",
          "high",
          "impVolatility",
          "low",
          "open",
          "openInterest",
          "time",
          "volume",
          "vwap",
          "sequence",
          "count",
        ],
      },
    },
    config: {
      type: "FEED_CONFIG",
      channel: CHANNELS.Candle,
      dataFormat: "FULL",
      aggregationPeriod: 0.25,
      eventFields: {
        Candle: [
          "close",
          "eventFlags",
          "eventSymbol",
          "eventType",
          "eventTime",
          "high",
          "impVolatility",
          "low",
          "open",
          "openInterest",
          "time",
          "volume",
          "vwap",
          "sequence",
          "count",
        ],
      },
    },
  },

  Order: {
    setup: {
      type: "FEED_SETUP",
      channel: CHANNELS.Order,
      acceptDataFormat: "FULL",
      acceptAggregationPeriod: 0.25,
      acceptEventFields: {
        Order: [
          "eventFlags",
          "eventSymbol",
          "eventType",
          "index",
          "side",
          "sequence",
          "price",
          "size",
          "time",
        ],
      },
    },
    config: {
      type: "FEED_CONFIG",
      channel: CHANNELS.Order,
      dataFormat: "FULL",
      aggregationPeriod: 0.25,
      eventFields: {
        Order: [
          "eventFlags",
          "eventSymbol",
          "eventType",
          "index",
          "side",
          "sequence",
          "price",
          "size",
          "time",
        ],
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// FEED_SUBSCRIPTION messages
// ---------------------------------------------------------------------------

export const SUBSCRIPTIONS = {
  /** Initial subscriptions for a symbol (with reset: true) */
  initial(symbol: string) {
    const candleSym = `${symbol}{=5m,tho=false,a=m}`;
    return {
      trade: {
        type: "FEED_SUBSCRIPTION",
        channel: CHANNELS.Trade,
        reset: true,
        add: [{ type: "Trade", symbol }],
      },
      tradeETH: {
        type: "FEED_SUBSCRIPTION",
        channel: CHANNELS.TradeETH,
        reset: true,
        add: [{ type: "TradeETH", symbol }],
      },
      quote: {
        type: "FEED_SUBSCRIPTION",
        channel: CHANNELS.Quote,
        reset: true,
        add: [{ type: "Quote", symbol }],
      },
      candle: {
        type: "FEED_SUBSCRIPTION",
        channel: CHANNELS.Candle,
        reset: true,
        add: [
          {
            type: "Candle",
            symbol: candleSym,
            fromTime: 10000000000,
            instrumentType: "equity",
          },
        ],
      },
      order: {
        type: "FEED_SUBSCRIPTION",
        channel: CHANNELS.Order,
        reset: true,
        add: [{ type: "Order", symbol, source: "NTV" }],
      },
    };
  },

  /**
   * Candle interval change sequence — observed from Legend.
   * Legend adds the new interval first, then removes the old ~30s later.
   */
  candleIntervalChange: {
    /** NFLX 5m → 2m: add new interval */
    addNew: {
      type: "FEED_SUBSCRIPTION",
      channel: CHANNELS.Candle,
      add: [
        {
          fromTime: 10000000000,
          instrumentType: "equity",
          symbol: "NFLX{=2m,tho=false,a=m}",
          type: "Candle",
        },
      ],
    },
    /** NFLX 5m → 2m: remove old interval (~30s after add) */
    removeOld: {
      type: "FEED_SUBSCRIPTION",
      channel: CHANNELS.Candle,
      remove: [
        {
          fromTime: 10000000000,
          instrumentType: "equity",
          symbol: "NFLX{=5m,tho=false,a=m}",
          type: "Candle",
        },
      ],
    },
    /** NFLX 2m → 1h */
    addHourly: {
      type: "FEED_SUBSCRIPTION",
      channel: CHANNELS.Candle,
      add: [
        {
          fromTime: 10000000000,
          instrumentType: "equity",
          symbol: "NFLX{=h,tho=false,a=m}",
          type: "Candle",
        },
      ],
    },
    /** NFLX remove 2m after switching to 1h */
    remove2m: {
      type: "FEED_SUBSCRIPTION",
      channel: CHANNELS.Candle,
      remove: [
        {
          fromTime: 10000000000,
          instrumentType: "equity",
          symbol: "NFLX{=2m,tho=false,a=m}",
          type: "Candle",
        },
      ],
    },
    /** NFLX 1h → 30s */
    add30s: {
      type: "FEED_SUBSCRIPTION",
      channel: CHANNELS.Candle,
      add: [
        {
          fromTime: 10000000000,
          instrumentType: "equity",
          symbol: "NFLX{=30s,tho=false,a=m}",
          type: "Candle",
        },
      ],
    },
    /** NFLX remove 1h after switching to 30s */
    removeHourly: {
      type: "FEED_SUBSCRIPTION",
      channel: CHANNELS.Candle,
      remove: [
        {
          fromTime: 10000000000,
          instrumentType: "equity",
          symbol: "NFLX{=h,tho=false,a=m}",
          type: "Candle",
        },
      ],
    },
  },
} as const;

// ---------------------------------------------------------------------------
// FEED_DATA events — realistic market data based on SPY 2026-03-18
// (open 668.35, high 669.72, low 661.23, close 661.57)
// ---------------------------------------------------------------------------

/** Generate a Trade FEED_DATA message. */
export function tradeEvent(
  symbol: string,
  price: number,
  size: number,
  opts: {
    change?: number;
    dayVolume?: number;
    exchangeCode?: string;
    tickDirection?: string;
    time?: number;
  } = {},
) {
  return {
    type: "FEED_DATA",
    channel: CHANNELS.Trade,
    data: [
      {
        eventType: "Trade",
        eventSymbol: symbol,
        eventTime: opts.time ?? BASE_TIME,
        price,
        size,
        change: opts.change ?? price - 670.79, // from previous close
        dayVolume: opts.dayVolume ?? 45_000_000,
        exchangeCode: opts.exchangeCode ?? "Q",
        tickDirection: opts.tickDirection ?? "UPTICK",
      },
    ],
  };
}

/** Generate a TradeETH FEED_DATA message. */
export function tradeETHEvent(
  symbol: string,
  price: number,
  size: number,
  opts: {
    change?: number;
    dayVolume?: number;
    time?: number;
  } = {},
) {
  return {
    type: "FEED_DATA",
    channel: CHANNELS.TradeETH,
    data: [
      {
        eventType: "TradeETH",
        eventSymbol: symbol,
        eventTime: opts.time ?? BASE_TIME,
        price,
        size,
        change: opts.change ?? price - 670.79,
        dayVolume: opts.dayVolume ?? 2_500_000,
        exchangeCode: "Q",
        tickDirection: "DOWNTICK",
      },
    ],
  };
}

/** Generate a Quote FEED_DATA message. */
export function quoteEvent(
  symbol: string,
  bidPrice: number,
  askPrice: number,
  opts: {
    bidSize?: number;
    askSize?: number;
    bidExchangeCode?: string;
    askExchangeCode?: string;
    time?: number;
  } = {},
) {
  const t = opts.time ?? BASE_TIME;
  return {
    type: "FEED_DATA",
    channel: CHANNELS.Quote,
    data: [
      {
        eventType: "Quote",
        eventSymbol: symbol,
        eventTime: t,
        bidPrice,
        bidSize: opts.bidSize ?? 126,
        bidExchangeCode: opts.bidExchangeCode ?? "Q",
        bidTime: t,
        askPrice,
        askSize: opts.askSize ?? 126,
        askExchangeCode: opts.askExchangeCode ?? "Q",
        askTime: t,
      },
    ],
  };
}

/** Generate a Candle FEED_DATA message. */
export function candleEvent(
  symbol: string,
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  opts: {
    eventFlags?: number;
    count?: number;
    vwap?: number;
    impVolatility?: number;
    openInterest?: number;
    sequence?: number;
  } = {},
) {
  return {
    type: "FEED_DATA",
    channel: CHANNELS.Candle,
    data: [
      {
        eventType: "Candle",
        eventSymbol: symbol,
        eventTime: time + 1000,
        time,
        open,
        high,
        low,
        close,
        volume,
        count: opts.count ?? Math.round(volume / 200),
        vwap: opts.vwap ?? (open + high + low + close) / 4,
        impVolatility: opts.impVolatility ?? 0.185,
        openInterest: opts.openInterest ?? null,
        eventFlags: opts.eventFlags ?? 0,
        sequence: opts.sequence ?? 0,
      },
    ],
  };
}

/** Generate an Order (L2) FEED_DATA message. */
export function orderEvent(
  symbol: string,
  side: "BUY" | "SELL",
  price: number,
  size: number,
  index: string,
  opts: {
    eventFlags?: number;
    sequence?: number;
    time?: number;
  } = {},
) {
  return {
    type: "FEED_DATA",
    channel: CHANNELS.Order,
    data: [
      {
        eventFlags: opts.eventFlags ?? 0,
        eventSymbol: symbol,
        eventType: "Order",
        index,
        side,
        sequence: opts.sequence ?? 0,
        price,
        size,
        time: opts.time ?? BASE_TIME,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Complete session: 10 candles + interspersed quotes/trades/orders
// Simulates an intraday SPY session around the 661-669 range.
// ---------------------------------------------------------------------------

/**
 * Returns a time-ordered array of FEED_DATA messages that replays a realistic
 * ~50-minute SPY session.  Feed these into a mock DxLinkClient to hydrate the
 * stream-viewer chart with all components (candles, L2 book, quotes, trades).
 */
export function replaySession(symbol = SYMBOL) {
  const cs = `${symbol}{=5m,tho=false,a=m}`;
  const events: Array<Record<string, unknown>> = [];

  // 10 candles of 5-minute data (SPY intraday 2026-03-18)
  const candles = [
    { o: 668.35, h: 669.10, l: 667.80, c: 668.72, v: 4_200_000 },
    { o: 668.72, h: 669.72, l: 668.50, c: 669.55, v: 3_800_000 },
    { o: 669.55, h: 669.70, l: 668.90, c: 669.10, v: 3_500_000 },
    { o: 669.10, h: 669.30, l: 667.50, c: 667.80, v: 5_100_000 },
    { o: 667.80, h: 668.20, l: 666.40, c: 666.55, v: 6_200_000 },
    { o: 666.55, h: 667.10, l: 665.80, c: 666.90, v: 4_400_000 },
    { o: 666.90, h: 667.00, l: 664.20, c: 664.50, v: 7_800_000 },
    { o: 664.50, h: 665.30, l: 663.80, c: 665.10, v: 5_600_000 },
    { o: 665.10, h: 665.50, l: 661.23, c: 661.80, v: 9_200_000 },
    { o: 661.80, h: 662.30, l: 661.10, c: 661.57, v: 8_400_000 },
  ];

  let dayVolume = 20_000_000;
  let seq = 0;

  for (let i = 0; i < candles.length; i++) {
    const t = BASE_TIME + i * CANDLE_STEP;
    const c = candles[i]!;
    dayVolume += c.v;

    // Candle event
    events.push(
      candleEvent(cs, t, c.o, c.h, c.l, c.c, c.v, {
        count: Math.round(c.v / 200),
        vwap: +(((c.o + c.h + c.l + c.c) / 4).toFixed(2)),
        sequence: seq++,
      }),
    );

    // Trade at close price
    events.push(
      tradeEvent(symbol, c.c, 100 + Math.floor(Math.random() * 400), {
        change: +(c.c - 670.79).toFixed(2),
        dayVolume,
        tickDirection: c.c >= c.o ? "UPTICK" : "DOWNTICK",
        time: t + CANDLE_STEP - 1000,
      }),
    );

    // Quote at close bid/ask
    const spread = 0.01 + Math.random() * 0.04;
    events.push(
      quoteEvent(symbol, +(c.c - spread / 2).toFixed(2), +(c.c + spread / 2).toFixed(2), {
        bidSize: 100 + Math.floor(Math.random() * 500),
        askSize: 100 + Math.floor(Math.random() * 500),
        time: t + CANDLE_STEP - 500,
      }),
    );

    // L2 order book: 3 bid levels + 3 ask levels around close
    for (let lvl = 0; lvl < 3; lvl++) {
      const bidPrice = +(c.c - 0.01 * (lvl + 1)).toFixed(2);
      const askPrice = +(c.c + 0.01 * (lvl + 1)).toFixed(2);
      events.push(
        orderEvent(symbol, "BUY", bidPrice, 200 + lvl * 100, `${22047776527353334 + i * 10 + lvl}`, {
          sequence: seq++,
          time: t + CANDLE_STEP - 200,
        }),
      );
      events.push(
        orderEvent(symbol, "SELL", askPrice, 150 + lvl * 100, `${22047776527353334 + i * 10 + lvl + 5}`, {
          sequence: seq++,
          time: t + CANDLE_STEP - 200,
        }),
      );
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Real FEED_DATA: NFLX equity candle (from Legend WS capture 2026-03-20)
// Symbol: NFLX{=2m,tho=false,a=m}  (2-minute candles)
// ---------------------------------------------------------------------------

/** First 10 candles from the real NFLX equity stream (most recent first). */
export const REAL_EQUITY_CANDLE_DATA = {
  /** Full handshake + setup sequence observed from HAR */
  feedSetup: {
    type: "FEED_SETUP",
    channel: CHANNELS.Candle,
    acceptAggregationPeriod: 0.25,
    acceptEventFields: {
      Candle: [
        "close",
        "eventFlags",
        "eventSymbol",
        "eventType",
        "eventTime",
        "high",
        "impVolatility",
        "low",
        "open",
        "openInterest",
        "time",
        "volume",
        "vwap",
        "sequence",
        "count",
      ],
    },
  },
  feedConfig: {
    type: "FEED_CONFIG",
    channel: 1,
    dataFormat: "FULL",
    aggregationPeriod: 0.25,
    eventFields: {
      Candle: [
        "close",
        "eventFlags",
        "eventSymbol",
        "eventType",
        "eventTime",
        "high",
        "impVolatility",
        "low",
        "open",
        "openInterest",
        "time",
        "volume",
        "vwap",
        "sequence",
        "count",
      ],
    },
  },
  /** First 10 equity candles — note: impVolatility is a real number, volume can be fractional. */
  candles: [
    {
      close: 91.305,
      eventFlags: 4,
      eventSymbol: "NFLX{=2m,tho=false,a=m}",
      eventType: "Candle",
      eventTime: 0,
      high: 91.33,
      impVolatility: 0.4476,
      low: 91.17,
      open: 91.175,
      openInterest: "NaN",
      time: 1774024560000,
      volume: 144494.0,
      vwap: 91.2798793811508,
      sequence: 0,
      count: 1294,
    },
    {
      close: 91.175,
      eventFlags: 0,
      eventSymbol: "NFLX{=2m,tho=false,a=m}",
      eventType: "Candle",
      eventTime: 0,
      high: 91.235,
      impVolatility: 0.4472,
      low: 91.1,
      open: 91.12,
      openInterest: "NaN",
      time: 1774024440000,
      volume: 127965.0,
      vwap: 91.1641940429024,
      sequence: 0,
      count: 2047,
    },
    {
      close: 91.125,
      eventFlags: 0,
      eventSymbol: "NFLX{=2m,tho=false,a=m}",
      eventType: "Candle",
      eventTime: 0,
      high: 91.13,
      impVolatility: 0.4478,
      low: 91.01,
      open: 91.08,
      openInterest: "NaN",
      time: 1774024320000,
      volume: 164001.915024,
      vwap: 91.0505962413658,
      sequence: 0,
      count: 1840,
    },
    {
      close: 91.085,
      eventFlags: 0,
      eventSymbol: "NFLX{=2m,tho=false,a=m}",
      eventType: "Candle",
      eventTime: 0,
      high: 91.18,
      impVolatility: 0.448,
      low: 91.07,
      open: 91.15,
      openInterest: "NaN",
      time: 1774024200000,
      volume: 83451.0,
      vwap: 91.1173756503817,
      sequence: 0,
      count: 1446,
    },
    {
      close: 91.15,
      eventFlags: 0,
      eventSymbol: "NFLX{=2m,tho=false,a=m}",
      eventType: "Candle",
      eventTime: 0,
      high: 91.24,
      impVolatility: 0.4481,
      low: 91.15,
      open: 91.2,
      openInterest: "NaN",
      time: 1774024080000,
      volume: 81225.967918,
      vwap: 91.1946087820296,
      sequence: 0,
      count: 1456,
    },
    {
      close: 91.2,
      eventFlags: 0,
      eventSymbol: "NFLX{=2m,tho=false,a=m}",
      eventType: "Candle",
      eventTime: 0,
      high: 91.24,
      impVolatility: 0.4488,
      low: 91.15,
      open: 91.225,
      openInterest: "NaN",
      time: 1774023960000,
      volume: 62242.081226,
      vwap: 91.1908368183925,
      sequence: 0,
      count: 1121,
    },
    {
      close: 91.23,
      eventFlags: 0,
      eventSymbol: "NFLX{=2m,tho=false,a=m}",
      eventType: "Candle",
      eventTime: 0,
      high: 91.335,
      impVolatility: 0.4474,
      low: 91.23,
      open: 91.335,
      openInterest: "NaN",
      time: 1774023840000,
      volume: 58210.0,
      vwap: 91.282849687339,
      sequence: 0,
      count: 1182,
    },
    {
      close: 91.335,
      eventFlags: 0,
      eventSymbol: "NFLX{=2m,tho=false,a=m}",
      eventType: "Candle",
      eventTime: 0,
      high: 91.355,
      impVolatility: 0.4482,
      low: 91.26,
      open: 91.3,
      openInterest: "NaN",
      time: 1774023720000,
      volume: 48933.0,
      vwap: 91.3222819590052,
      sequence: 0,
      count: 975,
    },
    {
      close: 91.3,
      eventFlags: 0,
      eventSymbol: "NFLX{=2m,tho=false,a=m}",
      eventType: "Candle",
      eventTime: 0,
      high: 91.3351,
      impVolatility: 0.4479,
      low: 91.245,
      open: 91.28,
      openInterest: "NaN",
      time: 1774023600000,
      volume: 56707.0,
      vwap: 91.2884222318232,
      sequence: 0,
      count: 1168,
    },
    {
      close: 91.2855,
      eventFlags: 0,
      eventSymbol: "NFLX{=2m,tho=false,a=m}",
      eventType: "Candle",
      eventTime: 0,
      high: 91.42,
      impVolatility: 0.4471,
      low: 91.26,
      open: 91.37,
      openInterest: "NaN",
      time: 1774023480000,
      volume: 70834.0,
      vwap: 91.3467613095406,
      sequence: 0,
      count: 1304,
    },
  ],
} as const;

/**
 * Key observations from real NFLX equity candle data (vs options candles):
 *
 * 1. `impVolatility` has real numeric values (e.g., 0.4476) — not "NaN" like options
 * 2. `volume` has real numeric values, sometimes fractional (e.g., 164001.915024)
 *    — fractional shares are common in modern equity trading
 * 3. `openInterest` is still string "NaN" (equities don't have open interest)
 * 4. `eventFlags: 4` on live candle, `0` on historical — same as options
 * 5. Channel 1 — Legend opens Candle on the first channel
 * 6. Prices use sub-dollar precision (e.g., 91.305, 91.2798793811508 for vwap)
 * 7. `count` field shows trade count per candle (e.g., 1294, 2047)
 * 8. Legend sends FEED_SETUP *twice*: first without acceptEventFields (agg-only),
 *    then with full field list
 */

// ---------------------------------------------------------------------------
// Real FEED_DATA: SPXW options candle (from Legend WS capture 2026-03-20)
// Symbol: .SPXW260323C6570{=2m,a=m,price=mark}  (SPX weekly call, 6570 strike)
// Note: options candles use `price=mark` (not `tho=false`), volume is "NaN",
// impVolatility is "NaN", openInterest is "NaN".
// ---------------------------------------------------------------------------

/** First 10 candles from the real SPXW options stream (most recent first). */
export const REAL_OPTIONS_CANDLE_DATA = {
  feedConfig: {
    type: "FEED_CONFIG",
    channel: 11,
    dataFormat: "FULL",
    aggregationPeriod: 0.25,
    eventFields: {
      Candle: [
        "close",
        "eventFlags",
        "eventSymbol",
        "eventType",
        "eventTime",
        "high",
        "impVolatility",
        "low",
        "open",
        "openInterest",
        "time",
        "volume",
        "vwap",
        "sequence",
        "count",
      ],
    },
  },
  /** First batch: most recent candle has eventFlags: 4 (TX_PENDING), rest have 0. */
  candles: [
    {
      close: 31.7,
      eventFlags: 4,
      eventSymbol: ".SPXW260323C6570{=2m,a=m,price=mark}",
      eventType: "Candle",
      eventTime: 0,
      high: 31.9,
      impVolatility: "NaN",
      low: 30.25,
      open: 31.3,
      openInterest: "NaN",
      time: 1774024320000,
      volume: "NaN",
      vwap: 31.1678410794603,
      sequence: 0,
      count: 667,
    },
    {
      close: 31.35,
      eventFlags: 0,
      eventSymbol: ".SPXW260323C6570{=2m,a=m,price=mark}",
      eventType: "Candle",
      eventTime: 0,
      high: 34.8,
      impVolatility: "NaN",
      low: 31.05,
      open: 34.75,
      openInterest: "NaN",
      time: 1774024200000,
      volume: "NaN",
      vwap: 32.780926916221,
      sequence: 0,
      count: 1122,
    },
    {
      close: 34.7,
      eventFlags: 0,
      eventSymbol: ".SPXW260323C6570{=2m,a=m,price=mark}",
      eventType: "Candle",
      eventTime: 0,
      high: 35.5,
      impVolatility: "NaN",
      low: 33.9,
      open: 34.85,
      openInterest: "NaN",
      time: 1774024080000,
      volume: "NaN",
      vwap: 34.82252681764,
      sequence: 0,
      count: 839,
    },
    {
      close: 34.8,
      eventFlags: 0,
      eventSymbol: ".SPXW260323C6570{=2m,a=m,price=mark}",
      eventType: "Candle",
      eventTime: 0,
      high: 36.0,
      impVolatility: "NaN",
      low: 33.9,
      open: 35.85,
      openInterest: "NaN",
      time: 1774023960000,
      volume: "NaN",
      vwap: 34.8063735177866,
      sequence: 0,
      count: 1012,
    },
    {
      close: 35.9,
      eventFlags: 0,
      eventSymbol: ".SPXW260323C6570{=2m,a=m,price=mark}",
      eventType: "Candle",
      eventTime: 0,
      high: 37.25,
      impVolatility: "NaN",
      low: 35.5,
      open: 36.85,
      openInterest: "NaN",
      time: 1774023840000,
      volume: "NaN",
      vwap: 36.4563769751693,
      sequence: 0,
      count: 886,
    },
    {
      close: 36.8,
      eventFlags: 0,
      eventSymbol: ".SPXW260323C6570{=2m,a=m,price=mark}",
      eventType: "Candle",
      eventTime: 0,
      high: 38.0,
      impVolatility: "NaN",
      low: 36.0,
      open: 36.9,
      openInterest: "NaN",
      time: 1774023720000,
      volume: "NaN",
      vwap: 37.0120082815735,
      sequence: 0,
      count: 966,
    },
    {
      close: 36.85,
      eventFlags: 0,
      eventSymbol: ".SPXW260323C6570{=2m,a=m,price=mark}",
      eventType: "Candle",
      eventTime: 0,
      high: 38.05,
      impVolatility: "NaN",
      low: 36.3,
      open: 37.35,
      openInterest: "NaN",
      time: 1774023600000,
      volume: "NaN",
      vwap: 37.0876208897486,
      sequence: 0,
      count: 1034,
    },
    {
      close: 37.3,
      eventFlags: 0,
      eventSymbol: ".SPXW260323C6570{=2m,a=m,price=mark}",
      eventType: "Candle",
      eventTime: 0,
      high: 37.35,
      impVolatility: "NaN",
      low: 35.2,
      open: 36.05,
      openInterest: "NaN",
      time: 1774023480000,
      volume: "NaN",
      vwap: 36.2628189550425,
      sequence: 0,
      count: 823,
    },
    {
      close: 36.0,
      eventFlags: 0,
      eventSymbol: ".SPXW260323C6570{=2m,a=m,price=mark}",
      eventType: "Candle",
      eventTime: 0,
      high: 36.05,
      impVolatility: "NaN",
      low: 33.2,
      open: 34.7,
      openInterest: "NaN",
      time: 1774023360000,
      volume: "NaN",
      vwap: 34.2478935698448,
      sequence: 0,
      count: 902,
    },
    {
      close: 34.7,
      eventFlags: 0,
      eventSymbol: ".SPXW260323C6570{=2m,a=m,price=mark}",
      eventType: "Candle",
      eventTime: 0,
      high: 35.85,
      impVolatility: "NaN",
      low: 33.9,
      open: 35.45,
      openInterest: "NaN",
      time: 1774023240000,
      volume: "NaN",
      vwap: 34.8431868131868,
      sequence: 0,
      count: 910,
    },
  ],
} as const;

/**
 * Key observations from real options candle data:
 *
 * 1. Options candle symbol format: `.SPXW260323C6570{=2m,a=m,price=mark}`
 *    - Dot prefix for options
 *    - `price=mark` instead of `tho=false` (mark price, not trade price)
 *    - No `tho` parameter at all
 *
 * 2. Fields with "NaN" string values: `impVolatility`, `volume`, `openInterest`
 *    - These are string "NaN", not null or number — must handle in parsing
 *
 * 3. `eventTime: 0` on all historical candles (only live candle gets real eventTime)
 *
 * 4. `eventFlags: 4` on the most recent (live) candle = TX_PENDING
 *    (candle is still accumulating, not finalized)
 *
 * 5. Candles arrive newest-first in the initial backfill batch
 *
 * 6. Channel 11 — options get their own channel (not shared with equity candle ch 7)
 */

// ---------------------------------------------------------------------------
// REST API fixtures (from HAR: robinhood.com 2026-03-18)
// ---------------------------------------------------------------------------

/** REST quote response shape — /marketdata/quotes/ */
export const REST_QUOTE = {
  ask_price: "660.920000",
  ask_size: 126,
  venue_ask_time: "2026-03-18T23:49:45.569818873Z",
  bid_price: "660.800000",
  bid_size: 126,
  venue_bid_time: "2026-03-18T23:49:45.569818873Z",
  last_trade_price: "661.570000",
  venue_last_trade_time: "2026-03-18T19:59:59.88243213Z",
  last_extended_hours_trade_price: "660.740000",
  last_non_reg_trade_price: "660.740000",
  venue_last_non_reg_trade_time: "2026-03-18T23:49:41.783351644Z",
  previous_close: "670.790000",
  adjusted_previous_close: "670.790000",
  previous_close_date: "2026-03-17",
  symbol: "SPY",
  trading_halted: false,
  has_traded: true,
  last_trade_price_source: "nls",
  last_non_reg_trade_price_source: "nls",
  updated_at: "2026-03-18T23:49:45Z",
  instrument: "https://api.robinhood.com/instruments/INSTRUMENT_ID/",
  instrument_id: "INSTRUMENT_ID",
  state: "active",
};

/** REST fundamentals response — /marketdata/fundamentals/{id}/ */
export const REST_FUNDAMENTALS = {
  open: "668.350000",
  high: "669.720000",
  low: "661.230000",
  volume: "82027641.000000",
  market_date: "2026-03-18",
  average_volume_2_weeks: "91480677.517744",
  average_volume: "91480677.517744",
  high_52_weeks: "697.840000",
  low_52_weeks: "481.800000",
  market_cap: "664171369982.119995",
  pb_ratio: "5.085829",
  pe_ratio: "26.661580",
  shares_outstanding: "1003932116.000000",
  description:
    "SPY tracks a market cap-weighted index of US large- and mid-cap stocks selected by the S&P Committee.",
};

/** Crypto historicals sample — /marketdata/forex/historicals/ (DOGEUSD) */
export const CRYPTO_HISTORICALS_SAMPLE = [
  {
    begins_at: "2026-03-17T23:45:00Z",
    open_price: "0.100163655",
    close_price: "0.100395135",
    high_price: "0.100395725",
    low_price: "0.10008735",
    volume: 0,
    session: "reg",
    interpolated: false,
  },
  {
    begins_at: "2026-03-17T23:50:00Z",
    open_price: "0.100395135",
    close_price: "0.10015707",
    high_price: "0.10040304",
    low_price: "0.10012783",
    volume: 0,
    session: "reg",
    interpolated: false,
  },
];

/** Feature flags observed for streaming — /kaizen/experiments/ */
export const STREAMING_FLAGS = [
  { name: "bw-dxfeed-timeout-measurement", variation: "control" },
  { name: "bw-dxfeed-unsubscribe-timeout-variable", variation: "member" },
  { name: "bw-md-streaming-client", variation: "member" },
  { name: "bw-md-streaming-client-logging", variation: "member" },
];
