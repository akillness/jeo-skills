// Signing in to MR Office from this machine (OAuth 2.1, RFC 8252 loopback):
// the server is a public client of MR Office's authorization server. It finds
// the server's metadata (RFC 8414), identifies itself by its client ID
// metadata document when the server reads those over https, or registers
// (RFC 7591) otherwise, sends the person's browser to the consent page with a
// PKCE challenge and a redirect to a one-off port on 127.0.0.1, and trades
// the code for tokens. The tokens are kept in a file only this user can read
// (credentials.json in the config folder), per MR Office address, and the
// access token is refreshed (rotating the refresh token) when it runs out.

import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

/** The client ID metadata document this server publishes (apps/web/public/mcp/client.json). */
export const CLIENT_METADATA_URL = "https://mroffice.ai/mcp/client.json";
export const SCOPES = "office.convert account.read";
const CALLBACK_PATH = "/callback";
const LOGIN_TIMEOUT_MS = 5 * 60_000;

export interface Credentials {
  readonly clientId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Epoch ms. */
  readonly expiresAt: number;
  readonly scope: string;
  readonly account?: { readonly email: string; readonly name: string };
}

interface Metadata {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly registration_endpoint?: string;
  readonly revocation_endpoint?: string;
  readonly userinfo_endpoint?: string;
  readonly client_id_metadata_document_supported?: boolean;
}

export class NotSignedIn extends Error {
  constructor(what: string, signInUrl?: string) {
    super(
      signInUrl
        ? `${what} needs your MR Office account. MR Office's sign-in page is open in your browser (or open ${signInUrl}); allow it there, then try again.`
        : `${what} needs your MR Office account. Call the sign_in tool (or run \`npx -y mroffice-mcp login\` in a terminal), allow it in the browser, then try again.`,
    );
  }
}

/** How long a tool call that needs the account waits for a sign-in it
 * started itself: under the usual tool timeout of the apps (about a minute),
 * so the app hears "allow it in the browser" rather than a timeout. */
export const FIRST_USE_SIGN_IN_WAIT_MS = 45_000;

function configDir(): string {
  const base = process.env.MROFFICE_MCP_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "mroffice-mcp");
  mkdirSync(base, { recursive: true, mode: 0o700 });
  return base;
}

function credentialsPath(): string {
  return join(configDir(), "credentials.json");
}

/** Credentials per MR Office address; `client:<address>` keeps the id this app registered there. */
type Store = Record<string, Credentials | { registeredClientId: string }>;

function readStore(): Store {
  const path = credentialsPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  const path = credentialsPath();
  writeFileSync(`${path}.tmp`, JSON.stringify(store, null, 2), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
  chmodSync(path, 0o600);
}

const base64url = (bytes: Buffer) => bytes.toString("base64url");

async function postForm(url: string, form: Record<string, string>): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams(form), signal: AbortSignal.timeout(30_000) });
}

