// MR Office's Office engine: Word, Excel and PowerPoint files read into the
// editors' own documents, and the editors' documents written back as Office
// files. The open editors have no Office reader or writer; MR Office's API
// does, as pure transformations that store nothing:
// POST /api/v1/office/import-projection (docx/xlsx/pptx in),
// POST /api/v1/office/docx/document (a document out as .docx) and
// POST /api/v1/office/export (a workbook or deck out as .xlsx / .pptx).
//
// The engine is reached as an account, under that account's own limits: never
// anonymously. Normally the account is the person's, signed in with OAuth
// (src/auth.ts, the `account` engine); in local development it can be the
// local stack's seeded test account, through the stack's local-only
// auto-login (`local-dev`, no password anywhere).

import { Account, NotSignedIn } from "./auth.ts";
import type { Config } from "./config.ts";
import { FORMATS, mrdocBytes, stem, type DocNode } from "./formats.ts";

export interface ImportedFile {
  /** What the editor opens. */
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly losses: readonly string[];
}

export interface Engine {
  readonly available: boolean;
  importOffice(name: string, bytes: Uint8Array): Promise<ImportedFile>;
  exportDocx(title: string, content: DocNode): Promise<Uint8Array>;
  /** A workbook (.mrsheet content) as .xlsx, or a deck (.mrslides) as .pptx. */
  exportOffice(kind: "spreadsheet" | "presentation", title: string, content: Record<string, unknown>): Promise<Uint8Array>;
}

export class EngineUnavailable extends Error {
  constructor(what: string) {
    super(`${what} needs MR Office's Office engine, which this server is not connected to.`);
  }
}

export class EngineRefused extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(`MR Office's engine refused the file (${status} ${code}): ${message}`);
    this.status = status;
    this.code = code;
  }
}

class NoEngine implements Engine {
  readonly available = false;
  async importOffice(name: string): Promise<ImportedFile> {
    throw new EngineUnavailable(`Opening ${name}`);
  }
  async exportDocx(): Promise<Uint8Array> {
    throw new EngineUnavailable("Writing a Word file");
  }
  async exportOffice(kind: "spreadsheet" | "presentation"): Promise<Uint8Array> {
    throw new EngineUnavailable(kind === "spreadsheet" ? "Writing an Excel file" : "Writing a PowerPoint file");
  }
}

interface Session {
  readonly cookie: string;
  readonly csrf: string;
  readonly at: number;
}

/** What both ways of reaching the API share: the three routes and their errors. */
abstract class ApiEngine implements Engine {
  abstract readonly available: boolean;
  protected abstract readonly apiUrl: string;
  /** The headers that make a request the account's. */
  protected abstract credentials(refresh: boolean): Promise<Record<string, string>>;

  protected async call(path: string, init: { body: BodyInit; headers: Record<string, string> }, retry = true): Promise<Response> {
    const auth = await this.credentials(!retry);
    const response = await fetch(`${this.apiUrl}${path}`, { method: "POST", body: init.body, headers: { ...init.headers, ...auth }, signal: AbortSignal.timeout(180_000) });
    if ((response.status === 401 || response.status === 403) && retry) return this.call(path, init, false);
    if (!response.ok) {
      let code = "error";
      let message = response.statusText;
      try {
        const body = (await response.json()) as { error?: { code?: string; message?: string } | string; detail?: unknown; error_description?: string };
        if (typeof body.error === "string") {
          code = body.error;
          message = body.error_description ?? message;
        } else {
          code = body.error?.code ?? code;
          message = body.error?.message ?? JSON.stringify(body.detail ?? body).slice(0, 300);
        }
      } catch {
        // not JSON
      }
      if (code === "document_docx_export_source_package_unavailable") {
        message =
          "this Word file holds parts (a header or footer story) that only its original package carries, and an export from the editor's copy would drop them. " +
          "Export it as md or mrdoc, or open the original in MR Office, where the saved page writes those parts back from the original file";
      }
      throw new EngineRefused(response.status, code, message);
    }
    return response;
  }

  async importOffice(name: string, bytes: Uint8Array): Promise<ImportedFile> {
    const extension = name.toLowerCase().split(".").pop() ?? "";
    const target = extension === "docx" ? "document" : extension === "xlsx" ? "spreadsheet" : extension === "pptx" ? "presentation" : null;
    if (!target) throw new Error(`${name} is not a Word, Excel or PowerPoint file`);
    const response = await this.call("/api/v1/office/import-projection", {
      body: bytes as BodyInit,
      headers: {
        "content-type": FORMATS[extension].mime,
        "x-office-source-kind": extension,
        "x-office-import-target": target,
        "x-file-name": encodeURIComponent(name),
      },
    });
    const projection = (await response.json()) as {
      title?: string;
      nodes?: DocNode[];
      doc_attrs?: Record<string, unknown>;
      import_losses?: unknown[];
      page?: Record<string, unknown>;
      content?: Record<string, unknown>;
    } & Record<string, unknown>;
    const losses = (projection.import_losses ?? []).map((loss) => (typeof loss === "string" ? loss : JSON.stringify(loss)));
    const title = projection.title || stem(name);
    if (target === "document") {
      const content: DocNode = { type: "doc", ...(projection.doc_attrs ? { attrs: projection.doc_attrs } : {}), content: projection.nodes?.length ? projection.nodes : [{ type: "paragraph" }] };
      return { name: `${stem(name)}.mrdoc`, bytes: mrdocBytes(title, content), losses };
    }
    // A workbook or deck: the page the engine reads is the editor's own file.
    const page = workbookOrDeck(projection, target);
    if (!page) throw new EngineRefused(200, "unexpected_projection", `the ${target} came back in a shape this server does not know`);
    const extensionOut = target === "spreadsheet" ? "mrsheet" : "mrslides";
    return { name: `${stem(name)}.${extensionOut}`, bytes: new TextEncoder().encode(`${JSON.stringify({ ...page, title: page.title ?? title })}\n`), losses };
  }

