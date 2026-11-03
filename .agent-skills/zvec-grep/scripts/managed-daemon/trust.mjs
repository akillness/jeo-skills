// User-owned registry of workspaces the managed daemon may operate on.
//
// A committed or fabricated `.zvec-grep/` (hostile manifest, native index
// files) must not be opened just because it exists, so every managed
// operation requires the root to have been registered through the CLI
// (`main.mjs trust add`) by the user, pinned to the manifest id that existed at
// registration. Registration is deliberately not part of the HTTP/socket API.
import { chmodSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export function trustFile(home) {
  return join(home, "daemon", "managed", "trusted-roots.json");
}

// Fixed paths of the supported package; lstat never trusts a symlink target.
export function indexIdentity(home) {
  return [home, join(home, "manifest.json"), join(home, "files.zvec"), join(home, "index.zvec")]
    .map((target, i) => {
      const info = lstatSync(target, { bigint: true });
      if (i === 1 ? !info.isFile() : !info.isDirectory()) {
        throw new Error(`unsafe index object: ${target}`);
      }
      return `${info.dev}:${info.ino}`;
    }).join("|");
}

/**
 * Digest of the manifest fields a hostile replacement would have to change to
 * redirect the daemon (scope, location, schema, identity). `updatedTime` and
 * the embedding runtime change during normal operation and are excluded.
 */
export function manifestFingerprint(manifest) {
  const pinned = [
    manifest.id,
    manifest.name,
    manifest.path,
    manifest.rootPaths,
    manifest.embedding,
    manifest.indexVersion,
    manifest.createdTime,
  ];
  return createHash("sha256").update(JSON.stringify(pinned)).digest("hex");
}

export class TrustStore {
  constructor(file) {
    this.file = file;
  }

  #read() {
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8"));
      return Array.isArray(parsed.roots) ? parsed.roots : [];
    } catch {
      return [];
    }
  }

  list() {
    return this.#read();
  }

  /** @returns {{trusted:boolean, reason?:string}} */
  check(root, manifest, identity) {
    const entry = this.#read().find((candidate) => candidate.root === root);
    if (!entry) return { trusted: false, reason: "root is not registered; run `main.mjs trust add --root <dir>`" };
    if (entry.manifest_id !== manifest.id || entry.fingerprint !== manifestFingerprint(manifest)) {
      return { trusted: false, reason: "the index manifest changed since the root was registered; re-run `main.mjs trust add`" };
    }
    if (typeof identity !== "string" || !identity || entry.identity !== identity) {
      return { trusted: false, reason: "index identity is missing or changed; re-run `main.mjs trust add --root <dir>` after inspecting the index" };
    }
    return { trusted: true };
  }

  add(root, manifest, identity) {
    if (typeof identity !== "string" || !identity) throw new Error("index identity is required for trust registration");
    const roots = this.#read().filter((candidate) => candidate.root !== root);
    roots.push({
      root,
      manifest_id: manifest.id,
      fingerprint: manifestFingerprint(manifest),
      identity,
      added_at: new Date().toISOString(),
    });
    this.#write(roots);
  }

  remove(root) {
    const before = this.#read();
    const roots = before.filter((candidate) => candidate.root !== root);
    this.#write(roots);
    return roots.length !== before.length;
  }

  #write(roots) {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 1, roots })}\n`, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, this.file);
  }
}
