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

export function isLoopbackHost(host) {
  const h = String(host || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  return h === '127.0.0.1' || h === 'localhost' || h === '::1';
}

export function stableCanonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableCanonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
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
  if (path === '/v1/systemone') {
    const core = {
      model: parsedBody.model ?? null,
      state: parsedBody.state ?? null,
      questions: parsedBody.questions ?? null,
      files: parsedBody.files ?? parsedBody.images ?? null,
    };
    return createHash('sha256').update(`systemone:${stableCanonicalJson(core)}`).digest('hex');
  }
  if (path === '/v1/completions' && Number(parsedBody.max_tokens) === 1 && parsedBody.prompt !== undefined) {
    const core = {
      model: parsedBody.model ?? null,
      prompt: parsedBody.prompt,
      allowed_token_ids: parsedBody.allowed_token_ids ?? null,
      logprobs: parsedBody.logprobs ?? null,
    };
    return createHash('sha256').update(`completions:${stableCanonicalJson(core)}`).digest('hex');
  }
  return null;
}

class BoundedLruCache {
  constructor(maxEntries = 512, ttlMs = 300_000) {
    this.maxEntries = Math.max(0, Number(maxEntries) || 0);
    this.ttlMs = Math.max(0, Number(ttlMs) || 0);
    this.map = new Map();
  }

  get(key, now = Date.now()) {
    if (this.maxEntries <= 0 || this.ttlMs <= 0 || !key) return null;
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= now) {
      this.map.delete(key);
      return null;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit;
  }

  set(key, entry, now = Date.now()) {
    if (this.maxEntries <= 0 || this.ttlMs <= 0 || !key) return;
    if (this.map.has(key)) this.map.delete(key);
    while (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
    this.map.set(key, { ...entry, expiresAt: now + this.ttlMs });
  }

  get size() {
    return this.map.size;
  }
}

export class FairPriorityScheduler {
  constructor({
    concurrency = 1,
    maxQueueDepth = 64,
    softShedRatio = 0.75,
    agingMs = 2000,
    quantumBytes = 4096,
    nowFn = () => Date.now(),
    executor,
  } = {}) {
    this.concurrency = Math.max(1, Number(concurrency) || 1);
    this.maxQueueDepth = Math.max(4, Number(maxQueueDepth) || 64);
    this.softShedDepth = Math.max(2, Math.floor(this.maxQueueDepth * softShedRatio));
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
      maxQueueDepth: this.maxQueueDepth,
      softShedDepth: this.softShedDepth,
      avgWaitMs: this.metrics.dispatched ? Math.round((this.metrics.totalWaitMs / this.metrics.dispatched) * 100) / 100 : 0,
      avgUpstreamMs: completedOrErr ? Math.round((this.metrics.totalUpstreamMs / completedOrErr) * 100) / 100 : 0,
    };
  }

