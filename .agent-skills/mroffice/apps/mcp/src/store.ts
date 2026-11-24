// The documents a conversation works on, kept on disk so that the MCP
// endpoint, the editor page a link opens and a second server process over
// the same directory all see one document.
//
// A document is the file the editor holds (`editor`: what the open editor
// opens and saves: .mrdoc, .mrsheet, .csv, .md, .pdf ...) and the format
// it came in or is to leave as (`format`: docx, md, csv ...). Every save is a
// new revision, by the model (a tool) or by the person (the editor).

import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type Author = "model" | "person";

export interface Revision {
  readonly rev: number;
  /** The editor file's name at this revision. */
  readonly name: string;
  readonly by: Author;
  readonly at: string;
  readonly bytes: number;
}

export interface DocumentMeta {
  readonly id: string;
  /** The format the document came in, and is exported to by default. */
  readonly format: string;
  readonly title: string;
  /** The secret a link to the editor page carries. */
  readonly token: string;
  readonly createdAt: string;
  readonly revisions: readonly Revision[];
  /** Losses the Office engine reported reading the original. */
  readonly importLosses?: readonly string[];
  /** On a server many people sign in to: the MR Office account (the
   * token's subject) the document belongs to. Only that account's sessions
   * see it; a link's secret still opens it in a browser. */
  readonly owner?: string;
}

export interface StoredDocument extends DocumentMeta {
  readonly current: Revision;
  readonly bytes: Uint8Array;
}

const ID = /^[a-z0-9]{12}$/;

function newId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export class DocumentStore {
  private readonly dir: string;
  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
  }

  private folder(id: string): string {
    if (!ID.test(id)) throw new DocumentNotFound(id);
    return join(this.dir, id);
  }

  private writeMeta(meta: DocumentMeta): void {
    const path = join(this.folder(meta.id), "meta.json");
    writeFileSync(`${path}.tmp`, JSON.stringify(meta, null, 2));
    renameSync(`${path}.tmp`, path);
  }

  create(input: { format: string; title: string; name: string; bytes: Uint8Array; by: Author; importLosses?: readonly string[]; owner?: string }): StoredDocument {
    const id = newId();
    mkdirSync(this.folder(id), { recursive: true });
    const now = new Date().toISOString();
    const meta: DocumentMeta = {
      id,
      format: input.format,
      title: input.title,
      token: randomBytes(18).toString("base64url"),
      createdAt: now,
      revisions: [],
      ...(input.importLosses?.length ? { importLosses: input.importLosses } : {}),
      ...(input.owner ? { owner: input.owner } : {}),
    };
    this.writeMeta(meta);
    return this.save(id, { name: input.name, bytes: input.bytes, by: input.by });
  }

  meta(id: string): DocumentMeta {
    const path = join(this.folder(id), "meta.json");
    if (!existsSync(path)) throw new DocumentNotFound(id);
    return JSON.parse(readFileSync(path, "utf8")) as DocumentMeta;
  }

  get(id: string, rev?: number): StoredDocument {
    const meta = this.meta(id);
    const current = rev === undefined ? meta.revisions[meta.revisions.length - 1] : meta.revisions.find((entry) => entry.rev === rev);
    if (!current) throw new DocumentNotFound(id);
    const bytes = new Uint8Array(readFileSync(join(this.folder(id), `rev-${current.rev}`)));
    return { ...meta, current, bytes };
  }

  /** A new revision. `baseRev`, when given, must be the current one: a save
   * made over an older revision is refused rather than silently overwriting
   * what the model or the person saved since. */
  save(id: string, input: { name: string; bytes: Uint8Array; by: Author; baseRev?: number }): StoredDocument {
    const meta = this.meta(id);
    const last = meta.revisions[meta.revisions.length - 1];
    if (input.baseRev !== undefined && last && input.baseRev !== last.rev) throw new RevisionConflict(id, input.baseRev, last.rev);
    const rev = (last?.rev ?? 0) + 1;
    writeFileSync(join(this.folder(id), `rev-${rev}`), input.bytes);
    const revision: Revision = { rev, name: input.name, by: input.by, at: new Date().toISOString(), bytes: input.bytes.byteLength };
    const next: DocumentMeta = { ...meta, revisions: [...meta.revisions, revision] };
    this.writeMeta(next);
    return { ...next, current: revision, bytes: input.bytes };
  }

  rename(id: string, title: string): void {
    this.writeMeta({ ...this.meta(id), title });
  }

  list(): DocumentMeta[] {
    return readdirSync(this.dir)
      .filter((entry) => ID.test(entry))
      .flatMap((entry) => {
        try {
          return [this.meta(entry)];
        } catch {
          // being removed (or not finished being created) meanwhile
          return [];
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Removes a document and all its revisions. */
  remove(id: string): void {
    rmSync(this.folder(id), { recursive: true, force: true });
  }

  /** Removes the documents nobody saved for `maxAgeMs` (a hosted server's
   * documents are working copies: the person exports what they keep).
   * Returns how many went. */
  prune(maxAgeMs: number, now = Date.now()): number {
    let removed = 0;
    for (const meta of this.list()) {
      const last = Date.parse(meta.revisions.at(-1)?.at ?? meta.createdAt);
      if (Number.isFinite(last) && now - last > maxAgeMs) {
        this.remove(meta.id);
        removed += 1;
      }
    }
    return removed;
  }

  /** Keeps at most `max` documents per account, removing the ones saved
   * longest ago first. */
  capOwner(owner: string, max: number): void {
    const own = this.list()
      .filter((meta) => meta.owner === owner)
      .sort((a, b) => (b.revisions.at(-1)?.at ?? b.createdAt).localeCompare(a.revisions.at(-1)?.at ?? a.createdAt));
    for (const meta of own.slice(max)) this.remove(meta.id);
  }

  /** The link secret matches (constant time). */
  authorize(id: string, token: string | null | undefined): boolean {
    if (!token) return false;
    let expected: string;
    try {
      expected = this.meta(id).token;
    } catch {
      return false;
    }
    const a = Buffer.from(expected);
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

export class DocumentNotFound extends Error {
  readonly id: string;
  constructor(id: string) {
    super(`No document ${id}. list_documents names the open ones.`);
    this.id = id;
  }
}

export class RevisionConflict extends Error {
  readonly currentRev: number;
  constructor(id: string, baseRev: number, currentRev: number) {
    super(`Document ${id} changed since revision ${baseRev} (it is at ${currentRev}); reload it before saving.`);
    this.currentRev = currentRev;
  }
}
