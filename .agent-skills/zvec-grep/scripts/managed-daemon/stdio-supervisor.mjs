// The supervisor owns stdio; the child owns the MCP bridge, not the daemon.
//
// Isolation contract: this process owns the search deadlines, so it never parses
// or serializes frame contents. Client bytes are split into frames and scanned
// for bounded spans (`id`, `method`, `params.name`, `params.requestId`) by the
// byte-level envelope scanner; every JSON.parse / JSON.stringify runs in a frame
// worker thread that one request owns while it is active. Timeouts, stop and
// parse-error responses are built here by concatenating static ASCII with the
// client's captured id bytes, so a stalled worker can delay only its own
// request's frames and never another request's deadline, cancel or progress.
//
// Ordering: client -> child forwarding preserves client arrival order (one
// frame per write, in sequence). Child -> client frames are ordered per request
// (a request's progress and response share its worker); supervisor-generated
// frames bypass the workers. Every write is one whole frame.
import { randomUUID, randomBytes } from "node:crypto";
import { createEnvelopeScanner, createLineFramer, decodeScalar } from "./envelope-scanner.mjs";
import { createFramePool, standalone } from "./frame-worker.mjs";

const SEARCH_DEADLINE_MS = 29_000;
const SEARCH_METHOD = "tools/call";
const SEARCH_TOOL = "zvec_grep_search";
const CANCEL_METHOD = "notifications/cancelled";
// Bound on frames handed to workers but not yet written, per direction.
const INFLIGHT_LIMIT = 32;
// Multiples of the search deadline: a client that never drains stdout, a child
// that never exits after client EOF, and in-flight workers at child exit.
const OUTPUT_STALL_FACTOR = 4;
const EOF_GRACE_FACTOR = 6;
const DRAIN_GRACE_FACTOR = 4;
const SCAN_TARGETS = Object.freeze({
  id: ["id"], method: ["method"], name: ["params", "name"], requestId: ["params", "requestId"],
});

const ascii = (text) => Buffer.from(text, "latin1");
// Static frame fragments; never produced by JSON.stringify so a patched or
// stalled serializer in this process cannot reach the deadline path.
const HEAD = ascii('{"jsonrpc":"2.0","id":');
const TIMEOUT_TAIL = ascii(',"result":{"isError":true,"content":[{"type":"text","text":"Fresh search timed out; use native Grep or rg instead."}]}}\n');
const STOPPED_SEARCH_TAIL = ascii(',"result":{"isError":true,"content":[{"type":"text","text":"Managed search bridge stopped; use native Grep or rg instead."}]}}\n');
const STOPPED_TAIL = ascii(',"error":{"code":-32603,"message":"Managed bridge stopped"}}\n');
const DUPLICATE_TAIL = ascii(',"error":{"code":-32600,"message":"Duplicate active request ID"}}\n');
const PARSE_ERROR = ascii('{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}\n');
const CANCEL_HEAD = ascii('{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":"');
const CANCEL_TAIL = ascii('","reason":"search deadline exceeded"}}\n');

/** Canonical key of a client id span: JSON.parse value identity for scalars, unique for containers. */
function canonicalKey(span, bytes, unique) {
  if (span.type === "object" || span.type === "array") return `container:${unique}`;
  const decoded = decodeScalar(bytes);
  if (decoded === undefined) return `container:${unique}`;
  return `${span.type}:${span.type === "number" ? String(decoded) : decoded}`;
}

/** Sequence number of the first mapped id (`<prefix><digits>`) mentioned in a child frame, else 0. */
function mappedSequence(frame, prefixBytes) {
  const buf = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
  const at = buf.indexOf(prefixBytes);
  if (at < 0) return 0;
  let i = at + prefixBytes.length;
  let sequence = 0;
  while (i < buf.length && buf[i] >= 0x30 && buf[i] <= 0x39 && sequence < Number.MAX_SAFE_INTEGER / 10) sequence = sequence * 10 + (buf[i++] - 0x30);
  return sequence;
}

