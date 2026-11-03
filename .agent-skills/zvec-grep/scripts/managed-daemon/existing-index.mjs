// Existing-index-only operations on top of the installed package's engine.
//
// Nothing here can create an index: readiness is established twice (read-only
// before the job, and again under the package's own home write lock), the
// directory/file identities captured under the lock are re-verified after the
// storage is opened and after the mutation, and the process guards make any
// leftover create path (mkdir of an absent `.zvec-grep`, the native
// ZVecCreateAndOpen) throw instead of succeed.
import { createHash } from "node:crypto";
import { lstatSync, realpathSync, existsSync, createReadStream } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { noteOpenFailure, settleLeakedHandles } from "./native-handles.mjs";
import { indexIdentity } from "./trust.mjs";

export class ManagedIndexError extends Error {
  constructor(code, message, options = {}) {
    super(`[${code}] ${message}`);
    this.name = "ManagedIndexError";
    this.code = code;
    this.retryable = options.retryable === true;
    if (options.cause) this.cause = options.cause;
  }
}

export const READY = "ready";
const HOME_DIR = ".zvec-grep";
const VERIFY_CONCURRENCY = 8;

export async function loadEngine(pkg) {
  const [root, manifest, workspaceIndex, types, lock, lease, scanner, storage, errors] =
    await Promise.all([
      pkg.importInternal("engine/service/root.js"),
      pkg.importInternal("engine/manifest.js"),
      pkg.importInternal("engine/service/workspace-index.js"),
      pkg.importInternal("engine/types.js"),
      pkg.importInternal("engine/utils/lock.js"),
      pkg.importInternal("engine/utils/daemon-lease.js"),
      pkg.importInternal("engine/pipeline/indexing/scanner/index.js"),
      pkg.importInternal("engine/storage/layout.js"),
      pkg.importInternal("daemon/errors.js"),
    ]);
  return {
    WorkspaceIndex: workspaceIndex.WorkspaceIndex,
    isWorkspaceIndexed: workspaceIndex.isWorkspaceIndexed,
    readWorkspaceManifest: manifest.readWorkspaceManifest,
    workspaceManifestPath: manifest.workspaceManifestPath,
    CURRENT_INDEX_VERSION: types.CURRENT_INDEX_VERSION,
    acquireReadWriteLock: lock.acquireReadWriteLock,
    assertDaemonWriteAllowed: lease.assertDaemonWriteAllowed,
    scanRootPaths: scanner.scanRootPaths,
    hasWorkspaceIndexStorage: storage.hasWorkspaceIndexStorage,
    resolveWorkspaceIndexStoragePaths: storage.resolveWorkspaceIndexStoragePaths,
    workspaceHome: root.workspaceHome,
    // The scheduler decides retries with `instanceof` on the vendor class.
    DaemonError: errors.DaemonError,
  };
}

/**
 * Read-only readiness check. Never creates, locks, or writes anything.
 * @returns {{state:string, root?:string, home?:string, manifest?:object, identity?:string, reason?:string}}
 */
export function inspectExistingIndex(engine, requestedRoot) {
  try {
    return inspectUnchecked(engine, requestedRoot);
  } catch (error) {
    // The index can be removed between any two of the checks below.
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return { state: "missing", reason: "index vanished during inspection" };
    }
    return { state: "corrupt", reason: `index could not be inspected (${error?.code ?? "error"})` };
  }
}

function inspectUnchecked(engine, requestedRoot) {
  let directory;
  try {
    directory = realpathSync(requestedRoot);
  } catch (error) {
    return { state: "missing", reason: `root unreadable: ${error.code ?? error.message}` };
  }
  while (true) {
    const home = join(directory, HOME_DIR);
    let info;
    try {
      info = lstatSync(home);
    } catch {
      info = undefined;
    }
    if (info?.isSymbolicLink()) {
      return { state: "unsafe_home", root: directory, home, reason: `${home} is a symbolic link` };
    }
    if (info?.isDirectory() && existsSync(engine.workspaceManifestPath(home))) {
      return classify(engine, directory, home);
    }
    const parent = dirname(directory);
    if (parent === directory) return { state: "missing", reason: "no workspace index found" };
    directory = parent;
  }
}

