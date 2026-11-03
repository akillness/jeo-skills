// ManagedBackend: the installed package's DaemonBackend with every index
// lifecycle and egress path replaced by the managed, existing-only, offline
// implementations. Index creation, rebuild, drop and the stock rg tool are
// refused; search is gated by the freshness controller.
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import {
  READY,
  ManagedIndexError,
  inspectExistingIndex,
  refreshExistingIndex,
  refusalFor,
} from "./existing-index.mjs";
import { ManagedController } from "./controller.mjs";
import { noteOpenFailure, settleLeakedHandles } from "./native-handles.mjs";

const rootId = (root) => createHash("sha256").update(root).digest("hex").slice(0, 16);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function nonEmpty(value) {
  return value !== undefined && !(Array.isArray(value) && value.length === 0);
}

export async function createManagedBackend(pkg, engine, offline, options) {
  const [{ DaemonBackend }, runtimeManager, { WatchManager }] = await Promise.all([
    pkg.importInternal("daemon/backend.js"),
    pkg.importInternal("daemon/runtime-manager.js"),
    pkg.importInternal("daemon/watch-manager.js"),
  ]);
  const { DaemonError } = engine;
  const knownRoots = new Map();
  const lastResults = new Map();
  const holder = {};
  const note = (root) => {
    knownRoots.set(rootId(root), root);
    return root;
  };

  const logger = {
    event(name, fields = {}) {
      if (name === "job.finished" && fields.state === "failed") {
        const root = knownRoots.get(fields.root_id);
        if (root) {
          holder.controller?.recordBackgroundFailure(
            root,
            fields.error_code ?? "INDEX_FAILED",
            "background index refresh failed",
          );
        }
      }
      options.logger?.event(name, fields);
    },
    flush: () => options.logger?.flush?.(),
  };

  function refuse(what) {
    return new DaemonError(
      "MANAGED_LIFECYCLE_DISABLED",
      `${what} is disabled in the managed daemon; only existing-index refresh and search are available`,
    );
  }

  function createService(serviceOptions) {
    return {
      async index(indexOptions = {}) {
        for (const key of ["globs", "insensitiveGlobs", "fileTypes", "excludedFileTypes", "ignoreFiles", "includePaths", "excludePaths", "rootPaths"]) {
          if (nonEmpty(indexOptions[key])) throw refuse(`index option ${key}`);
        }
        for (const key of ["rebuild", "resetPaths", "hidden", "noIgnore", "follow", "maxDepth", "maxFileSizeBytes"]) {
          if (indexOptions[key] !== undefined && indexOptions[key] !== false) throw refuse(`index option ${key}`);
        }
        if (!serviceOptions.embeddingModel) throw refuse("indexing without a leased embedding model");
        const result = await refreshExistingIndex(engine, {
          root: indexOptions.root ?? serviceOptions.root,
          embeddingModel: serviceOptions.embeddingModel,
          daemonInstanceToken: serviceOptions.daemonInstanceToken,
          assertTrusted: (inspection) => holder.backend.assertTrusted(inspection),
          changedPaths: indexOptions.changedPaths,
          directives: (root) => holder.controller.takeDirectives(root),
          embeddingConcurrency: indexOptions.embeddingConcurrency,
          onProgress: indexOptions.onProgress,
          signal: indexOptions.signal,
        });
        // Counts accumulate until the controller takes them, so work done by a
        // concurrent watcher job is not lost from the "unchanged" decision.
        const key = realpathSync(indexOptions.root ?? serviceOptions.root);
        const previous = lastResults.get(key) ?? {};
        lastResults.set(key, {
          filesAdded: (previous.filesAdded ?? 0) + (result.filesAdded ?? 0),
          filesModified: (previous.filesModified ?? 0) + (result.filesModified ?? 0),
          filesPending: (previous.filesPending ?? 0) + (result.filesPending ?? 0),
          filesDeleted: (previous.filesDeleted ?? 0) + (result.filesDeleted ?? 0),
        });
        return result;
      },
      async dropIndex() {
        throw refuse("dropping an index");
      },
      async disableIndex() {
        throw refuse("disabling an index");
      },
      async context() {
        throw refuse("direct service context");
      },
      async info() {
        throw refuse("direct service info");
      },
      async close() {},
    };
  }

  class ManagedBackend extends DaemonBackend {
    constructor() {
      super({
        version: options.version,
        serviceOptions: {},
        runtimeIdleTtlMs: options.runtimeIdleTtlMs,
        logger,
        modelPoolOptions: { createModel: (request) => offline.createModel(request) },
        createService,
        watchManagerFactory: (watchOptions) => new WatchManager({
          ...watchOptions,
          onChanges: async (...args) => {
            try {
              holder.backend.assertRootTrusted(watchOptions.root);
            } catch (error) {
              holder.controller?.recordBackgroundFailure(watchOptions.root, error.code ?? "ROOT_UNTRUSTED", error.message);
              const runtime = holder.backend.runtimeManager.getByCanonicalRoot(watchOptions.root);
              runtime?.setWatcherActive(false);
              void holder.backend.closeWatcher(watchOptions.root).catch((closeError) => {
                logger.event("watcher.close_failed", { root_id: rootId(watchOptions.root), error: String(closeError) });
              });
              return;
            }
            return watchOptions.onChanges(...args);
          },
        }),
        inspectRoot: async (root, serviceOptions, includeStatus) => {
          await settleLeakedHandles();
          try {
            holder.backend.assertRootTrusted(root);
            const result = await runtimeManager.inspectRoot(root, serviceOptions, includeStatus);
            holder.backend.assertRootTrusted(root);
            return result;
          } catch (error) {
            noteOpenFailure(error);
            throw error;
          }
        },
      });
    }

    async index() {
      throw refuse("zvec_grep_index");
    }

    async dropIndex() {
      throw refuse("zvec_grep_index_drop");
    }

    async rg() {
      throw refuse("zvec_grep_rg");
    }

    async planIndexAuthorization() {
      return undefined;
    }

    // The managed daemon is local-only: no remote-embedding grant flow exists.
    async planSearchAuthorization() {
      return undefined;
    }

    /** One locked job through the stock scheduler/runtime machinery. */
    assertTrusted(inspection) {
      const verdict = options.trust.check(inspection.root, inspection.manifest, inspection.identity);
      if (!verdict.trusted) throw new DaemonError("ROOT_UNTRUSTED", verdict.reason);
    }

    assertRootTrusted(root) {
      const inspection = inspectExistingIndex(engine, root);
      if (inspection.state !== READY) throw refusalFor(inspection);
      this.assertTrusted(inspection);
      return inspection;
    }

    ensureWatcher(runtime) {
      try {
        this.assertRootTrusted(runtime.canonicalRoot);
      } catch (error) {
        runtime.setWatcherActive(false);
        void this.closeWatcher(runtime.canonicalRoot).catch((closeError) => {
          logger.event("watcher.close_failed", { root_id: rootId(runtime.canonicalRoot), error: String(closeError) });
        });
        throw error;
      }
      return super.ensureWatcher(runtime);
    }

    async runManagedJob(root) {
      await settleLeakedHandles();
      note(root);
      try {
        const inspection = inspectExistingIndex(engine, root);
        if (inspection.state !== READY) throw refusalFor(inspection);
        this.assertTrusted(inspection);
        const runtime = await this.runtimeManager.activate(root);
        this.assertRootTrusted(root);
        this.ensureWatcher(runtime);
        return await this.submitIndex(
          runtime,
          { root: runtime.canonicalRoot, runtimeOverridesAreEphemeral: true },
          "manual",
          true,
          undefined,
        );
      } catch (error) {
        if (typeof error?.code === "string" && error.code.includes("LOCK.BUSY")) {
          throw new DaemonError("INDEX_BUSY", "Another process holds the index lock.", true);
        }
        throw error;
      }
    }

    async search(input, requestOptions = {}) {
      await settleLeakedHandles();
      const requested = await runtimeManager.resolveRequestedRoot(input.root, false);
      const inspection = inspectExistingIndex(engine, requested);
      if (inspection.state !== READY) {
        throw new DaemonError(
          "INDEX_MISSING",
          `Managed search needs an existing offline index (${inspection.state}); use native Grep or rg.`,
        );
      }
      this.assertTrusted(inspection);
      const root = note(inspection.root);
      const forced = { ...input, root, freshness: "wait_for_fresh", autoUpdate: true };
      const { result, recovered } = await holder.controller.gate(root, async (attempt) => {
        const validate = () => {
          const current = inspectExistingIndex(engine, root);
          if (current.state !== READY) throw refusalFor(current);
          this.assertTrusted(current);
        };
        for (;;) {
          validate();
          let response;
          try {
            response = await super.search(forced, requestOptions);
          } catch {
            throw new DaemonError("MANAGED_SEARCH_FAILED", "The index search could not be confirmed fresh; use native Grep.", true);
          }
          validate();
          if (response.freshness === "fresh") return response;
          if (attempt.abandoned) throw new DaemonError("FRESHNESS_BARRIER_TIMEOUT", "search abandoned", true);
          await sleep(50);
        }
      });
      const warning = recovered
        ? `\nrefresh_warning: ${recovered.code}: ${recovered.message} (raised ${recovered.at}; cleared by a verified refresh)`
        : "";
      // The agent toolset renders `freshness:` verbatim, so the recovered
      // warning rides on that line.
      return { ...result, freshness: `fresh${warning}` };
    }
  }

  const controller = new ManagedController({
    warnings: options.warnings,
    reservations: options.reservations,
    barrierMs: options.barrierMs,
    now: options.now,
    logger: options.logger,
    runJob: (root) => backend.runManagedJob(root),
    takeResult: (root) => {
      const result = lastResults.get(root);
      lastResults.delete(root);
      return result;
    },
  });
  holder.controller = controller;
  const backend = new ManagedBackend();
  holder.backend = backend;
  backend.controller = controller;
  backend.refuse = refuse;
  return backend;
}

export { ManagedIndexError, refusalFor };
