// Frame workers parse and serialize JSON-RPC frames off the supervisor's event
// loop. The supervisor (deadline owner) only ever handles bounded metadata and
// transferred byte buffers; every JSON.parse / JSON.stringify of frame contents
// runs here, in a worker thread that one request owns for its lifetime. A stall
// inside a worker therefore delays that request's own frames and nothing else.
//
// Jobs are posted as structured-clone messages whose `bytes` ArrayBuffer is
// transferred (never copied) in both directions. Replies carry the rewritten
// frame plus the byte offsets of a random sentinel where the supervisor splices
// the client's original id / progress-token bytes back in, so restoration is
// byte-exact and never requires the main thread to parse or serialize.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const ROLE = "zvec-managed-frame-worker";
const utf8 = new TextDecoder("utf-8");
const encoder = new TextEncoder();

/** Copy any byte view into a fresh, standalone Uint8Array whose buffer can be transferred. */
export function standalone(view) {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serialize(message) {
  return encoder.encode(`${JSON.stringify(message)}\n`);
}

/** Byte offsets of the quoted sentinel inside serialized text; the sentinel is ASCII and unescaped. */
function sentinelSpan(bytes, sentinel) {
  const quoted = Buffer.from(`"${sentinel}"`, "latin1");
  const start = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).indexOf(quoted);
  return start < 0 ? null : [start, start + quoted.length];
}

/**
 * Client -> child frame. `op: "request"` rewrites `id` to `mapped` and, when the
 * request carries `params._meta.progressToken`, rewrites it to `progressToken`.
 * `op: "cancel"` rewrites `params.requestId` to `requestId`. `op: "other"`
 * reserializes unchanged (notifications, client responses, non-object roots).
 */
function ingress(job) {
  let message;
  try { message = JSON.parse(utf8.decode(job.bytes)); } catch { return { seq: job.seq, ok: false, error: "parse" }; }
  const reply = { seq: job.seq, ok: true, kind: job.op, hasProgress: false, tokenJson: undefined };
  if (job.op === "request" && isObject(message)) {
    message.id = job.mapped;
    const params = message.params;
    if (isObject(params) && isObject(params._meta) && params._meta.progressToken !== undefined) {
      reply.hasProgress = true;
      reply.tokenJson = JSON.stringify(params._meta.progressToken);
      params._meta.progressToken = job.progressToken;
    }
  } else if (job.op === "cancel" && isObject(message) && isObject(message.params)) {
    message.params.requestId = job.requestId;
  }
  reply.bytes = serialize(message);
  return reply;
}

/**
 * Child -> client frame. A response whose `id` is one of the supervisor's mapped
 * ids (`<prefix><sequence>`) is reported as `kind: "response"` with the id replaced
 * by the sentinel; a `notifications/progress` whose token is a mapped token
 * (`<prefix><sequence>-progress`) is `kind: "progress"` with the token replaced.
 * Anything else is `kind: "other"` and reserialized unchanged.
 */
function egress(job, { prefix, sentinel }) {
  let message;
  try { message = JSON.parse(utf8.decode(job.bytes)); } catch { return { seq: job.seq, ok: false, error: "parse" }; }
  const reply = { seq: job.seq, ok: true, kind: "other" };
  if (isObject(message)) {
    const { id, method } = message;
    if (typeof id === "string" && id.startsWith(prefix) && !method) {
      const sequence = Number(id.slice(prefix.length));
      if (Number.isSafeInteger(sequence) && sequence > 0 && String(sequence) === id.slice(prefix.length)) {
        reply.kind = "response";
        reply.sequence = sequence;
        message.id = sentinel;
      }
    } else if (method === "notifications/progress" && isObject(message.params) && typeof message.params.progressToken === "string") {
      const token = message.params.progressToken;
      if (token.startsWith(prefix) && token.endsWith("-progress")) {
        const middle = token.slice(prefix.length, -"-progress".length);
        const sequence = Number(middle);
        if (Number.isSafeInteger(sequence) && sequence > 0 && String(sequence) === middle) {
          reply.kind = "progress";
          reply.sequence = sequence;
          message.params.progressToken = sentinel;
        }
      }
    }
  }
  reply.bytes = serialize(message);
  if (reply.kind !== "other") {
    const span = sentinelSpan(reply.bytes, sentinel);
    if (!span) return { seq: job.seq, ok: false, error: "sentinel" };
    [reply.spliceStart, reply.spliceEnd] = span;
  }
  return reply;
}

if (!isMainThread && workerData?.role === ROLE) {
  const config = { prefix: workerData.prefix, sentinel: workerData.sentinel };
  parentPort.on("message", (job) => {
    const reply = job.direction === "ingress" ? ingress(job) : egress(job, config);
    parentPort.postMessage(reply, reply.bytes ? [reply.bytes.buffer] : []);
  });
}

/**
 * Main-thread pool. `acquire()` hands out a worker that the caller owns until
 * `release(worker)`; a released worker that still has jobs in flight is stalled
 * or stale and is terminated instead of being reused. Workers are unref'd so
 * they never keep the supervisor process alive on their own.
 */
export function createFramePool({ prefix, sentinel, onCrash }) {
  const url = new URL("./frame-worker.mjs", import.meta.url);
  const all = new Set();
  const idle = [];
  let closed = false;

  function spawn() {
    const jobs = new Map();
    let sequence = 0;
    let dead = false;
    const execArgv = [];
    for (let i = 0; i < process.execArgv.length; i++) {
      const arg = process.execArgv[i];
      if (arg.startsWith("--input-type=")) continue;
      if (arg === "--input-type") { i++; continue; }
      execArgv.push(arg);
    }
    const thread = new Worker(url, { execArgv, workerData: { role: ROLE, prefix, sentinel } });
    thread.unref();
    const handle = {
      run(job, bytes, done) {
        if (dead) { done({ seq: 0, ok: false, error: "terminated" }); return; }
        const seq = ++sequence;
        jobs.set(seq, done);
        if (jobs.size === 1) thread.ref(); // in-flight frames keep the supervisor alive
        thread.postMessage({ ...job, seq, bytes }, [bytes.buffer]);
      },
      get busy() { return jobs.size > 0; },
      get dead() { return dead; },
      terminate() {
        if (dead) return;
        dead = true;
        all.delete(handle);
        const pending = [...jobs.values()];
        jobs.clear();
        thread.terminate().catch(() => {});
        for (const done of pending) done({ seq: 0, ok: false, error: "terminated" });
      },
    };
    thread.on("message", (reply) => {
      const done = jobs.get(reply.seq);
      if (!done) return;
      jobs.delete(reply.seq);
      if (jobs.size === 0) thread.unref();
      done(reply);
    });
    const crashed = () => {
      if (dead) return;
      dead = true;
      all.delete(handle);
      const pending = [...jobs.values()];
      jobs.clear();
      for (const done of pending) done({ seq: 0, ok: false, error: "crash" });
      if (!closed) onCrash?.();
    };
    thread.on("error", crashed);
    thread.on("exit", crashed);
    all.add(handle);
    return handle;
  }

  return {
    acquire() {
      while (idle.length > 0) {
        const worker = idle.pop();
        if (!worker.dead) return worker;
      }
      return spawn();
    },
    release(worker) {
      if (worker.dead) return;
      if (worker.busy || closed) { worker.terminate(); return; }
      idle.push(worker);
    },
    terminateAll() {
      closed = true;
      for (const worker of [...all]) worker.terminate();
      idle.length = 0;
    },
  };
}
