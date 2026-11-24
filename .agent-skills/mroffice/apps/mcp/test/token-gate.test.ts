// A hosted server's check of each caller's token (src/token-gate.ts): a token
// with office.convert alone is a caller; a token disconnected in MR Office is
// refused within CHECK_TTL_MS; MR Office unreachable is neither yes nor no.

import assert from "node:assert/strict";
import { test } from "node:test";

import { CHECK_TTL_MS, tokenGate } from "../src/token-gate.ts";

function fakeApi() {
  const live = new Map<string, string>([["mro_at_convert", "office.convert"]]);
  const calls: { url: string; authorization: string | null }[] = [];
  let down = false;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const authorization = new Headers(init?.headers).get("authorization");
    calls.push({ url: String(url), authorization });
    if (down) throw new TypeError("fetch failed");
    const token = authorization?.replace(/^Bearer /, "") ?? "";
    const scope = live.get(token);
    if (scope === undefined) return new Response(JSON.stringify({ error: "invalid_token" }), { status: 401 });
    return new Response(JSON.stringify({ active: true, scope, sub: "u1", aud: "https://mcp.mroffice.ai/mcp" }), { status: 200 });
  }) as typeof fetch;
  return { live, calls, fetchImpl, setDown: (value: boolean) => { down = value; } };
}

test("a token with office.convert alone is a caller, checked with token-info about itself", async () => {
  const api = fakeApi();
  const gate = tokenGate({ apiUrl: "https://mroffice.ai", fetchImpl: api.fetchImpl });
  const result = await gate.check("mro_at_convert");
  assert.deepEqual(result, { state: "active", scopes: ["office.convert"], sub: "u1", aud: "https://mcp.mroffice.ai/mcp" });
  assert.deepEqual(api.calls, [{ url: "https://mroffice.ai/api/v1/oauth/token-info", authorization: "Bearer mro_at_convert" }]);
  assert.deepEqual(await gate.check("mro_at_other"), { state: "inactive" });
});

test("a disconnected token is refused within the check's lifetime, and a burst costs one check", async () => {
  const api = fakeApi();
  let clock = 1_000_000;
  const gate = tokenGate({ apiUrl: "https://mroffice.ai", fetchImpl: api.fetchImpl, now: () => clock });
  const burst = await Promise.all([gate.check("mro_at_convert"), gate.check("mro_at_convert"), gate.check("mro_at_convert")]);
  assert.ok(burst.every((item) => item.state === "active"));
  assert.equal(api.calls.length, 1);
  api.live.delete("mro_at_convert"); // disconnected in Settings
  clock += CHECK_TTL_MS - 1;
  assert.equal((await gate.check("mro_at_convert")).state, "active");
  clock += 2;
  assert.equal((await gate.check("mro_at_convert")).state, "inactive");
  assert.ok(CHECK_TTL_MS <= 5_000);
});

test("MR Office unreachable is not a bad token and is not remembered", async () => {
  const api = fakeApi();
  const gate = tokenGate({ apiUrl: "https://mroffice.ai", fetchImpl: api.fetchImpl });
  api.setDown(true);
  assert.deepEqual(await gate.check("mro_at_convert"), { state: "unavailable" });
  api.setDown(false);
  assert.equal((await gate.check("mro_at_convert")).state, "active");
  assert.equal(api.calls.length, 2);
});