/** MR Office's sign-in for one address (https://mroffice.ai, or a local stack). */
export class Account {
  readonly apiUrl: string;
  private metadata: Promise<Metadata> | null = null;
  private refreshing: Promise<Credentials> | null = null;
  private pendingLogin: { url: string; done: Promise<Credentials> } | null = null;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl.replace(/\/+$/, "");
  }

  /** The resource the tokens are for: MR Office's API (RFC 8707). */
  get resource(): string {
    return `${this.apiUrl}/api`;
  }

  credentials(): Credentials | null {
    const entry = readStore()[this.apiUrl];
    return entry && "accessToken" in entry ? entry : null;
  }

  get signedIn(): boolean {
    return this.credentials() !== null;
  }

  private discover(): Promise<Metadata> {
    if (!this.metadata) {
      this.metadata = (async () => {
        const response = await fetch(`${this.apiUrl}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(`MR Office at ${this.apiUrl} does not offer sign-in for apps yet (${response.status}).`);
        return (await response.json()) as Metadata;
      })();
      this.metadata.catch(() => (this.metadata = null));
    }
    return this.metadata;
  }

  private async clientId(metadata: Metadata): Promise<string> {
    // the published metadata document, where the server can read it (only over public https)
    if (metadata.client_id_metadata_document_supported && new URL(this.apiUrl).protocol === "https:") return CLIENT_METADATA_URL;
    const known = readStore()[`client:${this.apiUrl}`];
    if (known && "registeredClientId" in known) return known.registeredClientId;
    if (!metadata.registration_endpoint) throw new Error("MR Office's sign-in offers no way for this app to identify itself.");
    const response = await fetch(metadata.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "MR Office MCP server",
        redirect_uris: [`http://127.0.0.1${CALLBACK_PATH}`],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        software_id: "mroffice-mcp",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`MR Office refused to register this app (${response.status}).`);
    const registered = (await response.json()) as { client_id: string };
    const next = readStore();
    next[`client:${this.apiUrl}`] = { registeredClientId: registered.client_id };
    writeStore(next);
    return registered.client_id;
  }

  /** Starts a sign-in: the URL to open, and the credentials once the person allowed it. */
  async startLogin(openBrowser = true): Promise<{ url: string; done: Promise<Credentials> }> {
    if (this.pendingLogin) return this.pendingLogin;
    const metadata = await this.discover();
    const verifier = base64url(randomBytes(48));
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    const state = base64url(randomBytes(16));
    let finish!: (code: string) => void;
    let fail!: (error: Error) => void;
    const codeArrived = new Promise<string>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    const server: Server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== CALLBACK_PATH) {
        response.writeHead(404).end();
        return;
      }
      const ok = url.searchParams.get("state") === state && url.searchParams.get("code");
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        `<!doctype html><meta charset=utf-8><title>MR Office</title><body style="font:16px system-ui;max-width:480px;margin:20vh auto;padding:0 20px">` +
          (ok ? "<h1>Signed in</h1><p>You can close this tab and go back to your AI app.</p>" : "<h1>Not signed in</h1><p>The sign-in was cancelled or did not match. Start again from your AI app.</p>"),
      );
      if (ok) finish(url.searchParams.get("code")!);
      else fail(new Error(url.searchParams.get("error_description") || url.searchParams.get("error") || "The sign-in did not complete."));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const port = (server.address() as { port: number }).port;
    const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
    let clientId: string;
    try {
      clientId = await this.clientId(metadata);
    } catch (error) {
      server.close();
      throw error;
    }
    const authorize = new URL(metadata.authorization_endpoint);
    authorize.search = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: SCOPES,
      state,
      resource: this.resource,
    }).toString();
    const url = authorize.toString();
    const timer = setTimeout(() => fail(new Error("The sign-in was not finished within 5 minutes.")), LOGIN_TIMEOUT_MS);
    const done = (async () => {
      try {
        const code = await codeArrived;
        const response = await postForm(metadata.token_endpoint, {
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: verifier,
          resource: this.resource,
        });
        const body = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string };
        if (!response.ok || !body.access_token || !body.refresh_token) throw new Error(`MR Office did not sign this app in: ${body.error_description ?? response.status}`);
        let credentials: Credentials = {
          clientId,
          accessToken: body.access_token,
          refreshToken: body.refresh_token,
          expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
          scope: body.scope ?? SCOPES,
        };
        if (metadata.userinfo_endpoint) {
          const who = await fetch(metadata.userinfo_endpoint, { headers: { authorization: `Bearer ${credentials.accessToken}` } }).catch(() => null);
          if (who?.ok) {
            const info = (await who.json()) as { email: string; name: string };
            credentials = { ...credentials, account: { email: info.email, name: info.name } };
          }
        }
        const store = readStore();
        store[this.apiUrl] = credentials;
        writeStore(store);
        return credentials;
      } finally {
        clearTimeout(timer);
        server.close();
        this.pendingLogin = null;
      }
    })();
    done.catch(() => undefined);
    if (openBrowser) openUrl(url);
    this.pendingLogin = { url, done };
    return this.pendingLogin;
  }

  /** A valid access token, refreshed when it is (nearly) out; null when not signed in. */
  async accessToken(force = false): Promise<string | null> {
    const current = this.credentials();
    if (!current) return null;
    if (!force && current.expiresAt - Date.now() > 60_000) return current.accessToken;
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const metadata = await this.discover();
        const response = await postForm(metadata.token_endpoint, { grant_type: "refresh_token", refresh_token: current.refreshToken, client_id: current.clientId });
        const body = (await response.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
        if (!response.ok || !body.access_token || !body.refresh_token) {
          // the sign-in was revoked or ran out: forget it
          this.forget();
          throw new NotSignedIn("This");
        }
        const next: Credentials = { ...current, accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000, scope: body.scope ?? current.scope };
        const store = readStore();
        store[this.apiUrl] = next;
        writeStore(store);
        return next;
      })().finally(() => (this.refreshing = null));
    }
    return (await this.refreshing).accessToken;
  }

  /** A valid access token; when this machine is not signed in yet, the
   * sign-in starts by itself (the browser opens on MR Office's consent page)
   * and the call waits up to `waitMs` for the person to allow it. */
  async accessTokenOrSignIn(what: string, waitMs = FIRST_USE_SIGN_IN_WAIT_MS, force = false): Promise<string> {
    const token = await this.accessToken(force).catch((error) => {
      if (error instanceof NotSignedIn) return null;
      throw error;
    });
    if (token) return token;
    const { url, done } = await this.startLogin(true);
    const signed = await Promise.race([done, new Promise<null>((resolve) => setTimeout(resolve, waitMs, null).unref?.())]).catch(() => null);
    if (!signed) throw new NotSignedIn(what, url);
    return signed.accessToken;
  }

  forget(): void {
    const store = readStore();
    delete store[this.apiUrl];
    writeStore(store);
  }

  /** Revokes the sign-in at MR Office and forgets it here. */
  async logout(): Promise<boolean> {
    const current = this.credentials();
    if (!current) return false;
    try {
      const metadata = await this.discover();
      if (metadata.revocation_endpoint) await postForm(metadata.revocation_endpoint, { token: current.refreshToken, client_id: current.clientId });
    } finally {
      this.forget();
    }
    return true;
  }
}

export function openUrl(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // the URL is also returned to whoever asked
  }
}