function classify(engine, root, home) {
  const manifestPath = engine.workspaceManifestPath(home);
  const manifestInfo = lstatSync(manifestPath, { bigint: true });
  if (!manifestInfo.isFile()) throw new Error("unsafe manifest object");
  let manifest;
  try {
    manifest = engine.readWorkspaceManifest(home);
  } catch (error) {
    return { state: "corrupt", root, home, reason: error.message };
  }
  if (!manifest) return { state: "missing", root, home, reason: "manifest absent" };
  if (manifest.indexPolicy === "disabled") return { state: "disabled", root, home };
  if (!engine.isWorkspaceIndexed(manifest)) {
    return { state: "missing", root, home, reason: "index was never built" };
  }
  if (manifest.indexVersion !== engine.CURRENT_INDEX_VERSION) {
    return { state: "unsupported_version", root, home, reason: `index version ${manifest.indexVersion}` };
  }
  if (!engine.hasWorkspaceIndexStorage(home)) {
    return { state: "missing", root, home, reason: "index storage absent" };
  }
  let manifestHome;
  const identity = identityOf(engine, home);
  const manifestAfter = lstatSync(manifestPath, { bigint: true });
  if (!manifestAfter.isFile() || manifestAfter.dev !== manifestInfo.dev || manifestAfter.ino !== manifestInfo.ino) {
    return { state: "corrupt", root, home, reason: "manifest changed during inspection" };
  }
  try {
    manifestHome = realpathSync(manifest.path);
  } catch {
    return { state: "relocated", root, home, reason: `manifest path ${manifest.path} is gone` };
  }
  if (manifestHome !== realpathSync(home)) {
    return { state: "relocated", root, home, reason: `manifest path ${manifest.path} differs from ${home}` };
  }
  if (manifest.embedding?.provider !== "local") {
    return {
      state: "unsupported_provider",
      root,
      home,
      reason: `embedding provider ${manifest.embedding?.provider} is not local`,
    };
  }
  if (identityOf(engine, home) !== identity) {
    return { state: "corrupt", root, home, reason: "index changed during inspection" };
  }
  return { state: READY, root, home, manifest, identity };
}

export function identityOf(engine, home) {
  const paths = engine.resolveWorkspaceIndexStoragePaths(home);
  if (engine.workspaceManifestPath(home) !== join(home, "manifest.json") ||
      paths.filesPath !== join(home, "files.zvec") || paths.indexPath !== join(home, "index.zvec")) {
    throw new Error("unsupported index storage layout");
  }
  return indexIdentity(home);
}

export function refusalFor(inspection) {
  const codes = {
    missing: "MANAGED_INDEX_MISSING",
    disabled: "MANAGED_INDEX_DISABLED",
    unsupported_version: "MANAGED_INDEX_UNSUPPORTED",
    unsafe_home: "MANAGED_INDEX_UNSAFE_HOME",
    relocated: "MANAGED_INDEX_RELOCATED",
    corrupt: "MANAGED_INDEX_CORRUPT",
    unsupported_provider: "MANAGED_REMOTE_PROVIDER_REFUSED",
  };
  return new ManagedIndexError(
    codes[inspection.state] ?? "MANAGED_INDEX_UNAVAILABLE",
    inspection.reason ?? inspection.state,
  );
}

function lockHome(home) {
  return join(home, "locks", "home");
}

/**
 * Refresh an already existing index while holding the package write lock for
 * the whole mutation. See file header for the no-create argument.
 */
