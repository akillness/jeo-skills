// How a hosted server (MROFFICE_MCP_AUTH=oauth) checks each caller's bearer
// token with MR Office: GET /api/v1/oauth/token-info with the token itself,
// which answers for any of our scopes (office.convert alone included) and
// only about the token presented. An answer is kept CHECK_TTL_MS: a token
// disconnected in MR Office's settings is refused here within that time,
// and a burst of MCP requests on one token costs one check. An unreachable
// MR Office is not remembered, and is not reported as a bad token.

import { createHash } from "node:crypto";

/** How long one check of a token stands (live or not). */
export const CHECK_TTL_MS = 5_000;
const MAX_ENTRIES = 10_000;

export type TokenCheck =
  | { readonly state: "active"; readonly scopes: readonly string[]; readonly sub: string; readonly aud: string | null }
  | { readonly state: "inactive" }
  /** MR Office could not be asked: neither yes nor no. */
  | { readonly state: "unavailable" };

export interface TokenGateOptions {
  readonly apiUrl: string;
  readonly ttlMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

export function tokenGate(options: TokenGateOptions): { check(token: string): Promise<TokenCheck> } {
  const ttl = options.ttlMs ?? CHECK_TTL_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const known = new Map<string, { result: TokenCheck; until: number }>();
  const asking = new Map<string, Promise<TokenCheck>>();

  async function ask(token: string): Promise<TokenCheck> {
    const response = await fetchImpl(`${options.apiUrl}/api/v1/oauth/token-info`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!response) return { state: "unavailable" };
    if (response.status === 401 || response.status === 403) return { state: "inactive" };
    if (!response.ok) return { state: "unavailable" };
    const body = (await response.json().catch(() => null)) as { active?: unknown; scope?: unknown; sub?: unknown; aud?: unknown } | null;
    if (!body || body.active !== true || typeof body.sub !== "string") return { state: "inactive" };
    const scopes = typeof body.scope === "string" ? body.scope.split(" ").filter(Boolean) : [];
    return { state: "active", scopes, sub: body.sub, aud: typeof body.aud === "string" ? body.aud : null };
  }

  return {
    async check(token: string): Promise<TokenCheck> {
      const key = createHash("sha256").update(token).digest("hex");
      const hit = known.get(key);
      if (hit && hit.until > now()) return hit.result;
      const pending = asking.get(key);
      if (pending) return pending;
      const question = ask(token).then((result) => {
        if (result.state !== "unavailable") {
          if (known.size >= MAX_ENTRIES) known.clear();
          known.set(key, { result, until: now() + ttl });
        }
        return result;
      });
      asking.set(key, question);
      try {
        return await question;
      } finally {
        asking.delete(key);
      }
    },
  };
}
