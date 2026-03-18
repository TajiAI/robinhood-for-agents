import { describe, expect, it, vi } from "vitest";
import { DxLinkFeed } from "../../../src/client/streaming/feed.js";

/** Minimal mock of DxLinkClient for testing the feed layer. */
function createMockClient() {
  let messageHandler: ((msg: Record<string, unknown>) => void) | null = null;

  return {
    on: vi.fn((event: string, handler: (msg: Record<string, unknown>) => void) => {
      if (event === "message") messageHandler = handler;
    }),
    off: vi.fn(),
    send: vi.fn(),
    openChannel: vi.fn().mockResolvedValue(3),
    closeChannel: vi.fn(),
    waitFor: vi.fn().mockResolvedValue({
      type: "FEED_CONFIG",
      channel: 3,
      dataFormat: "COMPACT",
      eventFields: {
        Order: [
          "eventType",
          "eventSymbol",
          "eventTime",
          "index",
          "ordeSide",
          "scope",
          "price",
          "size",
          "exchangeCode",
          "source",
          "marketMaker",
          "count",
        ],
      },
    }),
    /** Simulate a server message. */
    simulateMessage(msg: Record<string, unknown>) {
      messageHandler?.(msg);
    },
  };
}

describe("DxLinkFeed", () => {
  it("opens a channel and sends FEED_SETUP + FEED_SUBSCRIPTION", async () => {
    const mock = createMockClient();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const feed = new DxLinkFeed(mock as any);

    const callback = vi.fn();
    await feed.subscribe("Order", ["SPY"], callback);

    // Should have sent FEED_SETUP
    expect(mock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "FEED_SETUP",
        channel: 3,
        acceptDataFormat: "COMPACT",
      }),
    );

    // Should have sent FEED_SUBSCRIPTION
    expect(mock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "FEED_SUBSCRIPTION",
        channel: 3,
        add: [{ type: "Order", symbol: "SPY" }],
      }),
    );
  });

  it("reuses existing channel for same event type", async () => {
    const mock = createMockClient();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const feed = new DxLinkFeed(mock as any);

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    await feed.subscribe("Order", ["SPY"], cb1);
    await feed.subscribe("Order", ["AAPL"], cb2);

    // openChannel should only be called once
    expect(mock.openChannel).toHaveBeenCalledTimes(1);

    // Second subscription should add AAPL
    expect(mock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "FEED_SUBSCRIPTION",
        add: [{ type: "Order", symbol: "AAPL" }],
      }),
    );
  });

  it("does not re-subscribe already subscribed symbols", async () => {
    const mock = createMockClient();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const feed = new DxLinkFeed(mock as any);

    const cb = vi.fn();
    await feed.subscribe("Order", ["SPY"], cb);

    // Reset to track only new calls
    mock.send.mockClear();
    await feed.subscribe("Order", ["SPY"], cb);

    // Should NOT send another FEED_SUBSCRIPTION (SPY already subscribed)
    const subCalls = mock.send.mock.calls.filter(
      (c: unknown[]) => (c[0] as Record<string, unknown>).type === "FEED_SUBSCRIPTION",
    );
    expect(subCalls).toHaveLength(0);
  });

  it("dispatches parsed COMPACT data to callbacks", async () => {
    const mock = createMockClient();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const feed = new DxLinkFeed(mock as any);

    const callback = vi.fn();
    await feed.subscribe("Order", ["SPY"], callback);

    // Simulate FEED_DATA with COMPACT format
    mock.simulateMessage({
      type: "FEED_DATA",
      channel: 3,
      data: [
        "Order",
        ["Order", "SPY", 1710000000, 12345, "BUY", "AGGREGATE", 500.5, 200, "Q", "NTV", "", 3],
      ],
    });

    expect(callback).toHaveBeenCalledTimes(1);
    const events = callback.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventSymbol: "SPY",
      price: 500.5,
      size: 200,
      ordeSide: "BUY",
    });
  });

  it("sends unsubscribe for removed symbols", async () => {
    const mock = createMockClient();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const feed = new DxLinkFeed(mock as any);

    await feed.subscribe("Order", ["SPY"], vi.fn());
    feed.unsubscribe("Order", ["SPY"]);

    expect(mock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "FEED_SUBSCRIPTION",
        remove: [{ type: "Order", symbol: "SPY" }],
      }),
    );
  });

  it("ignores non-FEED_DATA messages", async () => {
    const mock = createMockClient();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const feed = new DxLinkFeed(mock as any);

    const callback = vi.fn();
    await feed.subscribe("Order", ["SPY"], callback);

    mock.simulateMessage({ type: "KEEPALIVE", channel: 0 });
    expect(callback).not.toHaveBeenCalled();
  });
});
