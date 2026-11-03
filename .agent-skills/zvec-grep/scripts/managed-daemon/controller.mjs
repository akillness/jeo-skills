// Per-root freshness controller: durable reservations, a single refresh drain
// loop, content-verifying repair, and the search gate (30s cooperative deadline
// with a generation fence; event-loop blocking can delay the timer).
//
// Invariants
//  * A search never returns while a reservation is open, a refresh is queued
//    or running, a warning/verify demand is unresolved, or the root's
//    generation moved while the search ran. It either returns a response that
//    was produced after the last such change, or fails (the caller falls back
//    to native Grep). Late results of a timed-out search are discarded.
//  * Warnings are cleared only by a content-verifying refresh that started
//    after the warning was raised.
//  * A reservation closes only through explicit release or a refresh that
//    names it; expiry demands verification but does not prove host completion.
import { randomUUID } from "node:crypto";

export const DEFAULT_BARRIER_MS = 30_000;
const REPAIR_COOLDOWN_MS = 5_000;
const MAX_ATTEMPTS = 4;

export class ManagedError extends Error {
  constructor(code, message, options = {}) {
    super(`[${code}] ${message}`);
    this.name = "ManagedError";
    this.code = code;
    this.retryable = options.retryable === true;
  }
}

function raceDeadline(promise, deadlineMs, now) {
  const remaining = deadlineMs - now();
  if (remaining <= 0) {
    promise.catch(() => undefined);
    return Promise.reject(barrierTimeout());
  }
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      promise.catch(() => undefined); // late settlement is discarded, never delivered
      reject(barrierTimeout());
    }, remaining);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function barrierTimeout() {
  return new ManagedError(
    "FRESHNESS_BARRIER_TIMEOUT",
    "the index could not be confirmed fresh within the barrier; use native Grep",
    { retryable: true },
  );
}

export class ManagedController {
  /**
   * @param {{warnings:object, reservations:object, barrierMs?:number,
   *          runJob:(root:string)=>Promise<{state:string,error?:object,startedAt:number}>,
   *          takeResult:(root:string)=>object|undefined, now?:()=>number, logger?:object}} options
   */
  constructor(options) {
    this.warnings = options.warnings;
    this.reservationStore = options.reservations;
    this.barrierMs = options.barrierMs ?? DEFAULT_BARRIER_MS;
    this.runJob = options.runJob;
    this.takeResult = options.takeResult;
    this.now = options.now ?? Date.now;
    this.logger = options.logger;
    this.roots = new Map();
  }

  state(root) {
    let st = this.roots.get(root);
    if (st) return st;
    const reservations = this.reservationStore.load(root);
    st = {
      root,
      generation: 0,
      reservations: [],
      timers: new Map(),
      pending: { changed: new Map(), force: new Map() },
      pendingRevision: 0,
      verifyEpoch: 1,
      verifyDoneEpoch: 0,
      queue: [],
      drain: undefined,
      inflight: undefined,
      waiters: new Set(),
      lastSuccessAtMs: null,
      lastFailure: null,
      repairFailedAtMs: 0,
      lastChanged: false,
    };
    this.roots.set(root, st);
    for (const entry of reservations) {
      st.reservations.push(entry);
      this.#arm(st, entry);
    }
    return st;
  }

  adoptPersistedRoots() {
    for (const root of this.reservationStore.roots()) this.state(root);
  }

  bump(st) {
    st.generation += 1;
    for (const waiter of [...st.waiters]) waiter();
  }

  needsVerify(st) {
    return st.verifyEpoch > st.verifyDoneEpoch;
  }

  demandVerify(st) {
    st.verifyEpoch += 1;
  }

  warning(st) {
    return this.warnings.read(st.root);
  }

  needsRepair(st) {
    return this.needsVerify(st) || this.warning(st) !== undefined;
  }

  isSettled(st) {
    return st.reservations.length === 0 && st.drain === undefined && st.queue.length === 0;
  }

  // ------------------------------------------------------------ reservations

  reserve(root, reason = "turn_end") {
    const st = this.state(root);
    const created = this.now();
    const entry = {
      id: randomUUID(),
      reason,
      created_at_ms: created,
      expires_at_ms: created + this.barrierMs,
    };
    st.reservations.push(entry);
    this.#arm(st, entry);
    try {
      this.reservationStore.save(st.root, st.reservations);
    } catch (error) {
      this.#close(st, entry);
      throw new ManagedError("RESERVATION_PERSIST_FAILED", `could not persist the reservation (${error?.code ?? "error"})`);
    }
    this.bump(st);
    return entry;
  }

