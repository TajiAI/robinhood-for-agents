/** FEED channel manager — subscribe to event types and parse COMPACT data. */

import type { DxLinkClient } from "./dxlink-client.js";
import { EVENT_FIELDS, type EventType } from "./types.js";

type EventCallback = (events: Array<Record<string, unknown>>) => void;

interface ChannelState {
  eventType: EventType;
  channel: number;
  /** Field order as confirmed by FEED_CONFIG (or our requested order). */
  fields: string[];
  symbols: Set<string>;
  callbacks: EventCallback[];
}

export class DxLinkFeed {
  /** Maps event type → channel state. One channel per event type. */
  private channels = new Map<EventType, ChannelState>();

  constructor(private client: DxLinkClient) {
    this.client.on("message", this.handleMessage);
  }

  /**
   * Subscribe to an event type for the given symbols.
   * Opens a new channel if this event type hasn't been subscribed yet.
   */
  async subscribe(
    eventType: EventType,
    symbols: string[],
    callback: EventCallback,
  ): Promise<number> {
    let state = this.channels.get(eventType);

    if (!state) {
      // Open a new FEED channel
      const channel = await this.client.openChannel("FEED");
      const fields = [...EVENT_FIELDS[eventType]];

      state = {
        eventType,
        channel,
        fields,
        symbols: new Set(),
        callbacks: [],
      };
      this.channels.set(eventType, state);

      // Send FEED_SETUP
      this.client.send({
        type: "FEED_SETUP",
        channel,
        acceptDataFormat: "COMPACT",
        acceptEventFields: { [eventType]: fields },
      });

      // Wait for FEED_CONFIG
      const config = await this.client.waitFor(
        (msg) => msg.type === "FEED_CONFIG" && msg.channel === channel,
      );

      // Update field order from server response
      const serverFields = config.eventFields as Record<string, string[]> | undefined;
      if (serverFields?.[eventType]) {
        state.fields = serverFields[eventType];
      }
    }

    state.callbacks.push(callback);

    // Determine new symbols to subscribe
    const newSymbols = symbols.filter((s) => !state.symbols.has(s));
    if (newSymbols.length > 0) {
      for (const s of newSymbols) state.symbols.add(s);

      this.client.send({
        type: "FEED_SUBSCRIPTION",
        channel: state.channel,
        add: newSymbols.map((symbol) => ({ type: eventType, symbol })),
      });
    }

    return state.channel;
  }

  /** Unsubscribe specific symbols from an event type. */
  unsubscribe(eventType: EventType, symbols: string[]): void {
    const state = this.channels.get(eventType);
    if (!state) return;

    const toRemove = symbols.filter((s) => state.symbols.has(s));
    if (toRemove.length === 0) return;

    for (const s of toRemove) state.symbols.delete(s);

    this.client.send({
      type: "FEED_SUBSCRIPTION",
      channel: state.channel,
      remove: toRemove.map((symbol) => ({ type: eventType, symbol })),
    });
  }

  /** Remove a callback from an event type. */
  removeCallback(eventType: EventType, callback: EventCallback): void {
    const state = this.channels.get(eventType);
    if (!state) return;
    state.callbacks = state.callbacks.filter((cb) => cb !== callback);
  }

  /** Close all channels and reset state. */
  destroy(): void {
    this.client.off("message", this.handleMessage);
    for (const state of this.channels.values()) {
      try {
        this.client.closeChannel(state.channel);
      } catch {
        // Ignore if already disconnected
      }
    }
    this.channels.clear();
  }

  /**
   * Parse COMPACT FEED_DATA.
   *
   * Format: [eventType, [val1, val2, ...], [val1, val2, ...], ...]
   * Each array after the event type string is one event, with values
   * in the field order from FEED_CONFIG.
   */
  private parseCompactData(data: unknown[], fields: string[]): Array<Record<string, unknown>> {
    const events: Array<Record<string, unknown>> = [];
    let i = 0;

    while (i < data.length) {
      // Skip event type markers (strings)
      if (typeof data[i] === "string") {
        i++;
        continue;
      }

      // Each event is an array of values
      if (Array.isArray(data[i])) {
        const values = data[i] as unknown[];
        const event: Record<string, unknown> = {};
        for (let j = 0; j < fields.length && j < values.length; j++) {
          const fieldName = fields[j];
          if (fieldName !== undefined) {
            event[fieldName] = values[j];
          }
        }
        events.push(event);
      }
      i++;
    }
    return events;
  }

  private handleMessage = (msg: Record<string, unknown>): void => {
    if (msg.type !== "FEED_DATA") return;

    const channel = msg.channel as number;
    const data = msg.data as unknown[];
    if (!data || !Array.isArray(data)) return;

    // Find which channel state this belongs to
    for (const state of this.channels.values()) {
      if (state.channel === channel) {
        const events = this.parseCompactData(data, state.fields);
        for (const cb of state.callbacks) {
          cb(events);
        }
        break;
      }
    }
  };
}
