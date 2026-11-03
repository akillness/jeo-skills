// Durable per-root state owned by the managed daemon: refresh warnings and
// freshness reservations. Warning files share a format with the host bridge
// ({root, code, message, at}) so either side can raise one and only a
// successful refresh that started after `at` clears it.
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export function rootKey(canonicalRoot) {
  return createHash("sha256").update(canonicalRoot).digest("hex");
}

export function warningsDir(env = process.env) {
  if (env.ZVEC_GREP_MANAGED_WARNINGS_DIR) return env.ZVEC_GREP_MANAGED_WARNINGS_DIR;
  const stateHome = env.XDG_STATE_HOME || join(env.HOME || homedir(), ".local", "state");
  return join(stateHome, "zvec-grep", "warnings");
}

function writeJsonAtomic(path, value) {
  mkdirSync(join(path, ".."), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // Nothing to clean up.
    }
    throw error;
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function toMillis(at) {
  if (typeof at === "number") return at;
  const parsed = Date.parse(at);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function validateWarning(record) {
  if (!record || typeof record.code !== "string" || typeof record.message !== "string" ||
      !Number.isFinite(typeof record.at === "number" ? record.at : Date.parse(record.at))) {
    throw new Error("invalid durable refresh warning");
  }
  return record;
}

function readTakenWarning(taken, path) {
  try {
    return validateWarning(readJson(taken));
  } catch (error) {
    try {
      linkSync(taken, path);
    } catch (restoreError) {
      if (restoreError.code !== "EEXIST") throw restoreError;
    }
    unlinkSync(taken);
    throw error;
  }
}

export class WarningStore {
  constructor(directory) {
    this.directory = directory;
    this.recoverTaken();
  }

  recoverTaken() {
    let names;
    try {
      names = readdirSync(this.directory);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const name of names) {
      const match = /^([a-f0-9]{64}(?:\.notice)?\.json)\.\d+\.[a-f0-9-]+\.taken$/.exec(name);
      if (!match) continue;
      const taken = join(this.directory, name);
      try {
        linkSync(taken, join(this.directory, match[1]));
      } catch (error) {
        if (error.code !== "EEXIST" && error.code !== "ENOENT") throw error;
      }
      try {
        unlinkSync(taken);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }

  path(canonicalRoot) {
    return join(this.directory, `${rootKey(canonicalRoot)}.json`);
  }

  occurrence(canonicalRoot) {
    try {
      const stat = statSync(this.path(canonicalRoot), { bigint: true });
      return `${stat.dev}:${stat.ino}`;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  read(canonicalRoot) {
    const record = readJson(this.path(canonicalRoot));
    if (record === undefined) return undefined;
    validateWarning(record);
    return {
      root: canonicalRoot,
      code: record.code,
      message: record.message,
      at: record.at,
      atMs: toMillis(record.at),
    };
  }

  write(canonicalRoot, code, message) {
    const record = {
      root: canonicalRoot,
      code,
      message: String(message).slice(0, 512),
      at: new Date().toISOString(),
    };
    // Every occurrence gets a fresh timestamp so an in-flight verification
    // cannot clear a failure raised after it started, even for the same code.
    writeJsonAtomic(this.path(canonicalRoot), record);
  }

  noticePath(canonicalRoot) {
    return join(this.directory, `${rootKey(canonicalRoot)}.notice.json`);
  }

  /** One-shot record of a warning cleared by a background refresh, shown by the next search. */
  writeNotice(canonicalRoot, warning) {
    writeJsonAtomic(this.noticePath(canonicalRoot), {
      root: canonicalRoot,
      code: warning.code,
      message: warning.message,
      at: warning.at,
    });
  }

  takeNotice(canonicalRoot) {
    const path = this.noticePath(canonicalRoot);
    const taken = `${path}.${process.pid}.${randomUUID()}.taken`;
    try {
      renameSync(path, taken);
    } catch (error) {
      if (error.code === "ENOENT") return undefined;
      throw error;
    }
    const record = readJson(taken);
    unlinkSync(taken);
    return record && typeof record.code === "string"
      ? { code: record.code, message: record.message, at: record.at }
      : undefined;
  }

  /**
   * Clear only when a refresh that started after the warning succeeded. The
   * file is taken by an atomic rename so a warning written concurrently by the
   * host bridge is never deleted unseen; a future-dated `at` counts as "now".
   */
  clearIfResolvedBy(canonicalRoot, refreshStartedAtMs, nowMs = Date.now(), expectedOccurrence = undefined) {
    const path = this.path(canonicalRoot);
    const taken = `${path}.${process.pid}.${randomUUID()}.taken`;
    try {
      renameSync(path, taken);
    } catch (error) {
      if (error.code === "ENOENT") return undefined;
      throw error;
    }
    const record = readTakenWarning(taken, path);
    const stat = statSync(taken, { bigint: true });
    const occurrence = `${stat.dev}:${stat.ino}`;
    const atMs = Math.min(toMillis(record?.at), nowMs);
    if ((expectedOccurrence !== undefined && occurrence !== expectedOccurrence) || (record && refreshStartedAtMs < atMs)) {
      try {
        linkSync(taken, path); // keep it; a newer one written meanwhile wins (EEXIST)
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
      unlinkSync(taken);
      return this.read(canonicalRoot);
    }
    unlinkSync(taken);
    return undefined;
  }
}

function validateReservations(record, expectedRoot, name) {
  if (!record || typeof record.root !== "string" || !isAbsolute(record.root) ||
      (expectedRoot !== undefined && record.root !== expectedRoot) ||
      name !== `${rootKey(record.root)}.json` || !Array.isArray(record.reservations)) {
    throw new Error("invalid durable reservation record");
  }
  const ids = new Set();
  for (const entry of record.reservations) {
    if (!entry || typeof entry.id !== "string" || !entry.id || ids.has(entry.id) ||
        !Number.isFinite(entry.created_at_ms) || !Number.isFinite(entry.expires_at_ms) ||
        entry.expires_at_ms <= entry.created_at_ms || typeof entry.reason !== "string") {
      throw new Error("invalid durable reservation entry");
    }
    ids.add(entry.id);
  }
  return record.reservations;
}

export class ReservationStore {
  constructor(directory) {
    this.directory = directory;
  }

  path(canonicalRoot) {
    return join(this.directory, `${rootKey(canonicalRoot)}.json`);
  }

  load(canonicalRoot) {
    const record = readJson(this.path(canonicalRoot));
    if (record === undefined) return [];
    return validateReservations(record, canonicalRoot, `${rootKey(canonicalRoot)}.json`);
  }

  save(canonicalRoot, reservations) {
    if (reservations.length === 0) {
      try {
        unlinkSync(this.path(canonicalRoot));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      return;
    }
    writeJsonAtomic(this.path(canonicalRoot), { root: canonicalRoot, reservations });
  }

  /** Roots that still have persisted reservations (used at daemon start). */
  roots() {
    let names;
    try {
      names = readdirSync(this.directory);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    return names.filter((name) => name.endsWith(".json")).map((name) => {
      const record = readJson(join(this.directory, name));
      validateReservations(record, undefined, name);
      return record.root;
    });
  }
}