  release(root, id, outcome = "unchanged", error) {
    if (!this.roots.has(root) && this.reservationStore.load(root).length === 0) return { found: false };
    const st = this.state(root);
    const entry = st.reservations.find((candidate) => candidate.id === id);
    if (!entry) return { found: false };
    if (outcome === "failed" || this.now() >= entry.expires_at_ms) {
      const expired = outcome !== "failed";
      if (!this.#fail(st, expired ? "RESERVATION_EXPIRED" : (error?.code ?? "HOST_SNAPSHOT_FAILED"), expired ? "the host resolved its reservation after expiry" : (error?.message ?? "host change snapshot failed"))) {
        this.bump(st);
        throw new ManagedError("WARNING_PERSIST_FAILED", "could not persist the failed reservation; use native Grep");
      }
      this.#close(st, entry);
      this.#backgroundVerify(st);
    } else {
      this.#close(st, entry);
    }
    this.bump(st);
    return { found: true };
  }

  #arm(st, entry) {
    const delay = Math.max(0, entry.expires_at_ms - this.now());
    const timer = setTimeout(() => {
      try {
        this.#expire(st, entry.id);
      } catch (error) {
        this.logger?.event?.("reservation.expire_failed", { error_code: error?.code });
      }
    }, delay);
    timer.unref?.();
    st.timers.set(entry.id, timer);
  }

  #close(st, entry) {
    clearTimeout(st.timers.get(entry.id));
    st.timers.delete(entry.id);
    st.reservations = st.reservations.filter((candidate) => candidate.id !== entry.id);
    this.#persist(st);
  }

  #persist(st) {
    try {
      this.reservationStore.save(st.root, st.reservations);
    } catch (error) {
      // In-memory state is authoritative; a stale record only causes a
      // verified expiry after a restart.
      this.logger?.event?.("reservation.persist_failed", { error_code: error?.code });
    }
  }

  #expire(st, id) {
    const entry = st.reservations.find((candidate) => candidate.id === id);
    if (!entry) return;
    this.#fail(st, "RESERVATION_EXPIRED", "the host never resolved its freshness reservation");
    this.bump(st);
  }

  #fail(st, code, message) {
    st.lastFailure = { code, message, at: new Date(this.now()).toISOString() };
    this.demandVerify(st);
    try {
      this.warnings.write(st.root, code, message);
      return true;
    } catch (error) {
      this.logger?.event?.("warning.write_failed", { error_code: error?.code });
      return false;
    }
  }

  recordBackgroundFailure(root, code, message) {
    const st = this.state(root);
    this.#fail(st, code, message);
    this.bump(st);
  }

  #backgroundVerify(st) {
    this.refresh(st.root, { verify: true }).catch(() => undefined);
  }

  // ----------------------------------------------------------------- refresh

  refresh(root, request = {}) {
    const st = this.state(root);
    for (const path of request.changed ?? []) st.pending.changed.set(path, ++st.pendingRevision);
    for (const path of request.force ?? []) st.pending.force.set(path, ++st.pendingRevision);
    if (request.verify || request.clearWarning) this.demandVerify(st);
    return new Promise((resolve, reject) => {
      st.queue.push({ resolve, reject, reservationId: request.reservationId, clearWarning: request.clearWarning === true });
      this.#ensureDrain(st);
      this.bump(st);
    });
  }

  /** Called from inside the locked index operation to claim the pending set. */
  takeDirectives(root) {
    const st = this.roots.get(root);
    if (!st) return { changed: new Set(), force: new Set(), verify: false };
    if (!st.inflight) {
      // A watcher or search-initiated run: it cannot satisfy a snapshot.
      return { changed: new Set(), force: new Set(), verify: false };
    }
    st.inflight.taken = true;
    return {
      changed: new Set(st.inflight.changed.keys()),
      force: new Set(st.inflight.force.keys()),
      verify: st.inflight.verify,
    };
  }

  #ensureDrain(st) {
    if (st.drain) return;
    st.drain = this.#drain(st)
      .catch((error) => this.logger?.event?.("drain.crashed", { error_code: error?.code }))
      .finally(() => {
        st.drain = undefined;
        this.bump(st);
        if (st.queue.length > 0) this.#ensureDrain(st);
      });
  }

  async #drain(st) {
    while (st.queue.length > 0) {
      const batch = st.queue.splice(0);
      const startedAt = this.now();
      try {
        const warningOccurrence = this.warnings.occurrence(st.root);
        const outcome = await this.#attempt(st);
        this.#commit(st, outcome, startedAt, batch, warningOccurrence);
        for (const item of batch) item.resolve({ changed: outcome.changed });
      } catch (error) {
        const recorded = isSkip(error) || this.#fail(st, error.code ?? "MANAGED_REFRESH_FAILED", String(error.message ?? error).slice(0, 512));
        if (recorded) {
          for (const item of batch) {
            const entry = st.reservations.find((candidate) => candidate.id === item.reservationId);
            if (entry) this.#close(st, entry);
          }
        }
        for (const item of batch) item.reject(error);
      }
    }
  }

  async #attempt(st) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const snap = {
        changed: new Map(st.pending.changed),
        force: new Map(st.pending.force),
        verify: this.needsVerify(st),
        verifyEpoch: st.verifyEpoch,
        taken: false,
      };
      st.inflight = snap;
      let job;
      try {
        job = await this.runJob(st.root);
      } catch (error) {
        error.skip = SKIP_CODES.has(error.code);
        throw error;
      } finally {
        st.inflight = undefined;
      }
      if (job.state !== "succeeded") {
        const error = new ManagedError(job.error?.code ?? "MANAGED_REFRESH_FAILED", job.error?.message ?? "refresh did not complete");
        error.skip = SKIP_CODES.has(job.error?.code);
        throw error;
      }
      const demanded = snap.changed.size > 0 || snap.force.size > 0 || snap.verify;
      if (demanded && !snap.taken) continue; // another job absorbed our slot; run again
      const result = this.takeResult(st.root);
      const counts = result
        ? (result.filesAdded ?? 0) + (result.filesModified ?? 0) + (result.filesPending ?? 0) + (result.filesDeleted ?? 0)
        : 0;
      return { snap, startedAt: job.startedAt, changed: counts > 0 || snap.force.size > 0 };
    }
    throw new ManagedError("MANAGED_REFRESH_NOT_APPLIED", "the refresh could not be applied; another job kept absorbing it");
  }

  #commit(st, outcome, startedAt, batch, warningOccurrence) {
    const { snap } = outcome;
    for (const [path, revision] of snap.changed) {
      if (st.pending.changed.get(path) === revision) st.pending.changed.delete(path);
    }
    for (const [path, revision] of snap.force) {
      if (st.pending.force.get(path) === revision) st.pending.force.delete(path);
    }
    if (snap.verify) st.verifyDoneEpoch = Math.max(st.verifyDoneEpoch, snap.verifyEpoch);
    st.lastSuccessAtMs = this.now();
    st.lastChanged = outcome.changed;
    // A warning is cleared only by a verifying refresh that started after it.
    // When no search drove that refresh, the warning is kept as a one-shot
    // notice so the next search still reports it.
    if (snap.verify) {
      st.lastFailure = null;
      const before = this.warnings.read(st.root);
      if (before && this.warnings.clearIfResolvedBy(st.root, outcome.startedAt ?? startedAt, this.now(), warningOccurrence) === undefined) {
        if (!batch.some((item) => item.clearWarning)) {
          try {
            this.warnings.writeNotice(st.root, before);
          } catch (error) {
            this.logger?.event?.("notice.write_failed", { error_code: error?.code });
          }
        }
      }
    }
    const resolved = new Set(batch.map((item) => item.reservationId).filter(Boolean));
    for (const id of resolved) {
      const entry = st.reservations.find((candidate) => candidate.id === id);
      if (entry) {
        if (this.now() >= entry.expires_at_ms &&
            !this.#fail(st, "RESERVATION_EXPIRED", "the host resolved its reservation after expiry")) {
          throw new ManagedError("WARNING_PERSIST_FAILED", "could not persist the expired reservation; use native Grep");
        }
        this.#close(st, entry);
      }
    }
  }

  // ------------------------------------------------------------- search gate

  waitSettled(st, deadlineMs) {
    if (this.isSettled(st)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.isSettled(st)) {
          cleanup();
          resolve();
        }
      };
      const timer = setTimeout(
        () => {
          cleanup();
          reject(barrierTimeout());
        },
        Math.max(0, deadlineMs - this.now()),
      );
      const cleanup = () => {
        clearTimeout(timer);
        st.waiters.delete(check);
      };
      st.waiters.add(check);
    });
  }

  /**
   * Run `run()` under the freshness barrier. `run` must perform the actual
   * (forced wait_for_fresh) search and return its response.
   */
  async gate(root, run) {
    const st = this.state(root);
    const deadline = this.now() + this.barrierMs;
    let recovered;
    let repaired = false;
    for (;;) {
      await this.waitSettled(st, deadline);
      if (!repaired || this.needsRepair(st)) {
        // One verifying repair per search: a warning that a repair cannot
        // clear must fail the search, not spin verify jobs until the deadline.
        if (repaired) {
          throw new ManagedError("MANAGED_REFRESH_FAILED", "a pending warning could not be cleared by a verified refresh; use native Grep");
        }
        repaired = true;
        recovered = (await this.#repair(st, deadline)) ?? recovered;
        continue;
      }
      if (this.now() >= deadline) throw barrierTimeout();
      const generation = st.generation;
      const attempt = { abandoned: false };
      let result;
      try {
        result = await raceDeadline(run(attempt), deadline, this.now);
      } catch (error) {
        attempt.abandoned = true;
        if (error.code === "FRESHNESS_BARRIER_TIMEOUT" || error.code === "MANAGED_SEARCH_FAILED") {
          this.demandVerify(st);
          this.bump(st);
          this.warnings.write(root, error.code, error.message);
        }
        throw error;
      }
      if (st.generation === generation && this.isSettled(st) && !this.needsRepair(st)) {
        return { result, recovered: recovered ?? this.warnings.takeNotice(root) };
      }
    }
  }

  async #repair(st, deadline) {
    const before = this.warning(st);
    if (st.lastFailure && this.now() - st.repairFailedAtMs < REPAIR_COOLDOWN_MS) {
      throw new ManagedError("MANAGED_REFRESH_FAILED", `${st.lastFailure.code}: ${st.lastFailure.message}; use native Grep`);
    }
    try {
      await raceDeadline(this.refresh(st.root, { verify: true, clearWarning: true }), deadline, this.now);
    } catch (error) {
      if (error.code === "FRESHNESS_BARRIER_TIMEOUT") throw error;
      st.repairFailedAtMs = this.now();
      throw new ManagedError(
        "MANAGED_REFRESH_FAILED",
        `${error.code ?? "ERROR"}: ${String(error.message ?? error)}; use native Grep`,
      );
    }
    return before ? { code: before.code, message: before.message, at: before.at } : undefined;
  }

  // ------------------------------------------------------------------ status

  /** Read-only: never creates state for a root nobody has used. */
  snapshot(root) {
    const st = this.roots.get(root);
    const warning = this.warnings.read(root);
    if (!st) {
      return {
        state: warning ? "failed" : "idle",
        reservations: 0,
        last_success_at: null,
        last_failure: null,
        warning: warning ? { code: warning.code, message: warning.message, at: warning.at } : null,
        barrier_ms: this.barrierMs,
      };
    }
    return {
      state: st.drain || st.queue.length ? "refreshing" : st.reservations.length ? "reserved" : this.needsRepair(st) ? "failed" : "idle",
      reservations: st.reservations.length,
      last_success_at: st.lastSuccessAtMs === null ? null : new Date(st.lastSuccessAtMs).toISOString(),
      last_failure: st.lastFailure,
      warning: warning ? { code: warning.code, message: warning.message, at: warning.at } : null,
      barrier_ms: this.barrierMs,
    };
  }
}

const SKIP_CODES = new Set([
  "MANAGED_INDEX_MISSING",
  "MANAGED_INDEX_DISABLED",
  "MANAGED_INDEX_UNSUPPORTED",
  "MANAGED_INDEX_UNSAFE_HOME",
  "MANAGED_INDEX_RELOCATED",
  "INDEX_MISSING",
  "ROOT_UNTRUSTED",
]);

function isSkip(error) {
  return error?.skip === true;
}