  async exportDocx(title: string, content: DocNode): Promise<Uint8Array> {
    const response = await this.call("/api/v1/office/docx/document", {
      body: JSON.stringify({ document: content, title, revision_policy: "accept" }),
      headers: { "content-type": "application/json" },
    });
    return new Uint8Array(await response.arrayBuffer());
  }

  async exportOffice(kind: "spreadsheet" | "presentation", title: string, content: Record<string, unknown>): Promise<Uint8Array> {
    const { title: _ignored, ...page } = content;
    void _ignored;
    const response = await this.call("/api/v1/office/export", {
      body: JSON.stringify({ kind, title: title.slice(0, 255), content: page }),
      headers: { "content-type": "application/json" },
    });
    return new Uint8Array(await response.arrayBuffer());
  }
}

/** The person's own MR Office account, signed in with OAuth (src/auth.ts). */
class AccountEngine extends ApiEngine {
  protected readonly apiUrl: string;
  readonly account: Account;

  constructor(account: Account) {
    super();
    this.account = account;
    this.apiUrl = account.apiUrl;
  }

  get available(): boolean {
    return this.account.signedIn;
  }

  protected async credentials(refresh: boolean): Promise<Record<string, string>> {
    // the first Office file signs the person in: the browser opens by itself
    const token = await this.account.accessTokenOrSignIn("Word, Excel and PowerPoint files", undefined, refresh);
    return { authorization: `Bearer ${token}` };
  }
}

/** A hosted server's caller: the token the AI app sent on this MCP session
 * (the app refreshes it; this server never holds a refresh token). */
export class BearerEngine extends ApiEngine {
  readonly available = true;
  protected readonly apiUrl: string;
  private readonly token: () => string | null;

  constructor(apiUrl: string, token: () => string | null) {
    super();
    this.apiUrl = apiUrl;
    this.token = token;
  }

  protected async credentials(): Promise<Record<string, string>> {
    const token = this.token();
    if (!token) throw new NotSignedIn("Word, Excel and PowerPoint files");
    return { authorization: `Bearer ${token}` };
  }
}

/** The local stack, signed in as its seeded test account. */
class LocalDevEngine extends ApiEngine {
  readonly available = true;
  protected readonly apiUrl: string;
  private session: Promise<Session> | null = null;
  private readonly options: { apiUrl: string; email: string; webOrigin: string };

  constructor(options: { apiUrl: string; email: string; webOrigin: string }) {
    super();
    this.options = options;
    this.apiUrl = options.apiUrl;
  }

  private async signIn(): Promise<Session> {
    const response = await fetch(`${this.options.apiUrl}/api/v1/auth/dev/auto-login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: this.options.webOrigin },
      body: JSON.stringify({ email: this.options.email }),
    });
    if (!response.ok) throw new Error(`the local stack's auto-login answered ${response.status} (is MRAI_DEV_AUTO_LOGIN_EMAIL set and the API local?)`);
    const cookies = response.headers.getSetCookie().map((line) => line.split(";", 1)[0]);
    const csrf = cookies.find((pair) => pair.startsWith("csrf_token="))?.slice("csrf_token=".length);
    if (!csrf) throw new Error("the local stack's auto-login set no CSRF token");
    return { cookie: cookies.join("; "), csrf, at: Date.now() };
  }

  protected async credentials(refresh: boolean): Promise<Record<string, string>> {
    if (refresh) this.session = null;
    if (!this.session) this.session = this.signIn();
    let session: Session;
    try {
      session = await this.session;
    } catch (error) {
      this.session = null;
      throw error;
    }
    return { cookie: session.cookie, "x-csrf-token": session.csrf, origin: this.options.webOrigin };
  }
}

function workbookOrDeck(projection: Record<string, unknown>, target: string): (Record<string, unknown> & { title?: string }) | null {
  const candidates = [projection, projection.page, projection.content, (projection.page as Record<string, unknown> | undefined)?.content];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const value = candidate as Record<string, unknown> & { title?: string };
    if (target === "spreadsheet" && Array.isArray(value.sheets)) return value;
    if (target === "presentation" && Array.isArray(value.slides)) return value;
  }
  return null;
}

export function createEngine(config: Config, account?: Account): Engine {
  if (config.engine.kind === "local-dev") return new LocalDevEngine(config.engine);
  if (config.engine.kind === "account") return new AccountEngine(account ?? new Account(config.engine.apiUrl));
  return new NoEngine();
}

export { AccountEngine };
