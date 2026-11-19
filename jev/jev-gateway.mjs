#!/usr/bin/env node
/**
 * Jev Local Queue & Coalescing Gateway (jev-gateway.mjs)
 *
 * Sits on loopback (default 127.0.0.1:8017) in front of local llama-server
 * (default 127.0.0.1:18017) so concurrent coding-agent sessions never collide,
 * starve interactive hooks, duplicate identical inference, or thrash Apple
 * Silicon / local VRAM.
 *
 * Features:
 *   - 3-lane priority queue (P0 interactive > P1 turn-start > P2 background) + aging
 *   - Per-session Deficit Round Robin (DRR) fairness within each priority lane
 *   - Cross-session single-flight coalescing + bounded in-memory LRU response cache
 *   - Deadline-aware & client-disconnect early cancellation before upstream dispatch
 *   - Backpressure load-shedding (503 + Retry-After on P2 saturation)
 *   - Transparent /health, /v1/models, /props, /slots proxy + /jev/queue-metrics
 */

import { createHash } from 'node:crypto';
import http from 'node:http';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MiB safety cap
const P0_OPS = new Set(['review', 'gate-tool', 'decide-action', 'moderate']);
const P2_OPS = new Set(['prune-context', 'evaluate-run', 'manage-memory', 'calibrate-judge']);

export function formatHostForUrl(host) {
  const h = String(host || '').trim();
  return h.includes(':') && !h.startsWith('[') ? `[${h}]` : h;
}

