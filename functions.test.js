/**
 * mahjong.v1 session domain — 4 seats, fog of hands.
 */
import { beforeEach, describe, expect, it } from "vitest";
import handler from "./functions.js";
import {
  MAHJONG_PROTOCOL_ID,
  MAHJONG_ROLES,
  MAHJONG_STATE_KEY,
} from "./protocol.js";

function jsonRequest(path, { method = "GET", body } = {}) {
  return new Request(`https://sandbox.test${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

function mockKv(initial = {}) {
  const store = { ...initial };
  return {
    async get(key) {
      return store[key] ?? null;
    },
    async put(key, value) {
      store[key] = value;
    },
    _store: store,
  };
}

function emptySeated() {
  return { host: false, p2: false, p3: false, p4: false };
}

async function seedOpen(KV, extras = {}) {
  await KV.put(
    MAHJONG_STATE_KEY,
    JSON.stringify({
      sessionId: "sess-1",
      channelName: "playgrounds-session:sess-1",
      seq: 1,
      status: "waiting",
      seated: emptySeated(),
      names: ["主持", "席二", "席三", "席四"],
      game: {
        phase: "idle",
        message: "等候",
      },
      ...extras,
    }),
  );
}

describe("functions.js meta + open", () => {
  it("GET /api/session/meta returns mahjong.v1 four roles", async () => {
    const res = await handler.fetch(jsonRequest("/api/session/meta"), {
      KV: mockKv(),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.protocolId).toBe(MAHJONG_PROTOCOL_ID);
    expect(data.roles).toEqual([...MAHJONG_ROLES]);
  });

  it("POST /api/session/open seeds waiting store", async () => {
    const KV = mockKv();
    const res = await handler.fetch(
      jsonRequest("/api/session/open", {
        method: "POST",
        body: { sessionId: "sess-1", channelName: "ch-1" },
      }),
      { KV },
    );
    expect(res.status).toBe(200);
    const stored = JSON.parse(await KV.get(MAHJONG_STATE_KEY));
    expect(stored.sessionId).toBe("sess-1");
    expect(stored.status).toBe("waiting");
  });
});

describe("functions.js presence (4 seats)", () => {
  /** @type {ReturnType<typeof mockKv>} */
  let KV;

  beforeEach(() => {
    KV = mockKv();
  });

  it("becomes ready only when all four roles are seated", async () => {
    await seedOpen(KV);
    let res = await handler.fetch(
      jsonRequest("/api/session/presence", {
        method: "POST",
        body: { seatedRoles: ["host", "p2", "p3"] },
      }),
      { KV },
    );
    let data = await res.json();
    expect(data.state.status).toBe("waiting");

    res = await handler.fetch(
      jsonRequest("/api/session/presence", {
        method: "POST",
        body: { seatedRoles: ["host", "p2", "p3", "p4"] },
      }),
      { KV },
    );
    data = await res.json();
    expect(data.state.status).toBe("ready");
    expect(data.state.seatedCount).toBe(4);
  });
});

describe("functions.js acts", () => {
  /** @type {ReturnType<typeof mockKv>} */
  let KV;

  beforeEach(async () => {
    KV = mockKv();
    await seedOpen(KV, {
      status: "ready",
      seated: { host: true, p2: true, p3: true, p4: true },
    });
  });

  it("rejects non-host deal", async () => {
    const res = await handler.fetch(
      jsonRequest("/api/session/act", {
        method: "POST",
        body: { role: "p2", payload: { type: "deal" } },
      }),
      { KV },
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("role_forbidden");
  });

  it("host deal starts active match with fogged hands", async () => {
    const res = await handler.fetch(
      jsonRequest("/api/session/act", {
        method: "POST",
        body: { role: "host", payload: { type: "deal" } },
      }),
      { KV },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.state.status).toBe("active");
    expect(data.state.phase).toBe("playing");
    expect(data.state.seats[0].hand.length).toBeGreaterThan(0);
    expect(data.state.seats[1].hand).toEqual([]);

    const p2View = await handler.fetch(
      jsonRequest("/api/session/state?role=p2"),
      { KV },
    );
    const p2 = await p2View.json();
    expect(p2.seat).toBe(1);
    expect(p2.seats[1].hand.length).toBeGreaterThan(0);
    expect(p2.seats[0].hand).toEqual([]);
  });

  it("spectator cannot send game acts", async () => {
    const res = await handler.fetch(
      jsonRequest("/api/session/act", {
        method: "POST",
        body: {
          role: "spectator",
          payload: { type: "discard", seat: 0, tileId: 1 },
        },
      }),
      { KV },
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("role_forbidden");
  });
});