export function superviseBridge({ child, input = process.stdin, output = process.stdout, deadlineMs = SEARCH_DEADLINE_MS }) {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0 || deadlineMs > SEARCH_DEADLINE_MS) throw new Error("invalid search deadline");
  const prefix = `managed-supervisor-${randomUUID()}-`;
  const prefixBytes = ascii(prefix);
  const sentinel = randomBytes(16).toString("hex");
  let crashed = false;
  const pool = createFramePool({ prefix, sentinel, onCrash: () => { crashed = true; failClosed(); } });
  const generalIngress = pool.acquire();
  const generalEgress = pool.acquire();

  const active = new Map(); // sequence -> pending request
  const originals = new Map(); // canonical client id -> sequence
  const progress = new Map(); // sequence -> { tokenBytes } for mapped progress tokens
  let sequence = 0;
  let unique = 0;
  const ingress = new Map(); // arrival sequence -> { done, apply }
  let nextIngress = 1;
  let ingressSequence = 0;
  let ingressInflight = 0;
  let egressInflight = 0;
  let outputBlocked = false;
  let childInputBlocked = false;
  let inputEnded = false;
  let inputClosed = false;
  let childInputEnded = false;
  let finished = false;
  let stallTimer, eofTimer, drainTimer;

  // ---- output (client) ----
  const stalled = () => {
    stallTimer = undefined;
    if (finished) return;
    output.destroy();
    closeInput();
    child.stdout.resume();
    child.kill("SIGKILL");
  };
  const armStall = () => {
    outputBlocked = true;
    updateInputFlow();
    updateEgressFlow();
    stallTimer = setTimeout(stalled, deadlineMs * OUTPUT_STALL_FACTOR);
    output.once("drain", () => {
      clearTimeout(stallTimer);
      stallTimer = undefined;
      outputBlocked = false;
      updateInputFlow();
      updateEgressFlow();
    });
  };
  const writeOutput = (...parts) => {
    if (output.destroyed) return;
    let ok = true;
    if (parts.length === 1) ok = output.write(parts[0]);
    else {
      output.cork();
      for (const part of parts) ok = output.write(part);
      output.uncork();
    }
    if (!ok && !outputBlocked) armStall();
  };
  const spliced = (reply, middle) => writeOutput(reply.bytes.subarray(0, reply.spliceStart), middle, reply.bytes.subarray(reply.spliceEnd));

  // ---- child stdin ----
  const writeChild = (bytes) => {
    if (!child.stdin.writable) { closeInput(); return; }
    if (!child.stdin.write(bytes) && !childInputBlocked) {
      childInputBlocked = true;
      updateInputFlow();
      child.stdin.once("drain", () => { childInputBlocked = false; updateInputFlow(); });
    }
  };
  const endChildInput = () => {
    if (childInputEnded) return;
    childInputEnded = true;
    if (child.stdin.writable) child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) {
      eofTimer = setTimeout(() => { eofTimer = undefined; if (!finished) child.kill("SIGKILL"); }, deadlineMs * EOF_GRACE_FACTOR);
    }
  };

  // ---- flow control ----
  const updateInputFlow = () => {
    if (inputClosed) return;
    if (outputBlocked || childInputBlocked || ingressInflight >= INFLIGHT_LIMIT) input.pause();
    else input.resume();
  };
  const updateEgressFlow = () => {
    if (finished) return;
    if (outputBlocked || egressInflight >= INFLIGHT_LIMIT) child.stdout.pause();
    else child.stdout.resume();
  };

  // ---- request bookkeeping ----
  const remove = (seq) => {
    const pending = active.get(seq);
    if (!pending) return undefined;
    clearTimeout(pending.timer);
    active.delete(seq);
    originals.delete(pending.key);
    progress.delete(seq);
    pool.release(pending.worker);
    return pending;
  };
  const expire = (seq) => {
    const pending = remove(seq);
    if (!pending) return;
    writeOutput(HEAD, pending.idBytes, TIMEOUT_TAIL);
    if (pending.forwarded && child.stdin.writable) writeChild(Buffer.concat([CANCEL_HEAD, ascii(pending.mapped), CANCEL_TAIL]));
  };

  // ---- ingress: client -> child, strict arrival order ----
  const flushIngress = () => {
    while (ingress.has(nextIngress)) {
      const entry = ingress.get(nextIngress);
      if (!entry.done) break;
      ingress.delete(nextIngress++);
      ingressInflight--;
      entry.apply();
    }
    if (inputEnded && ingress.size === 0) endChildInput();
    updateInputFlow();
  };
  const dispatchIngress = (worker, job, bytes, apply) => {
    const seq = ++ingressSequence;
    const entry = { done: false, apply: () => {} };
    ingress.set(seq, entry);
    ingressInflight++;
    worker.run({ direction: "ingress", ...job }, bytes, (reply) => {
      entry.done = true;
      entry.apply = () => apply(reply);
      flushIngress();
    });
    updateInputFlow();
  };
  const onClientFrame = (frame) => {
    const receivedAt = performance.now();
    if (!frame.valid) { writeOutput(PARSE_ERROR); return; }
    const { id: idSpan, method: methodSpan, name: nameSpan, requestId: requestSpan } = frame.values;
    const method = methodSpan?.type === "string" ? decodeScalar(frame.bytes.subarray(methodSpan.start, methodSpan.end)) : undefined;
    if (typeof method === "string" && idSpan) {
      const idBytes = standalone(frame.bytes.subarray(idSpan.start, idSpan.end));
      const key = canonicalKey(idSpan, idBytes, ++unique);
      if (originals.has(key)) { writeOutput(HEAD, idBytes, DUPLICATE_TAIL); return; }
      const seq = ++sequence;
      const mapped = `${prefix}${seq}`;
      const search = method === SEARCH_METHOD && nameSpan?.type === "string" && decodeScalar(frame.bytes.subarray(nameSpan.start, nameSpan.end)) === SEARCH_TOOL;
      const expiresAt = search ? receivedAt + deadlineMs : Infinity;
      const pending = { seq, key, idBytes, mapped, search, expiresAt, forwarded: false, worker: pool.acquire(), timer: undefined };
      if (search) pending.timer = setTimeout(() => expire(seq), Math.max(0, expiresAt - performance.now()));
      active.set(seq, pending);
      originals.set(key, seq);
      dispatchIngress(pending.worker, { op: "request", mapped, progressToken: `${mapped}-progress` }, standalone(frame.bytes), (reply) => {
        if (!reply.ok) {
          if (reply.error === "parse") { remove(seq); writeOutput(PARSE_ERROR); }
          return; // terminated: the request already expired or the bridge is stopping
        }
        const current = active.get(seq);
        if (!current) return; // expired before it could be forwarded; nothing to cancel in the child
        current.forwarded = true;
        if (reply.hasProgress) progress.set(seq, { tokenBytes: Buffer.from(reply.tokenJson, "utf8") });
        writeChild(reply.bytes);
      });
      return;
    }
    if (method === CANCEL_METHOD) {
      if (!requestSpan) return;
      const seq = originals.get(canonicalKey(requestSpan, frame.bytes.subarray(requestSpan.start, requestSpan.end), 0));
      const pending = seq === undefined ? undefined : active.get(seq);
      if (!pending) return; // unknown or already finished: never forwarded, as before
      dispatchIngress(pending.worker, { op: "cancel", requestId: pending.mapped }, standalone(frame.bytes), (reply) => { if (reply.ok) writeChild(reply.bytes); });
      return;
    }
    dispatchIngress(generalIngress, { op: "other" }, standalone(frame.bytes), (reply) => {
      if (reply.ok) writeChild(reply.bytes);
      else if (reply.error === "parse") writeOutput(PARSE_ERROR);
    });
  };

  // ---- egress: child -> client, ordered per request ----
  let onEgressDrained;
  const relayEgress = (reply) => {
    if (!reply.ok) {
      if (reply.error === "parse" || reply.error === "sentinel") failClosed();
      return;
    }
    if (reply.kind === "response") {
      const pending = remove(reply.sequence);
      if (!pending) return;
      if (performance.now() >= pending.expiresAt) writeOutput(HEAD, pending.idBytes, TIMEOUT_TAIL);
      else spliced(reply, pending.idBytes);
      return;
    }
    if (reply.kind === "progress") {
      const entry = progress.get(reply.sequence);
      const pending = active.get(reply.sequence);
      if (!entry || !pending || performance.now() >= pending.expiresAt) return;
      spliced(reply, entry.tokenBytes);
      return;
    }
    writeOutput(reply.bytes);
  };
  const applyEgress = (reply) => {
    egressInflight--;
    relayEgress(reply);
    updateEgressFlow();
    if (egressInflight === 0) onEgressDrained?.();
  };
  const onChildFrame = (frame) => {
    if (output.destroyed) return;
    const seq = mappedSequence(frame, prefixBytes);
    const worker = active.get(seq)?.worker ?? generalEgress;
    egressInflight++;
    worker.run({ direction: "egress" }, standalone(frame), applyEgress);
    updateEgressFlow();
  };

  // ---- lifecycle ----
  const scanner = createEnvelopeScanner({ targets: SCAN_TARGETS });
  const onInputData = (chunk) => { for (const frame of scanner.push(chunk)) onClientFrame(frame); };
  const onInputEof = (flush) => {
    if (inputEnded) return;
    inputEnded = true;
    if (flush) { const tail = scanner.end(); if (tail) onClientFrame(tail); }
    flushIngress();
  };
  const closeInput = () => {
    if (inputClosed) return;
    inputClosed = true;
    input.off("data", onInputData);
    input.pause();
    onInputEof(false);
  };
  const failClosed = () => { closeInput(); child.kill(); };
  const framer = createLineFramer();
  child.stdout.on("data", (chunk) => { for (const frame of framer.push(chunk)) onChildFrame(frame); });
  child.stdout.on("end", () => { const tail = framer.end(); if (tail) onChildFrame(tail); });
  child.stdin.on("error", closeInput);
  input.on("data", onInputData);
  input.on("end", () => onInputEof(true));
  input.on("close", () => onInputEof(false));
  input.on("error", () => onInputEof(false));

  const finalize = (resolve, code, signal) => {
    if (finished) return;
    finished = true;
    clearTimeout(stallTimer);
    clearTimeout(eofTimer);
    closeInput();
    // Let frames already handed to workers finish (bounded), then fail the rest.
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(drainTimer);
      onEgressDrained = undefined;
      for (const seq of [...active.keys()]) {
        const pending = remove(seq);
        writeOutput(HEAD, pending.idBytes, pending.search ? STOPPED_SEARCH_TAIL : STOPPED_TAIL);
      }
      pool.terminateAll();
      resolve({ code, signal });
    };
    if (egressInflight === 0 || crashed) { settle(); return; }
    onEgressDrained = settle;
    drainTimer = setTimeout(settle, deadlineMs * DRAIN_GRACE_FACTOR);
  };
  return new Promise((resolve, reject) => {
    child.once("error", (error) => { pool.terminateAll(); reject(error); });
    child.once("close", (code, signal) => finalize(resolve, code, signal));
  });
}
