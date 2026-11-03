// Test-only preload (NODE_OPTIONS=--import) that runs INSIDE the managed daemon's
// sandboxed listener process once the daemon reports ready, and records facts about
// the live process that cannot be observed from outside. It never runs in the
// launcher, in workers, or in any process that is not the daemon listener.
//   ZVEC_TEST_PROBE_OUT  where to write the JSON result (inside the daemon home)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isMainThread } from "node:worker_threads";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const OUT = process.env.ZVEC_TEST_PROBE_OUT;
const HOME = process.env.ZVEC_GREP_HOME;
const PACKAGE = process.env.ZVEC_GREP_PACKAGE_DIR;
const isDaemon = isMainThread && OUT && HOME && PACKAGE
  && process.env.ZVEC_MANAGED_OS_SANDBOX === "darwin-sandbox-exec"
  && /managed-daemon[\\/]main\.mjs$/.test(process.argv[1] ?? "");

if (isDaemon) {
  const timer = setInterval(async () => {
    let record;
    try { record = JSON.parse(readFileSync(join(HOME, "daemon", "instance.lock"), "utf8")); } catch { return; }
    if (record.pid !== process.pid || record.ready !== true) return;
    clearInterval(timer);
    const result = { pid: process.pid, envNames: Object.keys(process.env).sort() };
    try {
      const requireFromPackage = createRequire(join(PACKAGE, "package.json"));
      const cjsPath = requireFromPackage.resolve("@zvec/zvec");
      // The very URL the engine's own `import ... from "@zvec/zvec"` resolves to, so this is the
      // daemon's already-evaluated module instance (ESM snapshots the export once).
      const esm = await import(pathToFileURL(join(dirname(cjsPath), "index.mjs")).href);
      const target = join(HOME, "probe-native-create", ".zvec-probe", "index.zvec");
      esm.ZVecInitialize({ logLevel: esm.ZVecLogLevel.WARN });
      const schema = new esm.ZVecCollectionSchema({
        name: "probe",
        fields: [{ name: "text", dataType: esm.ZVecDataType.STRING, nullable: false }],
        vectors: { name: "embedding", dataType: esm.ZVecDataType.VECTOR_FP32, dimension: 4, indexParams: { indexType: esm.ZVecIndexType.HNSW, metricType: esm.ZVecMetricType.COSINE } },
      });
      try {
        esm.ZVecCreateAndOpen(target, schema);
        result.nativeCreate = { threw: false };
      } catch (error) {
        result.nativeCreate = { threw: true, code: error?.code ?? null, message: String(error?.message ?? error).slice(0, 200) };
      }
      result.nativeCreate.pathExists = existsSync(target) || existsSync(dirname(target));
    } catch (error) {
      result.probeError = String(error?.message ?? error);
    }
    writeFileSync(OUT, `${JSON.stringify(result)}\n`);
  }, 50);
  timer.unref();
}
