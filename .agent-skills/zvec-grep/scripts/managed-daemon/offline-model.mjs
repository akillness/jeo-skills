// Offline embedding-model factory for the model pool.
//
// Only catalog `local/*` Model2Vec models are allowed, and only when a
// complete, integrity-checked snapshot is already in the model cache.
// Artifacts are verified directly without calling the package downloader,
// which can create cache files even with network access disabled.
import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { ManagedIndexError } from "./existing-index.mjs";

export async function createOfflineModelFactory(pkg) {
  const [catalog, factory, paths] = await Promise.all([
    pkg.importInternal("engine/models/catalog.js"),
    pkg.importInternal("engine/models/factory.js"),
    pkg.importInternal("engine/utils/path.js"),
  ]);

  const cacheDir = () =>
    resolve(process.env.ZVEC_GREP_MODEL_CACHE ?? join(paths.defaultHome(), "models"));

  function entryFor(request) {
    if (request.model.provider !== "local") {
      throw new ManagedIndexError(
        "MANAGED_REMOTE_PROVIDER_REFUSED",
        `embedding provider ${request.model.provider} is refused: the managed daemon is offline and local-only`,
      );
    }
    const entry = catalog.getEmbeddingModelCatalogEntry(`local/${request.model.name}`);
    if (!entry || entry.backend !== "model2vec") {
      throw new ManagedIndexError(
        "MANAGED_MODEL_UNSUPPORTED",
        `local/${request.model.name} is not an offline-capable Model2Vec catalog model`,
      );
    }
    return entry;
  }

  async function assertCached(entry) {
    const modelCache = cacheDir();
    const localPaths = {
      [entry.modelFile]: entry.modelFile.split("/").pop(),
      [entry.tokenizerFile]: "tokenizer/tokenizer.json",
    };
    const sources = [
      {
        kind: "huggingface",
        repo: entry.sources.huggingFace.repo,
        revision: entry.sources.huggingFace.revision,
        cacheDirectory: join(
          modelCache,
          "model2vec",
          entry.sources.huggingFace.repo.replaceAll("/", "--"),
          entry.sources.huggingFace.revision,
        ),
        localPaths,
      },
      {
        kind: "modelscope",
        repo: entry.sources.modelScope.repo,
        revision: entry.sources.modelScope.revision,
        cacheDirectory: join(
          modelCache,
          "modelscope",
          "model2vec",
          entry.sources.modelScope.repo.replaceAll("/", "--"),
          entry.sources.modelScope.revision,
        ),
        localPaths,
      },
    ];
    for (const source of sources) {
      try {
        const artifactPaths = {};
        for (const artifact of entry.artifacts) {
          const path = join(source.cacheDirectory, source.localPaths[artifact.path]);
          const info = statSync(path);
          if (!info.isFile() || info.size !== artifact.size) throw new Error("invalid artifact size");
          const hash = createHash("sha256");
          for await (const chunk of createReadStream(path)) hash.update(chunk);
          if (hash.digest("hex") !== artifact.sha256) throw new Error("invalid artifact digest");
          artifactPaths[artifact.path] = path;
        }
        // The upstream backend writes a default config if this file is absent.
        if (!statSync(join(source.cacheDirectory, "tokenizer", "tokenizer_config.json")).isFile()) continue;
        return { source, paths: artifactPaths };
      } catch {
        // Try the next already-cached source without creating any files.
      }
    }
    throw new ManagedIndexError(
      "MANAGED_MODEL_NOT_CACHED",
      `${entry.reference} has no complete offline snapshot in ${modelCache}; the managed daemon never downloads models`,
    );
  }

  return {
    async createModel(request) {
      const entry = entryFor(request);
      const artifacts = await assertCached(entry);
      const model = factory.createEmbeddingModel(entry.reference, {});
      model.dependencies.resolveArtifacts = async () => artifacts;
      return model;
    },
    // Used by search/refresh to refuse non-local indexes before any model work.
    assertOfflineCapable(request) {
      entryFor(request);
    },
  };
}