export async function refreshExistingIndex(engine, request) {
  await settleLeakedHandles();
  const initial = inspectExistingIndex(engine, request.root);
  if (initial.state !== READY) throw refusalFor(initial);
  request.assertTrusted?.(initial);
  const { embeddingModel } = request;
  assertSchemaMatches(initial.manifest, embeddingModel);

  const permit = engine.assertDaemonWriteAllowed(initial.root, request.daemonInstanceToken);
  let lock;
  try {
    try {
      lock = engine.acquireReadWriteLock(lockHome(initial.home), "write", {
        operation: "managed.refresh",
      });
    } catch (error) {
      throw translateLockError(engine, error, initial.home);
    }
    const locked = inspectExistingIndex(engine, request.root);
    if (locked.state !== READY) throw refusalFor(locked);
    request.assertTrusted?.(locked);
    if (
      locked.manifest.id !== initial.manifest.id ||
      locked.home !== initial.home ||
      locked.identity !== initial.identity
    ) {
      throw new ManagedIndexError(
        "MANAGED_INDEX_REPLACED",
        "the index was replaced between readiness check and lock acquisition",
      );
    }
    assertSchemaMatches(locked.manifest, embeddingModel);

    let index;
    try {
      index = new engine.WorkspaceIndex(locked.manifest, { mode: "write", embeddingModel });
    } catch (error) {
      noteOpenFailure(error);
      throw translateOpenError(error, engine, locked);
    }
    try {
      assertIdentity(engine, locked);
      const result = await runLocked(engine, index, locked, request);
      assertIdentity(engine, locked);
      const completed = inspectExistingIndex(engine, request.root);
      if (completed.state !== READY) throw refusalFor(completed);
      request.assertTrusted?.(completed);
      return result;
    } finally {
      index.close();
    }
  } finally {
    lock?.release();
    permit?.release();
  }
}

function assertSchemaMatches(manifest, model) {
  const expected = manifest.embedding;
  const actual = model.info;
  if (
    expected.provider !== actual.provider ||
    expected.model !== actual.name ||
    expected.dimension !== actual.dimension ||
    expected.metric !== actual.metric
  ) {
    throw new ManagedIndexError(
      "MANAGED_EMBEDDING_MISMATCH",
      `index embedding ${expected.provider}/${expected.model} does not match loaded model ${actual.provider}/${actual.name}`,
    );
  }
}

function assertIdentity(engine, locked) {
  let current;
  try {
    current = identityOf(engine, locked.home);
  } catch (error) {
    throw new ManagedIndexError(
      "MANAGED_INDEX_REPLACED",
      `index vanished during refresh (${error.code ?? error.message})`,
    );
  }
  if (current !== locked.identity) {
    throw new ManagedIndexError(
      "MANAGED_INDEX_REPLACED",
      "index files were replaced during refresh; refusing to report success",
    );
  }
}

function translateLockError(engine, error, home) {
  if (error?.code === "MANAGED_NO_CREATE") {
    return new ManagedIndexError("MANAGED_INDEX_MISSING", `index home ${home} disappeared`);
  }
  if (typeof error?.code === "string" && error.code.includes("LOCK.BUSY")) {
    return new engine.DaemonError("INDEX_BUSY", "Another process holds the index write lock.", true);
  }
  return error;
}

function translateOpenError(error, engine, locked) {
  if (error?.code === "MANAGED_NO_CREATE") {
    return new ManagedIndexError("MANAGED_INDEX_MISSING", "index storage disappeared before it could be opened");
  }
  const after = inspectExistingIndex(engine, locked.root);
  return after.state === READY ? error : refusalFor(after);
}

async function runLocked(engine, index, locked, request) {
  const directives = request.directives?.(locked.root) ?? {
    changed: new Set(),
    force: new Set(),
    verify: false,
  };
  const storage = index.storage;
  for (const path of directives.force) {
    const stored = storage.getFileByPath(path);
    if (stored) storage.markFileFailed(stored, "managed: content change reported; forced reindex");
  }
  if (directives.verify) {
    await markContentMismatches(engine, index, locked.manifest, storage, request.signal);
  }
  // Path-scoped when the watcher or a reported change list names the paths;
  // otherwise (and always for verify_content) a full scan/diff/delete pass.
  const scoped = [...(request.changedPaths ?? []), ...directives.changed, ...directives.force];
  const changed = directives.verify || scoped.length === 0 ? undefined : [...new Set(scoped)];
  const result = await index.index({
    embeddingConcurrency: request.embeddingConcurrency,
    onProgress: request.onProgress,
    changedPaths: changed,
    signal: request.signal,
  });
  return result;
}