  enqueue(job) {
    const now = this.nowFn();
    const lane = Math.max(0, Math.min(2, Number(job.lane ?? 1)));

    // Backpressure: protect P0/P1 by shedding P2 past softShedDepth, hard-cap all at maxQueueDepth
    if (lane === 2 && this.totalQueued >= this.softShedDepth) {
      this.metrics.shedP2 += 1;
      const err = new Error('Queue backpressure: P2 background request shed');
      err.statusCode = 503;
      err.code = 'QUEUE_BACKPRESSURE';
      throw err;
    }
    if (this.totalQueued >= this.maxQueueDepth) {
      this.metrics.shedFull += 1;
      const err = new Error('Queue full');
      err.statusCode = 503;
      err.code = 'QUEUE_FULL';
      throw err;
    }

    job.lane = lane;
    job.enqueuedAt = now;
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
        while (sess.queue.length > 0 && (now - sess.queue[0].enqueuedAt) >= this.agingMs) {
          const promoted = sess.queue.shift();
          const targetLane = l - 1;
          promoted.lane = targetLane;
          promoted.enqueuedAt = now; // reset timer in promoted lane
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
      const laneState = this.lanes[l];
      let guard = laneState.order.length * 4 + 4;
      while (laneState.order.length > 0 && guard-- > 0) {
        const sessionId = laneState.order[0];
        const sess = laneState.sessions.get(sessionId);
        if (!sess || sess.queue.length === 0) {
          laneState.sessions.delete(sessionId);
          laneState.order.shift();
          continue;
        }
        // Grant quantum at visit start if deficit is below head cost
        if (sess.deficit < sess.queue[0].costBytes) {
          sess.deficit += this.quantumBytes;
        }
        const head = sess.queue[0];
        if (head.isCancelled && head.isCancelled()) {
          sess.queue.shift();
          this.totalQueued -= 1;
          this.metrics.abortedBeforeDispatch += 1;
          if (sess.queue.length === 0) {
            laneState.sessions.delete(sessionId);
            laneState.order.shift();
          }
          continue;
        }
        if (head.expiresAt && head.expiresAt <= now) {
          sess.queue.shift();
          this.totalQueued -= 1;
          this.metrics.expiredInQueue += 1;
          head.onExpired?.();
          if (sess.queue.length === 0) {
            laneState.sessions.delete(sessionId);
            laneState.order.shift();
          }
          continue;
        }
        if (sess.deficit >= head.costBytes) {
          sess.deficit -= head.costBytes;
          sess.queue.shift();
          this.totalQueued -= 1;
          // Rotate session to tail after serving one job so other sessions get fair turns
          laneState.order.shift();
          if (sess.queue.length > 0) {
            laneState.order.push(sessionId);
          } else {
            laneState.sessions.delete(sessionId);
          }
          return head;
        }
        // Not enough deficit yet; rotate to next session
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
  const cache = new BoundedLruCache(cacheMaxEntries, cacheTtlMs);
  const inFlight = new Map(); // key -> { refs, promise, waiters[] }

  const scheduler = new FairPriorityScheduler({
    concurrency,
    maxQueueDepth,
    agingMs,
    executor: async (job) => job.run(),
  });

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
    const forwardHeaders = {};
    for (const [k, v] of Object.entries(headers || {})) {
      const low = k.toLowerCase();
      if (low === 'host' || low === 'content-length' || low === 'connection') continue;
      if (typeof v === 'string') forwardHeaders[k] = v;
    }
    if (bodyBuf && !forwardHeaders['content-type']) {
      forwardHeaders['content-type'] = 'application/json';
    }
    const deadlineSignal = AbortSignal.timeout(Math.max(1000, timeoutMs || defaultTimeoutMs));
    const combinedSignal = signal ? AbortSignal.any([deadlineSignal, signal]) : deadlineSignal;
    const resp = await fetch(`${upstreamOrigin}${pathWithQuery}`, {
      method,
      headers: forwardHeaders,
      body: method === 'GET' || method === 'HEAD' ? undefined : bodyBuf,
      signal: combinedSignal,
    });
    const respBuf = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get('content-type') || 'application/json';
    return { status: resp.status, contentType, bodyBuf: respBuf };
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let total = 0;
      let done = false;
      req.on('data', (chunk) => {
        if (done) return;
        total += chunk.length;
        if (total > MAX_BODY_BYTES) {
          done = true;
          const err = new Error('Request body exceeds 2 MiB limit');
          err.statusCode = 413;
          reject(err);
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (!done) { done = true; resolve(Buffer.concat(chunks)); }
      });
      req.on('error', (err) => {
        if (!done) { done = true; reject(err); }
      });
    });
  }

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', `http://${host}:${port}`);
    const path = reqUrl.pathname;
    const method = (req.method || 'GET').toUpperCase();

    if (method === 'GET' && path === '/jev/queue-metrics') {
      sendJson(res, 200, {
        gateway: 'jev-gateway',
        upstream: upstreamOrigin,
        cacheEntries: cache.size,
        inFlight: inFlight.size,
        ...scheduler.snapshotMetrics(),
      });
      return;
    }

    if (method === 'GET' && (path === '/health' || path === '/v1/health')) {
      try {
        const up = await forwardToUpstream('GET', reqUrl.pathname + reqUrl.search, req.headers, null, 3000, null);
        let bodyJson = null;
        try { bodyJson = JSON.parse(up.bodyBuf.toString('utf8')); } catch {}
        if (bodyJson && typeof bodyJson === 'object' && !Array.isArray(bodyJson)) {
          bodyJson.gateway = {
            active: scheduler.active,
            queued: scheduler.totalQueued,
            concurrency: scheduler.concurrency,
          };
          sendJson(res, up.status, bodyJson);
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
      sendJson(res, 405, { error: { code: 405, message: 'Method not allowed' } });
      return;
    }

    let bodyBuf;
    try {
      bodyBuf = await readBody(req);
    } catch (err) {
      sendJson(res, err.statusCode || 400, { error: { code: err.statusCode || 400, message: err.message } });
      return;
    }

    let parsedBody = null;
    if (bodyBuf.length > 0) {
      try {
        parsedBody = JSON.parse(bodyBuf.toString('utf8'));
      } catch {
        sendJson(res, 400, { error: { code: 400, message: 'Malformed JSON body' } });
        return;
      }
    }

    const coalesceKey = buildCoalesceKey(method, path, parsedBody);
    const bypassCache = String(req.headers['x-jev-no-cache'] || '').trim() === '1';

    if (coalesceKey && !bypassCache) {
      const cached = cache.get(coalesceKey);
      if (cached) {
        scheduler.metrics.cacheHits += 1;
        res.writeHead(cached.status, {
          'Content-Type': cached.contentType,
          'Content-Length': String(cached.bodyBuf.length),
          'X-Jev-Cache': 'HIT',
        });
        res.end(cached.bodyBuf);
        return;
      }
    }

    const deadlineHeader = Number(req.headers['x-jev-deadline-ms']);
    const timeoutMs = Number.isFinite(deadlineHeader) && deadlineHeader > 0
      ? Math.min(180_000, deadlineHeader)
      : defaultTimeoutMs;
    const expiresAt = Date.now() + timeoutMs;

    if (coalesceKey && !bypassCache && inFlight.has(coalesceKey)) {
      const flight = inFlight.get(coalesceKey);
      flight.refs += 1;
      scheduler.metrics.singleFlightHits += 1;
      let waiterDone = false;
      const onClose = () => {
        if (!waiterDone) {
          waiterDone = true;
          flight.refs = Math.max(0, flight.refs - 1);
          if (flight.refs === 0) flight.abortController.abort();
        }
      };
      res.on('close', onClose);
      try {
        const result = await flight.promise;
        if (!waiterDone) {
          waiterDone = true;
          res.off('close', onClose);
          res.writeHead(result.status, {
            'Content-Type': result.contentType,
            'Content-Length': String(result.bodyBuf.length),
            'X-Jev-Cache': 'COALESCED',
          });
          res.end(result.bodyBuf);
        }
      } catch (err) {
        if (!waiterDone) {
          waiterDone = true;
          res.off('close', onClose);
          const sc = err.statusCode || (err.name === 'TimeoutError' ? 504 : 502);
          sendJson(res, sc, { error: { code: sc, message: err.message } });
        }
      }
      return;
    }

    const lane = inferPriorityLane(req.headers['x-jev-op'], parsedBody);
    const sessionId = String(req.headers['x-jev-session-id'] || req.headers['x-jev-agent'] || 'default').slice(0, 128);
    const abortController = new AbortController();

    let flight = null;
    const releaseFlight = () => {
      if (coalesceKey && flight && inFlight.get(coalesceKey) === flight) {
        inFlight.delete(coalesceKey);
      }
    };

    const jobPromise = new Promise((resolveJob, rejectJob) => {
      const job = {
        lane,
        sessionId,
        costBytes: bodyBuf.length,
        expiresAt,
        isCancelled: () => (flight ? flight.refs <= 0 : (res.destroyed || res.writableEnded)),
        onExpired: () => {
          const err = new Error(`Request deadline (${timeoutMs}ms) expired in queue`);
          err.statusCode = 408;
          rejectJob(err);
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
            if (coalesceKey && !bypassCache && result.status === 200) {
              cache.set(coalesceKey, result);
            }
            resolveJob(result);
          } catch (err) {
            rejectJob(err);
          } finally {
            releaseFlight();
          }
        },
      };

      if (coalesceKey && !bypassCache) {
        flight = { refs: 1, promise: null, abortController };
      }

      try {
        scheduler.enqueue(job);
      } catch (err) {
        releaseFlight();
        rejectJob(err);
      }
    });

    if (flight) {
      flight.promise = jobPromise;
      inFlight.set(coalesceKey, flight);
    }

    let callerDone = false;
    const onCallerClose = () => {
      if (callerDone) return;
      callerDone = true;
      if (flight) {
        flight.refs = Math.max(0, flight.refs - 1);
        if (flight.refs === 0) abortController.abort();
      } else {
        abortController.abort();
      }
    };
    res.on('close', onCallerClose);

    try {
      const result = await jobPromise;
      if (!callerDone) {
        callerDone = true;
        res.off('close', onCallerClose);
        res.writeHead(result.status, {
          'Content-Type': result.contentType,
          'Content-Length': String(result.bodyBuf.length),
          'X-Jev-Cache': 'MISS',
          'X-Jev-Lane': `P${lane}`,
        });
        res.end(result.bodyBuf);
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
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function parseCliArgs(argv) {
  const opts = {
    host: process.env.JEV_LOCAL_HOST || '127.0.0.1',
    port: Number(process.env.JEV_LOCAL_PORT || 8017),
    upstream: process.env.JEV_QEV_UPSTREAM || '',
    upstreamPort: Number(process.env.JEV_QEV_BACKEND_PORT || 0),
    concurrency: Number(process.env.JEV_QEV_SLOTS || 1),
    maxQueueDepth: Number(process.env.JEV_QEV_MAX_QUEUE || 64),
    agingMs: Number(process.env.JEV_QEV_AGING_MS || 2000),
    cacheMaxEntries: Number(process.env.JEV_QEV_CACHE_ENTRIES || 512),
    cacheTtlMs: Number(process.env.JEV_QEV_CACHE_TTL_MS || 300_000),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log('Usage: jev-gateway.mjs [--host 127.0.0.1] [--port 8017] [--upstream http://127.0.0.1:18017] [--concurrency 1] [--max-queue 64] [--aging-ms 2000] [--cache-entries 512] [--cache-ttl-ms 300000]');
      process.exit(0);
    } else if (a === '--host' && argv[i + 1]) opts.host = argv[++i];
    else if (a === '--port' && argv[i + 1]) opts.port = Number(argv[++i]);
    else if (a === '--upstream' && argv[i + 1]) opts.upstream = argv[++i];
    else if (a === '--upstream-port' && argv[i + 1]) opts.upstreamPort = Number(argv[++i]);
    else if (a === '--concurrency' && argv[i + 1]) opts.concurrency = Number(argv[++i]);
    else if (a === '--max-queue' && argv[i + 1]) opts.maxQueueDepth = Number(argv[++i]);
    else if (a === '--aging-ms' && argv[i + 1]) opts.agingMs = Number(argv[++i]);
    else if (a === '--cache-entries' && argv[i + 1]) opts.cacheMaxEntries = Number(argv[++i]);
    else if (a === '--cache-ttl-ms' && argv[i + 1]) opts.cacheTtlMs = Number(argv[++i]);
  }
  if (!opts.upstream) {
    const upPort = opts.upstreamPort > 0
      ? opts.upstreamPort
      : (opts.port + 10000 <= 65535 ? opts.port + 10000 : opts.port + 1);
    opts.upstream = `http://${opts.host}:${upPort}`;
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
  console.log(`[jev-gateway] listening on http://${addr.address}:${addr.port} -> ${opts.upstream} (concurrency=${opts.concurrency}, maxQueue=${opts.maxQueueDepth})`);
  const shutdown = () => {
    gw.server.closeAllConnections?.();
    gw.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
