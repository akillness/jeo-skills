// /managed/* route logic for the owner-only Unix socket. Domain outcomes are
// HTTP 200 with a `status`;
// malformed input is HTTP 400; nothing here can create an index.
import { randomUUID } from "node:crypto";
import { lstatSync } from "node:fs";
import { isAbsolute } from "node:path";
import { READY, canonicalPath, inspectExistingIndex, pathInScope, scannerDiff } from "./existing-index.mjs";

export const MANAGED_API_VERSION = 1;
const MAX_PATHS = 5_000;

class InputError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const SKIPPED = {
  missing: "skipped_missing_index",
  disabled: "skipped_disabled",
  unsupported_version: "skipped_unsupported",
  unsafe_home: "skipped_unsupported",
  relocated: "skipped_unsupported",
};
const SKIP_STATUS_BY_CODE = {
  MANAGED_INDEX_MISSING: "skipped_missing_index",
  INDEX_MISSING: "skipped_missing_index",
  MANAGED_INDEX_DISABLED: "skipped_disabled",
  MANAGED_INDEX_UNSUPPORTED: "skipped_unsupported",
  MANAGED_INDEX_UNSAFE_HOME: "skipped_unsupported",
  MANAGED_INDEX_RELOCATED: "skipped_unsupported",
  ROOT_UNTRUSTED: "skipped_untrusted",
};