export function isLoopbackHost(host) {
  const h = String(host || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  return h === '127.0.0.1' || h === 'localhost' || h === '::1';
}

export function stableCanonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(v => (v === undefined ? 'null' : stableCanonicalJson(v))).join(',')}]`;
  }
  const keys = Object.keys(value).filter(k => value[k] !== undefined).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableCanonicalJson(value[k])}`).join(',')}}`;
}

export function inferPriorityLane(opHeader, parsedBody) {
  const op = String(opHeader || '').trim().toLowerCase();
  if (P0_OPS.has(op)) return 0;
  if (P2_OPS.has(op)) return 2;
  if (op === 'route-skills' || op === 'route-model' || op === 'rerank') return 1;

  // Lightweight fallback inference when caller didn't set X-Jev-Op
  const qKeys = parsedBody && typeof parsedBody === 'object' && parsedBody.questions && typeof parsedBody.questions === 'object'
    ? Object.keys(parsedBody.questions)
    : [];
  if (qKeys.some(k => /^(?:permit|safe|allow|gate|action|moderate)/i.test(k))) return 0;
  if (qKeys.some(k => /^(?:drop|compress|eval|memory|calibrat)/i.test(k))) return 2;
  return 1;
}

export function buildCoalesceKey(method, path, parsedBody) {
  if (method !== 'POST' || !parsedBody || typeof parsedBody !== 'object') return null;
  if (parsedBody.stream === true) return null;

  if (path === '/v1/systemone') {
    const core = {
      model: parsedBody.model ?? null,
      state: parsedBody.state ?? null,
      questions: parsedBody.questions ?? null,
      files: parsedBody.files ?? parsedBody.images ?? null,
      temperature: parsedBody.temperature !== undefined ? parsedBody.temperature : null,
      seed: parsedBody.seed !== undefined ? parsedBody.seed : null,
      max_tokens: parsedBody.max_tokens !== undefined ? parsedBody.max_tokens : null,
      n_predict: parsedBody.n_predict !== undefined ? parsedBody.n_predict : null,
      response_format: parsedBody.response_format ?? null,
      grammar: parsedBody.grammar ?? null,
    };
    return createHash('sha256').update(`systemone:${stableCanonicalJson(core)}`).digest('hex');
  }

  if (path === '/v1/completions' || path === '/completions') {
    if (parsedBody.prompt === undefined) return null;
    const maxTokens = Number(parsedBody.max_tokens);
    const nPredict = Number(parsedBody.n_predict);
    const isSingleToken = maxTokens === 1 || nPredict === 1;
    if (!isSingleToken) return null;

    if (Number(parsedBody.temperature) > 0 && parsedBody.seed == null) {
      return null;
    }

    const core = {
      model: parsedBody.model ?? null,
      prompt: parsedBody.prompt,
      max_tokens: parsedBody.max_tokens !== undefined ? parsedBody.max_tokens : (parsedBody.n_predict !== undefined ? parsedBody.n_predict : 1),
      allowed_token_ids: parsedBody.allowed_token_ids ?? null,
      logprobs: parsedBody.logprobs ?? null,
      temperature: parsedBody.temperature !== undefined ? parsedBody.temperature : null,
      top_p: parsedBody.top_p !== undefined ? parsedBody.top_p : null,
      top_k: parsedBody.top_k !== undefined ? parsedBody.top_k : null,
      seed: parsedBody.seed !== undefined ? parsedBody.seed : null,
      stop: parsedBody.stop ?? null,
      logit_bias: parsedBody.logit_bias ?? null,
      grammar: parsedBody.grammar ?? null,
      echo: parsedBody.echo ?? null,
      n_probs: parsedBody.n_probs ?? null,
    };
    return createHash('sha256').update(`completions:${stableCanonicalJson(core)}`).digest('hex');
  }

  if (path === '/v1/chat/completions' || path === '/chat/completions') {
    if (!parsedBody.messages) return null;
    const isDeterministic = Number(parsedBody.temperature) === 0 || (parsedBody.seed != null);
    if (!isDeterministic) return null;

    const core = {
      model: parsedBody.model ?? null,
      messages: parsedBody.messages,
      tools: parsedBody.tools ?? null,
      tool_choice: parsedBody.tool_choice ?? null,
      response_format: parsedBody.response_format ?? null,
      max_tokens: parsedBody.max_tokens !== undefined ? parsedBody.max_tokens : null,
      max_completion_tokens: parsedBody.max_completion_tokens !== undefined ? parsedBody.max_completion_tokens : null,
      seed: parsedBody.seed !== undefined ? parsedBody.seed : null,
      temperature: parsedBody.temperature !== undefined ? parsedBody.temperature : 0,
      top_p: parsedBody.top_p !== undefined ? parsedBody.top_p : null,
      stop: parsedBody.stop ?? null,
      logprobs: parsedBody.logprobs !== undefined ? parsedBody.logprobs : null,
      top_logprobs: parsedBody.top_logprobs !== undefined ? parsedBody.top_logprobs : null,
    };
    return createHash('sha256').update(`chat:${stableCanonicalJson(core)}`).digest('hex');
  }

  return null;
}

export class BoundedLruCache {
  constructor(maxEntries = 512, ttlMs = 300_000, maxBytes = 32 * 1024 * 1024) {
    this.maxEntries = Math.max(0, Number(maxEntries) || 0);
    this.ttlMs = Math.max(0, Number(ttlMs) || 0);
    this.maxBytes = Math.max(0, Number(maxBytes) || 0);
    this.totalBytes = 0;
    this.map = new Map();
  }

  _delete(key) {
    const existing = this.map.get(key);
    if (existing) {
      this.totalBytes = Math.max(0, this.totalBytes - (existing.bytes || 0));
      this.map.delete(key);
    }
  }

  _pruneExpired(now) {
    for (const [k, v] of this.map.entries()) {
      if (v.expiresAt <= now) {
        this._delete(k);
      }
    }
  }

  get(key, now = Date.now()) {
    if (this.maxEntries <= 0 || this.ttlMs <= 0 || !key) return null;
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= now) {
      this._delete(key);
      return null;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit;
  }

  set(key, entry, now = Date.now()) {
    if (this.maxEntries <= 0 || this.ttlMs <= 0 || !key) return;
    const itemBytes = entry?.bodyBuf ? entry.bodyBuf.length : 0;
    if (this.maxBytes > 0 && itemBytes > this.maxBytes) return; // Cannot fit in cache

    if (this.map.has(key)) {
      this._delete(key);
    }
    this._pruneExpired(now);

    while (
      (this.map.size >= this.maxEntries) ||
      (this.maxBytes > 0 && (this.totalBytes + itemBytes) > this.maxBytes)
    ) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      this._delete(oldestKey);
    }

    const record = { ...entry, bytes: itemBytes, expiresAt: now + this.ttlMs };
    this.map.set(key, record);
    this.totalBytes += itemBytes;
  }

  get size() {
    return this.map.size;
  }

  get bytes() {
    return this.totalBytes;
  }
}

export class FairPriorityScheduler {
  constructor({
    concurrency = 1,
    maxQueueDepth = 64,
    softShedRatio = 0.75,
    agingMs = 2000,
    quantumBytes = 4096,
    p0ReservedSlots,
    nowFn = () => Date.now(),
    executor,
  } = {}) {
    this.concurrency = Number.isFinite(Number(concurrency)) ? Math.max(1, Math.floor(Number(concurrency))) : 1;
    this.maxQueueDepth = Number.isFinite(Number(maxQueueDepth)) ? Math.max(4, Math.floor(Number(maxQueueDepth))) : 64;
    const ratio = Number.isFinite(Number(softShedRatio)) ? Number(softShedRatio) : 0.75;
    this.softShedDepth = Math.max(2, Math.floor(this.maxQueueDepth * ratio));
    this.p0QueueReserve = Math.min(4, Math.floor(this.maxQueueDepth / 4));
    this.p0ReservedSlots = p0ReservedSlots !== undefined
      ? Math.max(0, Math.min(this.concurrency - 1, Math.floor(Number(p0ReservedSlots) || 0)))
      : (this.concurrency >= 3 ? 1 : 0);
    this.agingMs = Math.max(100, Number(agingMs) || 2000);
    this.quantumBytes = Math.max(512, Number(quantumBytes) || 4096);
    this.nowFn = nowFn;
    this.executor = executor;

    // 3 lanes: each lane keeps per-session FIFO queues + round-robin cursor + DRR deficit
    this.lanes = [0, 1, 2].map(() => ({
      sessions: new Map(), // sessionId -> { queue: [], deficit: 0 }
      order: [],           // sessionId[]
    }));
    this.active = 0;
    this.totalQueued = 0;
    this.metrics = {
      enqueued: 0,
      dispatched: 0,
      completed: 0,
      cacheHits: 0,
      singleFlightHits: 0,
      shedP2: 0,
      shedFull: 0,
      expiredInQueue: 0,
      abortedBeforeDispatch: 0,
      upstreamErrors: 0,
      totalWaitMs: 0,
      totalUpstreamMs: 0,
    };
  }

  queuedByLane() {
    const out = [0, 0, 0];
    for (let l = 0; l < 3; l += 1) {
      for (const s of this.lanes[l].sessions.values()) out[l] += s.queue.length;
    }
    return { P0: out[0], P1: out[1], P2: out[2] };
  }

  snapshotMetrics() {
    const completedOrErr = this.metrics.completed + this.metrics.upstreamErrors;
    return {
      ...this.metrics,
      active: this.active,
      queued: this.totalQueued,
      queuedByLane: this.queuedByLane(),
      concurrency: this.concurrency,
      p0ReservedSlots: this.p0ReservedSlots,
      p0QueueReserve: this.p0QueueReserve,
      maxQueueDepth: this.maxQueueDepth,
      softShedDepth: this.softShedDepth,
      avgWaitMs: this.metrics.dispatched ? Math.round((this.metrics.totalWaitMs / this.metrics.dispatched) * 100) / 100 : 0,
      avgUpstreamMs: completedOrErr ? Math.round((this.metrics.totalUpstreamMs / completedOrErr) * 100) / 100 : 0,
    };
  }

  _pruneDeadHeads(now) {
    for (let l = 0; l < 3; l += 1) {
      const laneState = this.lanes[l];
      for (const sessionId of [...laneState.order]) {
        const sess = laneState.sessions.get(sessionId);
        if (!sess) continue;
        while (sess.queue.length > 0) {
          const head = sess.queue[0];
          if (head.isCancelled && head.isCancelled()) {
            sess.queue.shift();
            this.totalQueued -= 1;
            this.metrics.abortedBeforeDispatch += 1;
            head.onCancelled?.();
            continue;
          }
          if (head.expiresAt && head.expiresAt <= now) {
            sess.queue.shift();
            this.totalQueued -= 1;
            this.metrics.expiredInQueue += 1;
            head.onExpired?.();
            continue;
          }
          break;
        }
        if (sess.queue.length === 0) {
          laneState.sessions.delete(sessionId);
          laneState.order = laneState.order.filter(id => id !== sessionId);
        }
      }
    }
  }

  promoteJob(job, targetLane) {
    if (!job) return false;
    const rawTarget = Number(targetLane);
    const target = Number.isFinite(rawTarget) ? Math.max(0, Math.min(2, Math.floor(rawTarget))) : 0;
    if (job.lane <= target) return false; // Already in higher or equal priority lane

    const currentLane = job.lane;
    const currentLaneState = this.lanes[currentLane];
    const sess = currentLaneState.sessions.get(job.sessionId);
    if (!sess) return false;

    const idx = sess.queue.indexOf(job);
    if (idx === -1) return false; // Already dispatched / not in queue

    sess.queue.splice(idx, 1);
    if (sess.queue.length === 0) {
      currentLaneState.sessions.delete(job.sessionId);
      currentLaneState.order = currentLaneState.order.filter(id => id !== job.sessionId);
    }

    job.lane = target;
    job.laneEnteredAt = this.nowFn();

    const targetState = this.lanes[target];
    let targetSess = targetState.sessions.get(job.sessionId);
    if (!targetSess) {
      targetSess = { queue: [], deficit: 0 };
      targetState.sessions.set(job.sessionId, targetSess);
      targetState.order.push(job.sessionId);
    }
    targetSess.queue.push(job);
    this._pump();
    return true;
  }

  enqueue(job) {
    const now = this.nowFn();
    this._pruneDeadHeads(now);

    const rawLane = Number(job.lane);
    const lane = Number.isFinite(rawLane) ? Math.max(0, Math.min(2, Math.floor(rawLane))) : 1;

    // Backpressure: protect P0/P1 by shedding P2 past softShedDepth
    if (lane === 2 && this.totalQueued >= this.softShedDepth) {
      this.metrics.shedP2 += 1;
      const err = new Error('Queue backpressure: P2 background request shed');
      err.statusCode = 503;
      err.code = 'QUEUE_BACKPRESSURE';
      throw err;
    }
    // Protect P0 from P1 saturation by shedding P1 at maxQueueDepth - p0QueueReserve
    if (lane === 1 && this.totalQueued >= (this.maxQueueDepth - this.p0QueueReserve)) {
      this.metrics.shedFull += 1;
      const err = new Error('Queue backpressure: P1 request shed to protect P0 reserve');
      err.statusCode = 503;
      err.code = 'QUEUE_FULL';
      throw err;
    }
    // Hard cap for all lanes at maxQueueDepth
    if (this.totalQueued >= this.maxQueueDepth) {
      this.metrics.shedFull += 1;
      const err = new Error('Queue full');
      err.statusCode = 503;
      err.code = 'QUEUE_FULL';
      throw err;
    }

    job.lane = lane;
    job.enqueuedAt = now;
    job.laneEnteredAt = now;
    job.costBytes = Math.max(256, Math.min(36000, Number(job.costBytes) || 1024));
    const sessionId = String(job.sessionId || 'default');
    const laneState = this.lanes[lane];
    let sess = laneState.sessions.get(sessionId);
    if (!sess) {
      sess = { queue: [], deficit: 0 };
      laneState.sessions.set(sessionId, sess);
      laneState.order.push(sessionId);
    }
    sess.queue.push(job);
    this.totalQueued += 1;
    this.metrics.enqueued += 1;
    this._pump();
  }

  _promoteAgedJobs(now) {
    for (let l = 2; l >= 1; l -= 1) {
      const laneState = this.lanes[l];
      for (const sessionId of [...laneState.order]) {
        const sess = laneState.sessions.get(sessionId);
        if (!sess) continue;

        // First prune cancelled/expired jobs at the head of the session queue
        while (sess.queue.length > 0) {
          const head = sess.queue[0];
          if (head.isCancelled && head.isCancelled()) {
            sess.queue.shift();
            this.totalQueued -= 1;
            this.metrics.abortedBeforeDispatch += 1;
            head.onCancelled?.();
            continue;
          }
          if (head.expiresAt && head.expiresAt <= now) {
            sess.queue.shift();
            this.totalQueued -= 1;
            this.metrics.expiredInQueue += 1;
            head.onExpired?.();
            continue;
          }
          break;
        }

        // Now promote aged jobs
        while (sess.queue.length > 0 && (now - sess.queue[0].laneEnteredAt) >= this.agingMs) {
          const promoted = sess.queue.shift();
          const targetLane = l - 1;
          promoted.lane = targetLane;
          promoted.laneEnteredAt = now; // reset timer in promoted lane; enqueuedAt remains intact!
          const targetState = this.lanes[targetLane];
          let targetSess = targetState.sessions.get(sessionId);
          if (!targetSess) {
            targetSess = { queue: [], deficit: 0 };
            targetState.sessions.set(sessionId, targetSess);
            targetState.order.push(sessionId);
          }
          targetSess.queue.push(promoted);
        }

        if (sess.queue.length === 0) {
          laneState.sessions.delete(sessionId);
          laneState.order = laneState.order.filter(id => id !== sessionId);
        }
      }
    }
  }

  _popNextValid(now) {
    this._promoteAgedJobs(now);

    for (let l = 0; l < 3; l += 1) {
      if (this.p0ReservedSlots > 0 && this.active >= (this.concurrency - this.p0ReservedSlots) && l > 0) {
        break; // Only P0 (lane 0) can dispatch when active reaches reserved threshold
      }

      const laneState = this.lanes[l];
      if (laneState.order.length === 0) continue;

      // 1. Prune dead heads across sessions in this lane before crediting quantum
      let activeSessionsExist = false;
      for (const sessionId of [...laneState.order]) {
        const sess = laneState.sessions.get(sessionId);
        if (!sess) {
          laneState.order = laneState.order.filter(id => id !== sessionId);
          continue;
        }
        while (sess.queue.length > 0) {
          const head = sess.queue[0];
          if (head.isCancelled && head.isCancelled()) {
            sess.queue.shift();
            this.totalQueued -= 1;
            this.metrics.abortedBeforeDispatch += 1;
            head.onCancelled?.();
            continue;
          }
          if (head.expiresAt && head.expiresAt <= now) {
            sess.queue.shift();
            this.totalQueued -= 1;
            this.metrics.expiredInQueue += 1;
            head.onExpired?.();
            continue;
          }
          break;
        }
        if (sess.queue.length === 0) {
          laneState.sessions.delete(sessionId);
          laneState.order = laneState.order.filter(id => id !== sessionId);
        } else {
          activeSessionsExist = true;
        }
      }

      if (!activeSessionsExist || laneState.order.length === 0) continue;

      // 2. Check if any session in this lane can already afford its head job
      let canAfford = false;
      for (const sessionId of laneState.order) {
        const sess = laneState.sessions.get(sessionId);
        if (sess && sess.queue.length > 0 && sess.deficit >= sess.queue[0].costBytes) {
          canAfford = true;
          break;
        }
      }

      // If no session can afford, fast-forward deficits by minRounds so at least one session can afford
      if (!canAfford) {
        let minRounds = Infinity;
        for (const sessionId of laneState.order) {
          const sess = laneState.sessions.get(sessionId);
          if (sess && sess.queue.length > 0) {
            const shortfall = sess.queue[0].costBytes - sess.deficit;
            if (shortfall <= 0) {
              minRounds = 0;
              break;
            }
            const rounds = Math.ceil(shortfall / this.quantumBytes);
            if (rounds < minRounds) minRounds = rounds;
          }
        }
        const roundsToAdd = (minRounds === Infinity || minRounds <= 0) ? 1 : minRounds;
        for (const sessionId of laneState.order) {
          const sess = laneState.sessions.get(sessionId);
          if (sess) {
            sess.deficit += roundsToAdd * this.quantumBytes;
          }
        }
      }

      // 3. Dispatch the next session in round-robin order that has enough deficit
      let guard = laneState.order.length;
      while (guard-- > 0 && laneState.order.length > 0) {
        const sessionId = laneState.order[0];
        const sess = laneState.sessions.get(sessionId);
        if (!sess || sess.queue.length === 0) {
          laneState.sessions.delete(sessionId);
          laneState.order.shift();
          continue;
        }
        const head = sess.queue[0];
        if (sess.deficit >= head.costBytes) {
          sess.deficit -= head.costBytes;
          sess.queue.shift();
          this.totalQueued -= 1;
          laneState.order.shift();
          if (sess.queue.length > 0) {
            laneState.order.push(sessionId);
          } else {
            laneState.sessions.delete(sessionId);
          }
          return head;
        }
        // Not enough deficit; rotate session to tail
        laneState.order.shift();
        laneState.order.push(sessionId);
      }
    }
    return null;
  }

  _pump() {
    while (this.active < this.concurrency && this.totalQueued > 0) {
      const now = this.nowFn();
      const job = this._popNextValid(now);
      if (!job) break;
      this.active += 1;
      this.metrics.dispatched += 1;
      this.metrics.totalWaitMs += Math.max(0, now - job.enqueuedAt);
      const started = this.nowFn();
      Promise.resolve()
        .then(() => this.executor(job))
        .then(
          () => {
            this.metrics.completed += 1;
            this.metrics.totalUpstreamMs += Math.max(0, this.nowFn() - started);
          },
          () => {
            this.metrics.upstreamErrors += 1;
            this.metrics.totalUpstreamMs += Math.max(0, this.nowFn() - started);
          },
        )
        .finally(() => {
          this.active -= 1;
          this._pump();
        });
    }
  }
}

export function createJevGateway({
  host = '127.0.0.1',
  port = 8017,
  upstream = 'http://127.0.0.1:18017',
  concurrency = 1,
  maxQueueDepth = 64,
  agingMs = 2000,
  cacheMaxEntries = 512,
  cacheTtlMs = 300_000,
  cacheMaxBytes = 32 * 1024 * 1024,
  p0ReservedSlots,
  defaultTimeoutMs = 60_000,
} = {}) {
  if (!isLoopbackHost(host)) {
    throw new Error(`Refusing non-loopback gateway listen host: ${host}`);
  }
  const upstreamUrl = new URL(upstream);
  if (!isLoopbackHost(upstreamUrl.hostname)) {
    throw new Error(`Refusing non-loopback gateway upstream host: ${upstreamUrl.hostname}`);
  }
  const upstreamOrigin = upstreamUrl.origin;
  const upstreamHostname = upstreamUrl.hostname.replace(/^\[|\]$/g, '');
  const upstreamPort = upstreamUrl.port ? Number(upstreamUrl.port) : (upstreamUrl.protocol === 'https:' ? 443 : 80);

  const cache = new BoundedLruCache(cacheMaxEntries, cacheTtlMs, cacheMaxBytes);
  const inFlight = new Map(); // key -> { refs, lane, job, promise, abortController }

  const scheduler = new FairPriorityScheduler({
    concurrency,
    maxQueueDepth,
    agingMs,
    p0ReservedSlots,
    executor: async (job) => job.run(),
  });

  const agent = new http.Agent({
    keepAlive: true,
    maxSockets: Math.max(4, (Number(concurrency) || 1) * 4),
    keepAliveMsecs: 30_000,
  });

  const HOP_BY_HOP = new Set([
    'host',
    'content-length',
    'connection',
    'transfer-encoding',
    'keep-alive',
    'te',
    'trailer',
    'upgrade',
    'proxy-connection',
  ]);

  function sendJson(res, statusCode, payload, extraHeaders = {}) {
    if (res.writableEnded || res.destroyed) return;
    const raw = Buffer.from(JSON.stringify(payload), 'utf8');
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': String(raw.length),
      ...extraHeaders,
    });
    res.end(raw);
  }

  async function forwardToUpstream(method, pathWithQuery, headers, bodyBuf, timeoutMs, signal) {
    const customConnectionTokens = new Set();
    const connHeader = headers?.connection || headers?.Connection;
    if (typeof connHeader === 'string') {
      for (const token of connHeader.split(',')) {
        const t = token.trim().toLowerCase();
        if (t) customConnectionTokens.add(t);
      }
    }

    const forwardHeaders = {};
    for (const [k, v] of Object.entries(headers || {})) {
      const low = k.toLowerCase();
      if (HOP_BY_HOP.has(low)) continue;
      if (customConnectionTokens.has(low)) continue;
      if (low.startsWith('x-jev-')) continue;
      if (typeof v === 'string') forwardHeaders[k] = v;
    }
    if (bodyBuf && bodyBuf.length > 0 && method !== 'GET' && method !== 'HEAD') {
      forwardHeaders['content-length'] = String(bodyBuf.length);
      if (!forwardHeaders['content-type'] && !forwardHeaders['Content-Type']) {
        forwardHeaders['content-type'] = 'application/json';
      }
    }

    const effectiveTimeoutMs = Math.max(500, timeoutMs || defaultTimeoutMs);
    const deadline = Date.now() + effectiveTimeoutMs;

    const executeRequest = (attempt = 0) => {
      return new Promise((resolve, reject) => {
        const remainingTimeout = Math.max(500, deadline - Date.now());
        let responseReceived = false;
        let settled = false;
        let timer = null;

        const cleanup = () => {
          if (timer) clearTimeout(timer);
          if (signal && onAbort) signal.removeEventListener('abort', onAbort);
        };

        const req = http.request({
          hostname: upstreamHostname,
          port: upstreamPort,
          path: pathWithQuery,
          method,
          headers: forwardHeaders,
          agent,
        }, (res) => {
          responseReceived = true;
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            if (settled) return;
            settled = true;
            cleanup();
            const respBuf = Buffer.concat(chunks);
            const contentType = res.headers['content-type'] || 'application/json';
            resolve({ status: res.statusCode, contentType, bodyBuf: respBuf });
          });
          res.on('error', (err) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err);
          });
        });

        let onAbort = null;
        if (signal) {
          if (signal.aborted) {
            req.destroy(signal.reason || new Error('Aborted'));
            settled = true;
            reject(signal.reason || new Error('Aborted'));
            return;
          }
          onAbort = () => {
            req.destroy(signal.reason || new Error('Aborted'));
            if (!settled) {
              settled = true;
              cleanup();
              reject(signal.reason || new Error('Aborted'));
            }
          };
          signal.addEventListener('abort', onAbort, { once: true });
        }

        timer = setTimeout(() => {
          const err = new Error(`Upstream request timed out after ${remainingTimeout}ms`);
          err.name = 'TimeoutError';
          err.statusCode = 504;
          req.destroy(err);
          if (!settled) {
            settled = true;
            cleanup();
            reject(err);
          }
        }, remainingTimeout);

        req.on('error', (err) => {
          if (settled) return;
          cleanup();
          const isReset = err.code === 'ECONNRESET' || err.code === 'EPIPE' || /socket hang up/i.test(err.message);
          const notAborted = !signal || !signal.aborted;
          const hasDeadline = (deadline - Date.now()) > 1000;
          if (!responseReceived && attempt === 0 && isReset && notAborted && hasDeadline) {
            settled = true;
            resolve(executeRequest(attempt + 1));
            return;
          }
          settled = true;
          reject(err);
        });

        if (bodyBuf && bodyBuf.length > 0 && method !== 'GET' && method !== 'HEAD') {
          req.write(bodyBuf);
        }
        req.end();
      });
    };

    return executeRequest(0);
  }

  let healthCache = null; // { up, cachedAt }
  let healthInFlight = null; // Promise<up>

  async function getUpstreamHealth(pathWithQuery, headers) {
    const now = Date.now();
    if (healthCache && (now - healthCache.cachedAt) < 500) {
      return healthCache.up;
    }
    if (healthInFlight) {
      return healthInFlight;
    }
    healthInFlight = forwardToUpstream('GET', pathWithQuery, headers, null, 3000, null)
      .then((up) => {
        healthCache = { up, cachedAt: Date.now() };
        healthInFlight = null;
        return up;
      })
      .catch((err) => {
        healthInFlight = null;
        throw err;
      });
    return healthInFlight;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      if (req.destroyed) {
        const err = new Error('Client closed connection before body read');
        err.statusCode = 499;
        err.code = 'CLIENT_CLOSED';
        reject(err);
        return;
      }
      const chunks = [];
      let total = 0;
      let done = false;
      const cleanup = () => {
        req.off('data', onData);
        req.off('end', onEnd);
        req.off('error', onError);
        req.off('close', onClose);
        req.off('aborted', onAborted);
      };
      const onData = (chunk) => {
        if (done) return;
        total += chunk.length;
        if (total > MAX_BODY_BYTES) {
          done = true;
          cleanup();
          const err = new Error('Request body exceeds 2 MiB limit');
          err.statusCode = 413;
          err.code = 'BODY_TOO_LARGE';
          reject(err);
          req.destroy();
          return;
        }
        chunks.push(chunk);
      };
      const onEnd = () => {
        if (!done) {
          done = true;
          cleanup();
          resolve(Buffer.concat(chunks));
        }
      };
      const onError = (err) => {
        if (!done) {
          done = true;
          cleanup();
          reject(err);
        }
      };
      const onClose = () => {
        if (!done) {
          done = true;
          cleanup();
          const err = new Error('Client closed connection during body read');
          err.statusCode = 499;
          err.code = 'CLIENT_CLOSED';
          reject(err);
        }
      };
      const onAborted = () => {
        if (!done) {
          done = true;
          cleanup();
          const err = new Error('Request aborted by client');
          err.statusCode = 499;
          err.code = 'CLIENT_CLOSED';
          reject(err);
        }
      };

      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onError);
      req.on('close', onClose);
      req.on('aborted', onAborted);
    });
  }

  const server = http.createServer(async (req, res) => {
    const formattedHost = formatHostForUrl(host);
    const reqUrl = new URL(req.url || '/', `http://${formattedHost}:${port}`);
    const path = reqUrl.pathname;
    const method = (req.method || 'GET').toUpperCase();

    if (method === 'GET' && path === '/jev/queue-metrics') {
      sendJson(res, 200, {
        gateway: 'jev-gateway',
        upstream: upstreamOrigin,
        cacheEntries: cache.size,
        cacheBytes: cache.bytes,
        inFlight: inFlight.size,
        ...scheduler.snapshotMetrics(),
      });
      return;
    }

    if (method === 'GET' && (path === '/health' || path === '/v1/health')) {
      try {
        const up = await getUpstreamHealth(reqUrl.pathname + reqUrl.search, req.headers);
        let bodyJson = null;
        try { bodyJson = JSON.parse(up.bodyBuf.toString('utf8')); } catch {}
        if (bodyJson && typeof bodyJson === 'object' && !Array.isArray(bodyJson)) {
          const payload = {
            ...bodyJson,
            gateway: {
              active: scheduler.active,
              queued: scheduler.totalQueued,
              concurrency: scheduler.concurrency,
            },
          };
          sendJson(res, up.status, payload);
          return;
        }
        res.writeHead(up.status, { 'Content-Type': up.contentType, 'Content-Length': String(up.bodyBuf.length) });
        res.end(up.bodyBuf);
      } catch (err) {
        sendJson(res, 503, { error: { code: 503, message: `Upstream unavailable: ${err.message}`, type: 'unavailable_error' } });
      }
      return;
    }

    // Read-only metadata endpoints proxy directly without touching the inference queue
    if (method === 'GET' && (path === '/v1/models' || path === '/models' || path === '/props' || path === '/slots')) {
      try {
        const up = await forwardToUpstream('GET', reqUrl.pathname + reqUrl.search, req.headers, null, 5000, null);
        res.writeHead(up.status, { 'Content-Type': up.contentType, 'Content-Length': String(up.bodyBuf.length) });
        res.end(up.bodyBuf);
      } catch (err) {
        sendJson(res, 502, { error: { code: 502, message: `Upstream error: ${err.message}`, type: 'bad_gateway' } });
      }
      return;
    }

    if (method !== 'POST') {
      sendJson(res, 405, { error: { code: 405, message: 'Method not allowed', type: 'method_not_allowed' } });
      return;
    }

    let bodyBuf;
    try {
      bodyBuf = await readBody(req);
    } catch (err) {
      if (!res.destroyed && !res.writableEnded) {
        sendJson(res, err.statusCode || 400, {
          error: {
            code: err.statusCode || 400,
            message: err.message,
            type: err.code || 'bad_request',
          },
        });
      }
      return;
    }

    let parsedBody = null;
    if (bodyBuf.length > 0) {
      try {
        parsedBody = JSON.parse(bodyBuf.toString('utf8'));
      } catch {
        sendJson(res, 400, { error: { code: 400, message: 'Malformed JSON body', type: 'bad_request' } });
        return;
      }
    }

    const coalesceKey = buildCoalesceKey(method, path, parsedBody);
    const bypassCache = String(req.headers['x-jev-no-cache'] || '').trim() === '1';

    if (coalesceKey && !bypassCache) {
      const cached = cache.get(coalesceKey);
      if (cached) {
        scheduler.metrics.cacheHits += 1;
        if (!res.destroyed && !res.writableEnded) {
          res.writeHead(cached.status, {
            'Content-Type': cached.contentType,
            'Content-Length': String(cached.bodyBuf.length),
            'X-Jev-Cache': 'HIT',
          });
          res.end(cached.bodyBuf);
        }
        return;
      }
    }

    const deadlineHeader = Number(req.headers['x-jev-deadline-ms']);
    const timeoutMs = Number.isFinite(deadlineHeader) && deadlineHeader > 0
      ? Math.min(180_000, deadlineHeader)
      : defaultTimeoutMs;
    const expiresAt = Date.now() + timeoutMs;

    const lane = inferPriorityLane(req.headers['x-jev-op'], parsedBody);
    const sessionId = String(req.headers['x-jev-session-id'] || req.headers['x-jev-agent'] || 'default').slice(0, 128);

    if (coalesceKey && !bypassCache && inFlight.has(coalesceKey)) {
      const flight = inFlight.get(coalesceKey);
      flight.refs += 1;
      scheduler.metrics.singleFlightHits += 1;
      if (lane < flight.lane) {
        flight.lane = lane;
        if (flight.job) {
          scheduler.promoteJob(flight.job, lane);
        }
      }
      let waiterDone = false;
      const onClose = () => {
        if (!waiterDone) {
          waiterDone = true;
          flight.refs = Math.max(0, flight.refs - 1);
          if (flight.refs === 0) {
            if (coalesceKey && inFlight.get(coalesceKey) === flight) {
              inFlight.delete(coalesceKey);
            }
            flight.abortController.abort();
          }
        }
      };
      if (res.destroyed || res.writableEnded) {
        onClose();
        return;
      }
      res.on('close', onClose);
      try {
        const result = await flight.promise;
        if (!waiterDone) {
          waiterDone = true;
          res.off('close', onClose);
          if (!res.destroyed && !res.writableEnded) {
            res.writeHead(result.status, {
              'Content-Type': result.contentType,
              'Content-Length': String(result.bodyBuf.length),
              'X-Jev-Cache': 'COALESCED',
              'X-Jev-Lane': `P${flight.lane}`,
            });
            res.end(result.bodyBuf);
          }
        }
      } catch (err) {
        if (!waiterDone) {
          waiterDone = true;
          res.off('close', onClose);
          const sc = err.statusCode || (err.name === 'TimeoutError' ? 504 : 502);
          const extra = sc === 503 ? { 'Retry-After': '1' } : {};
          sendJson(res, sc, { error: { code: sc, message: err.message, type: err.code || 'gateway_error' } }, extra);
        }
      }
      return;
    }

    const abortController = new AbortController();
    let flight = null;
    const releaseFlight = () => {
      if (coalesceKey && flight && inFlight.get(coalesceKey) === flight) {
        inFlight.delete(coalesceKey);
      }
    };

    let resolveJob;
    let rejectJob;
    const jobPromise = new Promise((res, rej) => {
      resolveJob = res;
      rejectJob = rej;
    });
    jobPromise.catch(() => {});

    let settled = false;
    const safeRejectJob = (err) => {
      if (!settled) {
        settled = true;
        rejectJob(err);
      }
    };
    const safeResolveJob = (val) => {
      if (!settled) {
        settled = true;
        resolveJob(val);
      }
    };

    const job = {
      lane,
      sessionId,
      costBytes: bodyBuf.length,
      expiresAt,
      isCancelled: () => (flight ? flight.refs <= 0 : (res.destroyed || res.writableEnded)),
      onCancelled: () => {
        releaseFlight();
        const err = new Error('Client closed request before dispatch');
        err.statusCode = 499;
        err.code = 'CLIENT_CLOSED';
        safeRejectJob(err);
      },
      onExpired: () => {
        releaseFlight();
        const err = new Error(`Request deadline (${timeoutMs}ms) expired in queue`);
        err.statusCode = 408;
        err.code = 'QUEUE_TIMEOUT';
        safeRejectJob(err);
      },
      run: async () => {
        try {
          const remaining = Math.max(500, expiresAt - Date.now());
          const result = await forwardToUpstream(
            method,
            reqUrl.pathname + reqUrl.search,
            req.headers,
            bodyBuf,
            remaining,
            abortController.signal,
          );
          if (result.status === 502) {
            const err = new Error('Upstream error: 502 Bad Gateway');
            err.statusCode = 502;
            err.code = 'bad_gateway';
            throw err;
          }
          if (coalesceKey && !bypassCache && result.status === 200) {
            cache.set(coalesceKey, result);
          }
          safeResolveJob(result);
          return result;
        } catch (err) {
          safeRejectJob(err);
          throw err;
        } finally {
          releaseFlight();
        }
      },
    };

    if (coalesceKey && !bypassCache) {
      flight = { refs: 1, lane, job, promise: jobPromise, abortController };
    }

    try {
      scheduler.enqueue(job);
      if (flight) {
        inFlight.set(coalesceKey, flight);
      }
    } catch (err) {
      releaseFlight();
      safeRejectJob(err);
    }

    let callerDone = false;
    const onCallerClose = () => {
      if (callerDone) return;
      callerDone = true;
      if (flight) {
        flight.refs = Math.max(0, flight.refs - 1);
        if (flight.refs === 0) {
          releaseFlight();
          abortController.abort();
        }
      } else {
        abortController.abort();
      }
    };
    if (res.destroyed || res.writableEnded) {
      onCallerClose();
    } else {
      res.on('close', onCallerClose);
    }

    try {
      const result = await jobPromise;
      if (!callerDone) {
        callerDone = true;
        res.off('close', onCallerClose);
        if (!res.destroyed && !res.writableEnded) {
          res.writeHead(result.status, {
            'Content-Type': result.contentType,
            'Content-Length': String(result.bodyBuf.length),
            'X-Jev-Cache': 'MISS',
            'X-Jev-Lane': `P${flight ? flight.lane : lane}`,
          });
          res.end(result.bodyBuf);
        }
      }
    } catch (err) {
      releaseFlight();
      if (!callerDone) {
        callerDone = true;
        res.off('close', onCallerClose);
        const sc = err.statusCode || (err.name === 'TimeoutError' ? 504 : 502);
        const extra = sc === 503 ? { 'Retry-After': '1' } : {};
        sendJson(res, sc, { error: { code: sc, message: err.message, type: err.code || 'gateway_error' } }, extra);
      }
    }
  });

  return {
    server,
    scheduler,
    cache,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve(server.address());
      });
    }),
    close: () => new Promise((resolve) => {
      agent.destroy();
      if (!server.listening) {
        resolve();
        return;
      }
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}

function toValidNumber(val, defaultVal) {
  const n = Number(val);
  return Number.isFinite(n) ? n : defaultVal;
}

export function parseCliArgs(argv) {
  const opts = {
    host: process.env.JEV_LOCAL_HOST || '127.0.0.1',
    port: toValidNumber(process.env.JEV_LOCAL_PORT, 8017),
    upstream: process.env.JEV_QEV_UPSTREAM || '',
    upstreamPort: toValidNumber(process.env.JEV_QEV_BACKEND_PORT, 0),
    concurrency: toValidNumber(process.env.JEV_QEV_SLOTS, 1),
    maxQueueDepth: toValidNumber(process.env.JEV_QEV_MAX_QUEUE, 64),
    agingMs: toValidNumber(process.env.JEV_QEV_AGING_MS, 2000),
    cacheMaxEntries: toValidNumber(process.env.JEV_QEV_CACHE_ENTRIES, 512),
    cacheTtlMs: toValidNumber(process.env.JEV_QEV_CACHE_TTL_MS, 300_000),
    cacheMaxBytes: toValidNumber(process.env.JEV_QEV_CACHE_BYTES, 32 * 1024 * 1024),
    p0ReservedSlots: process.env.JEV_QEV_P0_RESERVE !== undefined ? toValidNumber(process.env.JEV_QEV_P0_RESERVE, 0) : undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log('Usage: jev-gateway.mjs [--host 127.0.0.1] [--port 8017] [--upstream http://127.0.0.1:18017] [--concurrency 1] [--max-queue 64] [--aging-ms 2000] [--cache-entries 512] [--cache-ttl-ms 300000] [--cache-bytes 33554432] [--p0-reserve 0]');
      process.exit(0);
    } else if (a === '--host' && argv[i + 1]) opts.host = argv[++i];
    else if (a === '--port' && argv[i + 1]) opts.port = toValidNumber(argv[++i], opts.port);
    else if (a === '--upstream' && argv[i + 1]) opts.upstream = argv[++i];
    else if (a === '--upstream-port' && argv[i + 1]) opts.upstreamPort = toValidNumber(argv[++i], opts.upstreamPort);
    else if (a === '--concurrency' && argv[i + 1]) opts.concurrency = toValidNumber(argv[++i], opts.concurrency);
    else if (a === '--max-queue' && argv[i + 1]) opts.maxQueueDepth = toValidNumber(argv[++i], opts.maxQueueDepth);
    else if (a === '--aging-ms' && argv[i + 1]) opts.agingMs = toValidNumber(argv[++i], opts.agingMs);
    else if (a === '--cache-entries' && argv[i + 1]) opts.cacheMaxEntries = toValidNumber(argv[++i], opts.cacheMaxEntries);
    else if (a === '--cache-ttl-ms' && argv[i + 1]) opts.cacheTtlMs = toValidNumber(argv[++i], opts.cacheTtlMs);
    else if (a === '--cache-bytes' && argv[i + 1]) opts.cacheMaxBytes = toValidNumber(argv[++i], opts.cacheMaxBytes);
    else if (a === '--p0-reserve' && argv[i + 1]) opts.p0ReservedSlots = toValidNumber(argv[++i], 0);
  }
  if (!opts.upstream) {
    const upPort = opts.upstreamPort > 0
      ? opts.upstreamPort
      : (opts.port + 10000 <= 65535 ? opts.port + 10000 : opts.port + 1);
    const safeHost = formatHostForUrl(opts.host);
    opts.upstream = `http://${safeHost}:${upPort}`;
  }
  return opts;
}

const isEntrypoint = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
})();

if (isEntrypoint) {
  const opts = parseCliArgs(process.argv.slice(2));
  const gw = createJevGateway(opts);
  const addr = await gw.listen();
  const safeListenHost = formatHostForUrl(addr.address);
  console.log(`[jev-gateway] listening on http://${safeListenHost}:${addr.port} -> ${opts.upstream} (concurrency=${opts.concurrency}, maxQueue=${opts.maxQueueDepth})`);
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    gw.server.close();
    const deadline = Date.now() + 3000;
    while (gw.scheduler.active > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    gw.server.closeAllConnections?.();
    await gw.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
