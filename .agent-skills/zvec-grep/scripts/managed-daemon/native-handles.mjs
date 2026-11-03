// The package's storage constructors open `files.zvec` before `index.zvec`; if
// the second open throws (a corrupt index), the first handle is never closed
// and keeps the native collection lock until the wrapper is garbage-collected.
// That would turn one corrupt-index error into a permanent "cannot open"
// failure even after the user repairs the files, so failures that can leave
// such a handle behind trigger a collection before they are reported.
import v8 from "node:v8";
import vm from "node:vm";

let collect;
try {
  v8.setFlagsFromString("--expose-gc");
  collect = vm.runInNewContext("gc");
} catch {
  collect = undefined;
}

export function nativeHandleCollectionAvailable() {
  return typeof collect === "function";
}

let suspected = false;

/** Record a storage open failure; the handle can only be freed once the error is unreachable. */
export function noteOpenFailure(error) {
  if (isOpenFailure(error)) suspected = true;
}

/**
 * Collect leaked wrappers left by an earlier open failure. Must run when the
 * failing request's error object is no longer referenced (a collection inside
 * the `catch` that holds the error does not free the handle), i.e. at the
 * start of the next operation.
 */
export async function settleLeakedHandles() {
  if (!suspected || !collect) return false;
  suspected = false;
  for (let round = 0; round < 3; round++) {
    collect();
    await new Promise((resolve) => setImmediate(resolve));
  }
  return true;
}

export function isOpenFailure(error) {
  return (
    typeof error?.code === "string" &&
    (error.code.includes("STORAGE.ZVEC_OPEN_FAILED") || error.code.includes("ZVEC_COLLECTION_MISSING") || error.code.includes("ZVEC_FILE_META_MISSING"))
  );
}