export function createManagedApi({ backend, controller, engine, trust, resolveRequestedRoot, identity }) {
  const reply = (status, body) => ({ status, body });
  const ok = (body) => reply(200, body);
  const bad = (code, message) => reply(400, { status: "failed", error: { code, message } });

  async function canonicalRootOf(raw) {
    if (typeof raw !== "string" || raw === "" || !isAbsolute(raw)) {
      throw new InputError("ROOT_NOT_ABSOLUTE", "root must be an absolute path");
    }
    try {
      return await resolveRequestedRoot(raw, false);
    } catch (error) {
      throw new InputError(
        String(error?.code ?? "").startsWith("ROOT_") ? error.code : "ROOT_NOT_FOUND",
        "root is not an accessible directory",
      );
    }
  }

  function inspect(requested) {
    const inspection = inspectExistingIndex(engine, requested);
    if (inspection.state === READY) {
      const verdict = trust.check(inspection.root, inspection.manifest, inspection.identity);
      if (!verdict.trusted) return { ...inspection, state: "untrusted", reason: verdict.reason };
    }
    return inspection;
  }

  const UNREPORTABLE_SKIPS = new Set(["unsupported_version", "unsafe_home", "relocated"]);

  function nonReady(inspection) {
    if (inspection.state === "untrusted") return { status: "skipped_untrusted", reason: inspection.reason };
    const skipped = SKIPPED[inspection.state];
    if (skipped) {
      // An existing index that cannot be refreshed is a failure the host must
      // see, even though no write was attempted.
      if (UNREPORTABLE_SKIPS.has(inspection.state)) {
        controller.recordBackgroundFailure(inspection.root, `MANAGED_INDEX_${inspection.state.toUpperCase()}`, inspection.reason ?? inspection.state);
      }
      return { status: skipped, reason: inspection.reason };
    }
    // corrupt / unsupported provider: a real failure, not a skip.
    // Recorded as a durable warning by refuse().
    return {
      status: "failed",
      error: { code: inspection.state === "corrupt" ? "MANAGED_INDEX_CORRUPT" : "MANAGED_REMOTE_PROVIDER_REFUSED", message: inspection.reason },
    };
  }

  /** Response for a non-ready inspection; real failures also raise a warning. */
  function refuse(inspection, extra = {}) {
    const refusal = nonReady(inspection);
    if (refusal.status === "failed") {
      controller.recordBackgroundFailure(inspection.root, refusal.error.code, refusal.error.message);
    }
    return ok({ ...extra, ...refusal });
  }

  function pathList(value, name, manifest) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new InputError("INVALID_ARGUMENT", `${name} must be an array of strings`);
    }
    if (value.length > MAX_PATHS) {
      throw new InputError("INVALID_ARGUMENT", `${name} exceeds ${MAX_PATHS} paths; use verify_content`);
    }
    return value.map((path) => {
      if (!isAbsolute(path)) throw new InputError("PATH_OUT_OF_SCOPE", `${name} entries must be absolute`);
      const absolute = canonicalPath(path);
      if (!pathInScope(manifest, absolute)) {
        throw new InputError("PATH_OUT_OF_SCOPE", `${name} entry is outside the indexed scope`);
      }
      return absolute;
    });
  }

  function assertFiles(paths) {
    for (const path of paths) {
      let info;
      try {
        info = lstatSync(path);
      } catch {
        continue; // a missing file is a deletion; the scan records it
      }
      if (info.isDirectory()) {
        throw new InputError("PATH_NOT_FILE", "force_paths accepts files only; pass directories in changed_paths");
      }
    }
  }

  function outcomeOf(error) {
    const code = String(error?.code ?? "MANAGED_REFRESH_FAILED");
    if (SKIP_STATUS_BY_CODE[code]) return { status: SKIP_STATUS_BY_CODE[code] };
    if (code === "INDEX_BUSY") return { status: "busy", error: { code, message: "index write lock is held by another process" } };
    return { status: "failed", error: { code, message: String(error?.message ?? error).slice(0, 512) } };
  }

  async function checkRoot(body) {
    const root = await canonicalRootOf(body.root);
    const inspection = inspect(root);
    if (inspection.state === READY) {
      return ok({ status: "trusted", registered: true, root: inspection.root });
    }
    if (inspection.state === "untrusted") {
      return ok({ status: "untrusted", registered: false, root: inspection.root, reason: inspection.reason });
    }
    return refuse(inspection, { registered: false, root: inspection.root ?? root });
  }

  async function reserve(body) {
    const root = await canonicalRootOf(body.root);
    const inspection = inspect(root);
    if (inspection.state !== READY) return refuse(inspection);
    const entry = controller.reserve(inspection.root, typeof body.reason === "string" ? body.reason.slice(0, 64) : "turn_end");
    return ok({
      status: "reserved",
      root: inspection.root,
      reservation_id: entry.id,
      expires_at: new Date(entry.expires_at_ms).toISOString(),
      barrier_ms: controller.barrierMs,
    });
  }

  async function release(body) {
    const root = await canonicalRootOf(body.root);
    const inspection = inspect(root);
    const target = inspection.root ?? root;
    if (typeof body.reservation_id !== "string") {
      return bad("INVALID_ARGUMENT", "reservation_id is required");
    }
    const outcome = body.outcome ?? "unchanged";
    if (outcome !== "unchanged" && outcome !== "failed") {
      return bad("INVALID_ARGUMENT", "outcome must be unchanged or failed");
    }
    const { found } = controller.release(target, body.reservation_id, outcome, body.error);
    if (!found) return ok({ status: "unknown_reservation", root: target });
    return ok(outcome === "failed" ? { status: "released", outcome: "failed", root: target } : { status: "unchanged", root: target });
  }

  async function refresh(body) {
    const root = await canonicalRootOf(body.root);
    const inspection = inspect(root);
    if (inspection.state !== READY) return refuse(inspection);
    const changed = pathList(body.changed_paths, "changed_paths", inspection.manifest);
    const force = pathList(body.force_paths, "force_paths", inspection.manifest);
    assertFiles(force);
    if (body.verify_content !== undefined && typeof body.verify_content !== "boolean") {
      throw new InputError("INVALID_ARGUMENT", "verify_content must be a boolean");
    }
    const pending = controller.refresh(inspection.root, {
      changed,
      force,
      verify: body.verify_content === true,
      reservationId: typeof body.reservation_id === "string" ? body.reservation_id : undefined,
    });
    if (body.wait === true) {
      try {
        const { changed: didChange } = await pending;
        return ok({ status: didChange ? "refreshed" : "unchanged", root: inspection.root });
      } catch (error) {
        return ok({ root: inspection.root, ...outcomeOf(error) });
      }
    }
    pending.catch(() => undefined); // failures surface through status + warning
    return reply(202, { status: "accepted", root: inspection.root, job_id: randomUUID() });
  }

  async function status(query) {
    const base = {
      managed: true,
      api: MANAGED_API_VERSION,
      os_sandbox: identity.osSandbox,
      guards: identity.guards,
      package_version: identity.packageVersion,
      freshness_proof:
        "scanner size+mtime with content hash on stat change; content proof via force_paths/verify_content",
    };
    if (!query.root) {
      return ok({ ...base, indexed: false, state: "idle", last_success_at: null, last_failure: null, warning: null, barrier_ms: controller.barrierMs });
    }
    const root = await canonicalRootOf(query.root);
    const inspection = inspect(root);
    const target = inspection.root ?? root;
    const snapshot = controller.snapshot(target);
    return ok({ ...base, root: target, indexed: inspection.state === READY, trusted: inspection.state === READY, index_state: inspection.state, ...snapshot });
  }

  async function diff(body) {
    const root = await canonicalRootOf(body.root);
    const inspection = inspect(root);
    if (inspection.state !== READY) return refuse(inspection);
    try {
      return ok({ status: "ok", ...(await scannerDiff(engine, {
        root: inspection.root,
        assertTrusted: (current) => backend.assertTrusted(current),
      })) });
    } catch (error) {
      return ok({ root: inspection.root, ...outcomeOf(error) });
    }
  }

  return async function handle({ method, path, query, body }) {
    try {
      if (path === "/managed/identity" && method === "GET") {
        return ok({
          managed: true,
          api: MANAGED_API_VERSION,
          pid: identity.pid,
          instance_token: identity.instanceToken,
          os_sandbox: identity.osSandbox,
          warnings_dir: identity.warningsDir,
        });
      }
      if (path === "/managed/status" && method === "GET") return await status(query);
      if (method !== "POST") return reply(405, { status: "failed", error: { code: "METHOD_NOT_ALLOWED", message: method } });
      const payload = body !== null && typeof body === "object" && !Array.isArray(body) ? body : {};
      switch (path) {
        case "/managed/check-root":
          return await checkRoot(payload);
        case "/managed/reserve":
          return await reserve(payload);
        case "/managed/release":
          return await release(payload);
        case "/managed/refresh":
          return await refresh(payload);
        case "/managed/diff":
          return await diff(payload);
        default:
          return reply(404, { status: "failed", error: { code: "NOT_FOUND", message: path } });
      }
    } catch (error) {
      if (error instanceof InputError) return bad(error.code, error.message);
      return reply(500, { status: "failed", error: { code: "INTERNAL_ERROR", message: "internal error; see the daemon log" } });
    }
  };
}
