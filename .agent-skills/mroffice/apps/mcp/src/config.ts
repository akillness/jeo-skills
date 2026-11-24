// What the server is told by its environment. Nothing here names a host
// application: a deployment that needs a host-specific value (the sandbox
// domain a host derives for this server, extra tool metadata) passes it in.

import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Config {
  /** The address the HTTP side listens on (loopback unless deployed behind a proxy). */
  readonly listenHost: string;
  /** The port of the HTTP side (MCP endpoint, editor pages, editor assets). */
  readonly port: number;
  /** Where people and hosts reach the HTTP side (links, the view page). */
  readonly publicUrl: string;
  /** A built copy of the open editors' page (apps/playground/dist), served
   * at the root of the HTTP side; absent when the assets come from elsewhere. */
  readonly editorDist: string | null;
  /** Where the editor's scripts, styles and fonts are loaded from. */
  readonly editorOrigin: string;
  /** Where documents are kept between calls. */
  readonly dataDir: string;
  /** MR Office's own web app (where a Word, Excel or PowerPoint file opens in full). */
  readonly webAppUrl: string;
  /** The Office engine: MR Office signed in as the person (`account`, the
   * default: https://mroffice.ai, or MROFFICE_MCP_API_URL), none, or a local
   * stack's seeded test account (`local-dev`). */
  readonly engine:
    | { readonly kind: "none" }
    | { readonly kind: "account"; readonly apiUrl: string }
    | { readonly kind: "local-dev"; readonly apiUrl: string; readonly email: string; readonly webOrigin: string };
  /** `_meta.ui.domain` for the editor resource, when a host asks for a stable one. */
  readonly uiDomain: string | null;
  /** Largest file a tool takes, in bytes. */
  readonly maxFileBytes: number;
  /** `oauth`: the HTTP side's MCP endpoint takes only callers signed in to MR
   * Office (RFC 9728 metadata, 401 with WWW-Authenticate otherwise), and
   * converts with each caller's own token: a hosted server. `none`: one
   * person's own machine. */
  readonly auth: "none" | "oauth";
  /** open_document may fetch from loopback and private addresses (local development only). */
  readonly allowPrivateUrls: boolean;
  /** Documents nobody saved for this many days are removed (null: kept). */
  readonly retentionDays: number | null;
  /** On a server people sign in to: the most documents one account keeps
   * (its oldest go first). */
  readonly maxDocumentsPerPerson: number;
  /** Pages the headless editor draws at once. */
  readonly renderConcurrency: number;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function positive(value: string | undefined): number | undefined {
  const number = Number(value);
  return value && Number.isFinite(number) && number > 0 ? number : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.MROFFICE_MCP_PORT || 3410);
  const publicUrl = trimSlash(env.MROFFICE_MCP_PUBLIC_URL || `http://127.0.0.1:${port}`);
  const editorDist = env.MROFFICE_MCP_EDITOR_DIST || null;
  const engineKind = env.MROFFICE_MCP_ENGINE || "account";
  let engine: Config["engine"] = { kind: "none" };
  if (engineKind === "account") {
    engine = { kind: "account", apiUrl: trimSlash(env.MROFFICE_MCP_API_URL || "https://mroffice.ai") };
  } else if (engineKind === "local-dev") {
    const email = env.MROFFICE_MCP_DEV_EMAIL || "";
    if (!email) throw new Error("MROFFICE_MCP_ENGINE=local-dev needs MROFFICE_MCP_DEV_EMAIL (the local stack's seeded test account)");
    engine = {
      kind: "local-dev",
      apiUrl: trimSlash(env.MROFFICE_MCP_API_URL || "http://127.0.0.1:8000"),
      email,
      webOrigin: trimSlash(env.MROFFICE_MCP_DEV_WEB_ORIGIN || "http://127.0.0.1:3000"),
    };
  } else if (engineKind !== "none") {
    throw new Error(`MROFFICE_MCP_ENGINE=${engineKind} is not one this server knows (account, none, local-dev)`);
  }
  const auth = (env.MROFFICE_MCP_AUTH || "none") as Config["auth"];
  if (auth !== "none" && auth !== "oauth") throw new Error(`MROFFICE_MCP_AUTH=${auth} is not one this server knows (none, oauth)`);
  if (auth === "oauth" && engine.kind !== "account") throw new Error("MROFFICE_MCP_AUTH=oauth needs the account engine (MROFFICE_MCP_ENGINE=account)");
  return {
    listenHost: env.MROFFICE_MCP_LISTEN_HOST || "127.0.0.1",
    port,
    publicUrl,
    editorDist,
    editorOrigin: trimSlash(env.MROFFICE_MCP_EDITOR_ORIGIN || (editorDist ? publicUrl : "https://demo.mroffice.ai")),
    dataDir: env.MROFFICE_MCP_DATA_DIR || join(tmpdir(), "mroffice-mcp"),
    webAppUrl: trimSlash(env.MROFFICE_MCP_WEB_APP_URL || "https://mroffice.ai"),
    engine,
    uiDomain: env.MROFFICE_MCP_UI_DOMAIN || null,
    maxFileBytes: Number(env.MROFFICE_MCP_MAX_FILE_BYTES || 20 * 1024 * 1024),
    allowPrivateUrls: env.MROFFICE_MCP_ALLOW_PRIVATE_URLS === "1",
    auth,
    retentionDays: positive(env.MROFFICE_MCP_RETENTION_DAYS) ?? null,
    maxDocumentsPerPerson: positive(env.MROFFICE_MCP_MAX_DOCUMENTS_PER_PERSON) ?? 200,
    renderConcurrency: positive(env.MROFFICE_MCP_RENDER_CONCURRENCY) ?? 2,
  };
}