async function markContentMismatches(engine, index, manifest, storage, signal) {
  const scan = await engine.scanRootPaths(manifest.id, manifest.rootPaths, { signal });
  const scanned = new Map(scan.files.map((file) => [file.id, file]));
  const candidates = storage
    .listFiles()
    .filter(
      (file) =>
        file.contentHash &&
        file.indexStatus?.indexedTime !== null &&
        file.indexStatus?.indexedTime !== undefined &&
        scanned.has(file.id),
    );
  let cursor = 0;
  const worker = async () => {
    while (cursor < candidates.length) {
      signal?.throwIfAborted();
      const file = candidates[cursor++];
      const digest = await sha256File(scanned.get(file.id).absolutePath);
      if (digest !== file.contentHash) {
        storage.markFileFailed(file, "managed: content hash mismatch; forced reindex");
      }
    }
  };
  const results = await Promise.allSettled(Array.from({ length: VERIFY_CONCURRENCY }, worker));
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}

function sha256File(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolvePromise(hash.digest("hex")));
  });
}

/**
 * Absolute form of `path` with every existing ancestor directory resolved
 * (macOS /tmp -> /private/tmp). The final component is kept as given, so a
 * symlinked file is not followed and a deleted file keeps its location.
 */
export function canonicalPath(path) {
  const absolute = resolve(path);
  const tail = [];
  let current = absolute;
  for (;;) {
    try {
      return join(realpathSync(current), ...tail.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return absolute;
      tail.push(basename(current));
      current = parent;
    }
  }
}

/** True when `path` lies inside one of the manifest's configured root paths. */
export function pathInScope(manifest, path) {
  const absolute = canonicalPath(path);
  return manifest.rootPaths.some((rootPath) => {
    const base = canonicalPath(rootPath.absolutePath);
    return absolute === base || absolute.startsWith(base + sep);
  });
}

/**
 * Read-only scanner diff using the package's own scan and stored records.
 * Metadata only: path, size, mtime, hash; never file contents.
 */
export async function scannerDiff(engine, request) {
  const inspection = inspectExistingIndex(engine, request.root);
  if (inspection.state !== READY) throw refusalFor(inspection);
  request.assertTrusted?.(inspection);
  let lock;
  try {
    lock = engine.acquireReadWriteLock(lockHome(inspection.home), "read", {
      operation: "managed.diff",
    });
  } catch (error) {
    throw translateLockError(engine, error, inspection.home);
  }
  let index;
  try {
    const locked = inspectExistingIndex(engine, request.root);
    if (locked.state !== READY) throw refusalFor(locked);
    request.assertTrusted?.(locked);
    if (locked.identity !== inspection.identity || locked.home !== inspection.home || locked.manifest.id !== inspection.manifest.id) {
      throw new ManagedIndexError("MANAGED_INDEX_REPLACED", "index replaced before scanner lock");
    }
    index = new engine.WorkspaceIndex(locked.manifest, { mode: "read" });
    assertIdentity(engine, locked);
    const status = await index.status();
    assertIdentity(engine, locked);
    request.assertTrusted?.(locked);
    const brief = (file) => ({
      path: file.absolutePath,
      size: file.sizeBytes,
      mtime: file.lastModifiedTime,
      ...(file.contentHash ? { sha256: file.contentHash } : {}),
    });
    return {
      root: inspection.root,
      counts: {
        added: status.filesAdded,
        modified: status.filesModified,
        deleted: status.filesDeleted,
        unchanged: status.filesUnchanged,
        pending: status.filesPending,
        failed: status.filesFailed,
        stored: status.filesStored,
        scanned: status.filesScanned,
      },
      added: status.addedFiles.map(brief),
      modified: status.modifiedFiles.map(brief),
      deleted: status.deletedFiles.map(brief),
      pending: status.pendingFiles.map(brief),
    };
  } finally {
    index?.close();
    lock.release();
  }
}
