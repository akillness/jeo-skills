import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  createJevGateway,
  FairPriorityScheduler,
  inferPriorityLane,
  buildCoalesceKey,
  BoundedLruCache,
  formatHostForUrl,
  isLoopbackHost,
  stableCanonicalJson,
  parseCliArgs,
} from './jev-gateway.mjs';

test('inferPriorityLane classifies P0 interactive, P1 turn-start, and P2 background ops', () => {
  assert.equal(inferPriorityLane('review', null), 0);
  assert.equal(inferPriorityLane('gate-tool', null), 0);
  assert.equal(inferPriorityLane('decide-action', null), 0);
  assert.equal(inferPriorityLane('moderate', null), 0);
  assert.equal(inferPriorityLane('route-skills', null), 1);
  assert.equal(inferPriorityLane('prune-context', null), 2);
  assert.equal(inferPriorityLane('evaluate-run', null), 2);
  assert.equal(inferPriorityLane('', { questions: { permit: { type: 'noul' } } }), 0);
  assert.equal(inferPriorityLane('', { questions: { drop_ids: { type: 'noul' } } }), 2);
});

test('buildCoalesceKey canonicalizes question key order', () => {
  const k1 = buildCoalesceKey('POST', '/v1/systemone', { model: 'qev', state: 's', questions: { b: { type: 'noul' }, a: { type: 'noul' } } });
  const k2 = buildCoalesceKey('POST', '/v1/systemone', { model: 'qev', state: 's', questions: { a: { type: 'noul' }, b: { type: 'noul' } } });
  assert.ok(k1);
  assert.equal(k1, k2);
});

test('FairPriorityScheduler enforces P0 > P1 > P2 ordering and per-session DRR fairness', async () => {
  const order = [];
  let releaseGate;
  const gate = new Promise((r) => { releaseGate = r; });

  const scheduler = new FairPriorityScheduler({
    concurrency: 1,
    agingMs: 60_000,
    quantumBytes: 4096,
    executor: async (job) => {
      if (job.id === 'blocker') await gate;
      order.push(job.id);
    },
  });

  // Occupy single worker slot
  scheduler.enqueue({ id: 'blocker', lane: 1, sessionId: 's0', costBytes: 512 });
  // Queue noisy session sA in P1 (2 items) + P2 item + session sB in P1 + P0 critical item
  scheduler.enqueue({ id: 'p2-sA', lane: 2, sessionId: 'sA', costBytes: 512 });
  scheduler.enqueue({ id: 'p1-sA-1', lane: 1, sessionId: 'sA', costBytes: 512 });
  scheduler.enqueue({ id: 'p1-sA-2', lane: 1, sessionId: 'sA', costBytes: 512 });
  scheduler.enqueue({ id: 'p1-sB-1', lane: 1, sessionId: 'sB', costBytes: 512 });
  scheduler.enqueue({ id: 'p0-sC', lane: 0, sessionId: 'sC', costBytes: 512 });

  releaseGate();
  await new Promise((r) => setTimeout(r, 40));

  assert.deepEqual(order, ['blocker', 'p0-sC', 'p1-sA-1', 'p1-sB-1', 'p1-sA-2', 'p2-sA']);
});

test('FairPriorityScheduler ages long-waiting P2 jobs and sheds P2 under backpressure', async () => {
  let fakeNow = 1000;
  const order = [];
  let releaseFirst;
  const firstDone = new Promise((r) => { releaseFirst = r; });

  const scheduler = new FairPriorityScheduler({
    concurrency: 1,
    maxQueueDepth: 8,
    softShedRatio: 0.5, // soft limit = 4
    agingMs: 500,
    nowFn: () => fakeNow,
    executor: async (job) => {
      if (job.id === 'first') await firstDone;
      order.push(job.id);
    },
  });

  scheduler.enqueue({ id: 'first', lane: 1, sessionId: 's0', costBytes: 512 });
  scheduler.enqueue({ id: 'old-p2', lane: 2, sessionId: 's1', costBytes: 512 });
  fakeNow = 1600; // old-p2 is now >= 500ms old -> promotes to P1 ahead of new P2
  scheduler.enqueue({ id: 'new-p2-a', lane: 2, sessionId: 's2', costBytes: 512 });
  scheduler.enqueue({ id: 'new-p2-b', lane: 2, sessionId: 's3', costBytes: 512 });
  scheduler.enqueue({ id: 'new-p2-c', lane: 2, sessionId: 's4', costBytes: 512 });
  assert.equal(scheduler.totalQueued, 4);

  // At soft limit (4), new P2 must shed with 503 while P0 still succeeds
  assert.throws(
    () => scheduler.enqueue({ id: 'shed-me', lane: 2, sessionId: 's5', costBytes: 512 }),
    (err) => err.statusCode === 503 && err.code === 'QUEUE_BACKPRESSURE',
  );
  scheduler.enqueue({ id: 'p0-ok', lane: 0, sessionId: 's6', costBytes: 512 });

  releaseFirst();
  await new Promise((r) => setTimeout(r, 40));

  assert.equal(order[0], 'first');
  assert.equal(order[1], 'p0-ok');
  assert.equal(order[2], 'old-p2');
});

test('HTTP gateway handles single-flight coalescing, LRU cache hits, deadline expiry, and queue metrics', async () => {
  let upstreamCalls = 0;
  let releaseUpstream = null;
  const upstreamServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'qev-0.8b-text-Q8_0' }] }));
        return;
      }
      upstreamCalls += 1;
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (body.state === 'hold') {
        await new Promise((r) => { releaseUpstream = r; });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ model: 'qev-0.8b-text-Q8_0', answers: { q: { type: 'noul', noul: 0.91 } }, call: upstreamCalls }));
    });
  });

  await new Promise((r) => upstreamServer.listen(0, '127.0.0.1', r));
  const upPort = upstreamServer.address().port;

  const gw = createJevGateway({
    host: '127.0.0.1',
    port: 0,
    upstream: `http://127.0.0.1:${upPort}`,
    concurrency: 1,
    maxQueueDepth: 16,
  });
  const gwAddr = await gw.listen();
  const baseUrl = `http://127.0.0.1:${gwAddr.port}`;

  try {
    // 1. Hold upstream with one request so identical concurrent requests coalesce
    const holdReq = fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'prune-context', 'X-Jev-Session-Id': 's1' },
      body: JSON.stringify({ model: 'qev', state: 'hold', questions: { q: { type: 'noul', instructions: 'ok?' } } }),
    });
    await new Promise((r) => setTimeout(r, 30));

    // Enqueue expired request while upstream is busy -> should expire in queue without hitting upstream
    const expiredReq = fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'route-skills', 'X-Jev-Deadline-Ms': '15' },
      body: JSON.stringify({ model: 'qev', state: 'expired-state', questions: { q: { type: 'noul', instructions: 'ok?' } } }),
    });

    // Fire 3 identical concurrent requests across different sessions -> must coalesce into 1 upstream call
    const sameBody = JSON.stringify({ model: 'qev', state: 'shared', questions: { q: { type: 'noul', instructions: 'same?' } } });
    const coalescedReqs = [
      fetch(`${baseUrl}/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review', 'X-Jev-Session-Id': 'sA' }, body: sameBody }),
      fetch(`${baseUrl}/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review', 'X-Jev-Session-Id': 'sB' }, body: sameBody }),
      fetch(`${baseUrl}/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review', 'X-Jev-Session-Id': 'sC' }, body: sameBody }),
    ];

    await new Promise((r) => setTimeout(r, 40));
    releaseUpstream();

    const [holdRes, expiredRes, ...cResults] = await Promise.all([holdReq, expiredReq, ...coalescedReqs]);
    assert.equal(holdRes.status, 200);
    assert.equal(expiredRes.status, 408);
    for (const r of cResults) assert.equal(r.status, 200);
    assert.equal(upstreamCalls, 2); // 1 for hold + 1 for the 3 coalesced requests (0 for expired!)

    // 2. Subsequent identical call hits in-memory LRU cache (0 upstream calls)
    const cachedRes = await fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review' },
      body: sameBody,
    });
    assert.equal(cachedRes.status, 200);
    assert.equal(cachedRes.headers.get('x-jev-cache'), 'HIT');
    assert.equal(upstreamCalls, 2);

    // 3. Health and queue metrics report live telemetry
    const health = await (await fetch(`${baseUrl}/health`)).json();
    assert.equal(health.status, 'ok');
    assert.equal(health.gateway.concurrency, 1);

    const metrics = await (await fetch(`${baseUrl}/jev/queue-metrics`)).json();
    assert.equal(metrics.singleFlightHits, 2);
    assert.equal(metrics.cacheHits, 1);
    assert.equal(metrics.expiredInQueue, 1);
  } finally {
    await gw.close();
    await new Promise((r) => upstreamServer.close(r));
  }
});

test('FairPriorityScheduler dispatches costBytes=36000 DRR for single & multi-session without stalling', async () => {
  // Single session with costBytes=36000 and small quantumBytes=512 (would livelock with naive guard)
  const dispatched = [];
  const scheduler = new FairPriorityScheduler({
    concurrency: 1,
    quantumBytes: 512,
    executor: async (job) => {
      dispatched.push(job.id);
    },
  });

  scheduler.enqueue({ id: 'big-job', lane: 1, sessionId: 's1', costBytes: 36000 });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(dispatched, ['big-job']);

  // Multi-session: session sA with 36000 bytes, session sB with 512 bytes x 2
  const multiOrder = [];
  let releaseGate;
  const gate = new Promise((r) => { releaseGate = r; });

  const multiScheduler = new FairPriorityScheduler({
    concurrency: 1,
    quantumBytes: 512,
    executor: async (job) => {
      if (job.id === 'blocker') await gate;
      multiOrder.push(job.id);
    },
  });

  multiScheduler.enqueue({ id: 'blocker', lane: 1, sessionId: 's0', costBytes: 512 });
  multiScheduler.enqueue({ id: 'big-sA', lane: 1, sessionId: 'sA', costBytes: 36000 });
  multiScheduler.enqueue({ id: 'small-sB-1', lane: 1, sessionId: 'sB', costBytes: 512 });
  multiScheduler.enqueue({ id: 'small-sB-2', lane: 1, sessionId: 'sB', costBytes: 512 });

  releaseGate();
  await new Promise((r) => setTimeout(r, 40));

  // sB small jobs dispatch fairly before the big sA job completes its fast-forward rounds
  assert.equal(multiOrder[0], 'blocker');
  assert.equal(multiOrder[1], 'small-sB-1');
  assert.equal(multiOrder[2], 'small-sB-2');
  assert.equal(multiOrder[3], 'big-sA');

  // Lane NaN validation: lane defaults to 1 when NaN or non-numeric is passed
  multiScheduler.enqueue({ id: 'nan-lane', lane: NaN, sessionId: 'sA', costBytes: 512 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(multiOrder[4], 'nan-lane');
});

test('abortedBeforeDispatch cleans inFlight and subsequent identical request succeeds', async () => {
  let releaseFirst;
  const firstBlock = new Promise((r) => { releaseFirst = r; });
  let upstreamHits = 0;

  const upstreamServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      upstreamHits += 1;
      const b = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (b.state?.action === 'block') {
        await firstBlock;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, hits: upstreamHits }));
    });
  });

  await new Promise((r) => upstreamServer.listen(0, '127.0.0.1', r));
  const upPort = upstreamServer.address().port;

  const gw = createJevGateway({
    host: '127.0.0.1',
    port: 0,
    upstream: `http://127.0.0.1:${upPort}`,
    concurrency: 1,
    maxQueueDepth: 16,
  });
  const gwAddr = await gw.listen();
  const baseUrl = `http://127.0.0.1:${gwAddr.port}`;

  try {
    // 1. Occupy the single worker slot with a blocking request
    const blockReq = fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review' },
      body: JSON.stringify({ model: 'qev', state: { action: 'block' }, questions: { q: { type: 'noul' } } }),
    });
    await new Promise((r) => setTimeout(r, 25));

    // 2. Enqueue a coalescible request with an AbortController and abort before dispatch
    const abortCtrl = new AbortController();
    const abortBody = JSON.stringify({ model: 'qev', state: { action: 'to-abort' }, questions: { q: { type: 'noul' } } });
    const abortReq = fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review' },
      body: abortBody,
      signal: abortCtrl.signal,
    }).catch((err) => ({ aborted: true, err }));

    await new Promise((r) => setTimeout(r, 25));
    // Abort request while queued
    abortCtrl.abort();
    await abortReq;
    await new Promise((r) => setTimeout(r, 25));

    // Release the blocker so scheduler pumps
    releaseFirst();
    await blockReq;
    await new Promise((r) => setTimeout(r, 30));

    const metrics1 = await (await fetch(`${baseUrl}/jev/queue-metrics`)).json();
    assert.equal(metrics1.abortedBeforeDispatch, 1);
    assert.equal(metrics1.inFlight, 0);

    // 3. Fire identical request now — must NOT coalesce to dead flight; must hit upstream and succeed!
    const freshRes = await fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review' },
      body: abortBody,
    });
    assert.equal(freshRes.status, 200);
    const freshData = await freshRes.json();
    assert.equal(freshData.ok, true);

    const metrics2 = await (await fetch(`${baseUrl}/jev/queue-metrics`)).json();
    assert.equal(metrics2.inFlight, 0);
  } finally {
    await gw.close();
    await new Promise((r) => upstreamServer.close(r));
  }
});

test('waiter disconnect when refs drops to 0 releases inFlight immediately and does not poison subsequent waiter', async () => {
  let releaseHold;
  const holdPromise = new Promise((r) => { releaseHold = r; });
  let upstreamHits = 0;

  const upstreamServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      upstreamHits += 1;
      const b = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (b.action === 'hold') {
        try {
          await holdPromise;
        } catch {
          // aborted upstream
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, hit: upstreamHits }));
    });
  });

  await new Promise((r) => upstreamServer.listen(0, '127.0.0.1', r));
  const upPort = upstreamServer.address().port;

  const gw = createJevGateway({
    host: '127.0.0.1',
    port: 0,
    upstream: `http://127.0.0.1:${upPort}`,
    concurrency: 1,
  });
  const gwAddr = await gw.listen();
  const baseUrl = `http://127.0.0.1:${gwAddr.port}`;

  try {
    const body = JSON.stringify({ model: 'qev', action: 'hold', questions: { q: { type: 'noul' } } });
    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();

    // Primary request
    const p1 = fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review' },
      body,
      signal: ctrl1.signal,
    }).catch(() => {});

    await new Promise((r) => setTimeout(r, 25));

    // Waiter coalesces onto primary
    const p2 = fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review' },
      body,
      signal: ctrl2.signal,
    }).catch(() => {});

    await new Promise((r) => setTimeout(r, 25));

    // Abort primary first (refs becomes 1)
    ctrl1.abort();
    await p1;
    await new Promise((r) => setTimeout(r, 15));

    // Abort waiter (refs drops to 0 -> inFlight released immediately before upstream abort)
    ctrl2.abort();
    await p2;
    await new Promise((r) => setTimeout(r, 25));

    const metricsAfterAbort = await (await fetch(`${baseUrl}/jev/queue-metrics`)).json();
    assert.equal(metricsAfterAbort.inFlight, 0);

    // Release upstream hold
    releaseHold();
    await new Promise((r) => setTimeout(r, 25));

    // A brand new waiter/request arrives with identical key -> must NOT join an aborted controller!
    const freshRes = await fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review' },
      body: JSON.stringify({ model: 'qev', action: 'normal', questions: { q: { type: 'noul' } } }),
    });
    assert.equal(freshRes.status, 200);
  } finally {
    await gw.close();
    await new Promise((r) => upstreamServer.close(r));
  }
});

test('503 enqueue leaves inFlight=0 and protects P0 queue reserve', async () => {
  let releaseWorker;
  const workerBlock = new Promise((r) => { releaseWorker = r; });

  const upstreamServer = http.createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', async () => {
      await workerBlock;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((r) => upstreamServer.listen(0, '127.0.0.1', r));
  const upPort = upstreamServer.address().port;

  // MaxQueueDepth = 4 -> p0QueueReserve = min(4, floor(4/4)) = 1
  // P1 will shed when totalQueued >= (4 - 1) = 3!
  // P0 can enqueue up to totalQueued = 4!
  const gw = createJevGateway({
    host: '127.0.0.1',
    port: 0,
    upstream: `http://127.0.0.1:${upPort}`,
    concurrency: 1,
    maxQueueDepth: 4,
  });
  const gwAddr = await gw.listen();
  const baseUrl = `http://127.0.0.1:${gwAddr.port}`;

  try {
    // 1. Occupy active slot
    const activeReq = fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review', 'X-Jev-No-Cache': '1' },
      body: JSON.stringify({ model: 'qev', state: { id: 'active' }, questions: { q: { type: 'noul' } } }),
    });
    await new Promise((r) => setTimeout(r, 25));

    // 2. Fill P1 queue to 3 (maxQueueDepth - p0QueueReserve)
    const q1 = fetch(`${baseUrl}/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'route-skills', 'X-Jev-No-Cache': '1' }, body: JSON.stringify({ model: 'qev', state: { id: 'q1' }, questions: { q: { type: 'noul' } } }) });
    const q2 = fetch(`${baseUrl}/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'route-skills', 'X-Jev-No-Cache': '1' }, body: JSON.stringify({ model: 'qev', state: { id: 'q2' }, questions: { q: { type: 'noul' } } }) });
    const q3 = fetch(`${baseUrl}/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'route-skills', 'X-Jev-No-Cache': '1' }, body: JSON.stringify({ model: 'qev', state: { id: 'q3' }, questions: { q: { type: 'noul' } } }) });
    await new Promise((r) => setTimeout(r, 25));

    // 3. Attempt to enqueue a 4th P1 coalescible request -> should shed with 503 to protect P0 reserve!
    const shedP1Res = await fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'route-skills' },
      body: JSON.stringify({ model: 'qev', state: { id: 'shed-p1' }, questions: { q: { type: 'noul' } } }),
    });
    assert.equal(shedP1Res.status, 503);
    assert.equal(shedP1Res.headers.get('retry-after'), '1');
    const shedP1Json = await shedP1Res.json();
    assert.equal(shedP1Json.error.type, 'QUEUE_FULL');

    // Verify inFlight size remains 0 (the failed coalescible flight was NOT registered!)
    const metricsMid = await (await fetch(`${baseUrl}/jev/queue-metrics`)).json();
    assert.equal(metricsMid.inFlight, 0);

    // 4. P0 request CAN still enqueue into the reserved slot (depth 4)
    const p0Res = fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review' },
      body: JSON.stringify({ model: 'qev', state: { id: 'p0-reserved' }, questions: { q: { type: 'noul' } } }),
    });
    await new Promise((r) => setTimeout(r, 20));

    // Release worker and drain queue
    releaseWorker();
    const [aRes, r1, r2, r3, rP0] = await Promise.all([activeReq, q1, q2, q3, p0Res]);
    assert.equal(aRes.status, 200);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 200);
    assert.equal(rP0.status, 200);
  } finally {
    await gw.close();
    await new Promise((r) => upstreamServer.close(r));
  }
});

test('P0 waiter promotes queued P2 flight and waiter responses include X-Jev-Lane: P0', async () => {
  let releaseWorker;
  const workerGate = new Promise((r) => { releaseWorker = r; });
  const dispatchOrder = [];

  const upstreamServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const b = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      const reqId = b.state?.id || 'shared';
      dispatchOrder.push(reqId);
      if (reqId === 'worker') {
        await workerGate;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: reqId }));
    });
  });

  await new Promise((r) => upstreamServer.listen(0, '127.0.0.1', r));
  const upPort = upstreamServer.address().port;

  const gw = createJevGateway({
    host: '127.0.0.1',
    port: 0,
    upstream: `http://127.0.0.1:${upPort}`,
    concurrency: 1,
  });
  const gwAddr = await gw.listen();
  const baseUrl = `http://127.0.0.1:${gwAddr.port}`;

  try {
    // 1. Occupy slot
    const workerReq = fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review' },
      body: JSON.stringify({ model: 'qev', state: { id: 'worker' }, questions: { q: { type: 'noul' } } }),
    });
    await new Promise((r) => setTimeout(r, 25));

    // 2. Enqueue P2 request with shared body (queued in Lane 2)
    const sharedBody = JSON.stringify({ model: 'qev', state: { id: 'shared' }, questions: { q: { type: 'noul' } } });
    const p2Req = fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'evaluate-run', 'X-Jev-Session-Id': 'sP2' },
      body: sharedBody,
    });
    await new Promise((r) => setTimeout(r, 20));

    // Verify it is queued in Lane 2
    let metrics = await (await fetch(`${baseUrl}/jev/queue-metrics`)).json();
    assert.equal(metrics.queuedByLane.P2, 1);
    assert.equal(metrics.queuedByLane.P0, 0);

    // 3. Coalesce P0 waiter onto the queued P2 flight -> must promote flight to P0!
    const p0WaiterReq = fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review', 'X-Jev-Session-Id': 'sP0' },
      body: sharedBody,
    });
    await new Promise((r) => setTimeout(r, 20));

    metrics = await (await fetch(`${baseUrl}/jev/queue-metrics`)).json();
    assert.equal(metrics.queuedByLane.P0, 1); // Promoted to Lane 0!
    assert.equal(metrics.queuedByLane.P2, 0);

    // 4. Enqueue a regular P1 request
    const p1Req = fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'route-skills', 'X-Jev-Session-Id': 'sP1' },
      body: JSON.stringify({ model: 'qev', state: { id: 'p1-job' }, questions: { q: { type: 'noul' } } }),
    });
    await new Promise((r) => setTimeout(r, 20));

    releaseWorker();
    const [wRes, p2Res, p0Res, p1Res] = await Promise.all([workerReq, p2Req, p0WaiterReq, p1Req]);

    assert.equal(wRes.status, 200);
    assert.equal(p2Res.status, 200);
    assert.equal(p0Res.status, 200);
    assert.equal(p1Res.status, 200);

    // Promoted shared job must dispatch BEFORE p1-job
    assert.deepEqual(dispatchOrder, ['worker', 'shared', 'p1-job']);

    // Check headers
    assert.equal(p2Res.headers.get('x-jev-lane'), 'P0');
    assert.equal(p0Res.headers.get('x-jev-lane'), 'P0');
    assert.equal(p0Res.headers.get('x-jev-cache'), 'COALESCED');
  } finally {
    await gw.close();
    await new Promise((r) => upstreamServer.close(r));
  }
});

test('upstream 502 increments upstreamErrors and waiter errors include error.type', async () => {
  let releaseHold;
  const holdGate = new Promise((r) => { releaseHold = r; });

  const upstreamServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      await holdGate;
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'upstream bad gateway' } }));
    });
  });

  await new Promise((r) => upstreamServer.listen(0, '127.0.0.1', r));
  const upPort = upstreamServer.address().port;

  const gw = createJevGateway({
    host: '127.0.0.1',
    port: 0,
    upstream: `http://127.0.0.1:${upPort}`,
    concurrency: 1,
  });
  const gwAddr = await gw.listen();
  const baseUrl = `http://127.0.0.1:${gwAddr.port}`;

  try {
    const body = JSON.stringify({ model: 'qev', action: 'fail', questions: { q: { type: 'noul' } } });
    const primaryReq = fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review' },
      body,
    });
    await new Promise((r) => setTimeout(r, 25));

    // Waiter coalesces onto failing request
    const waiterReq = fetch(`${baseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jev-Op': 'review' },
      body,
    });
    await new Promise((r) => setTimeout(r, 25));

    releaseHold();
    const [pRes, wRes] = await Promise.all([primaryReq, waiterReq]);

    assert.equal(pRes.status, 502);
    assert.equal(wRes.status, 502);

    const wJson = await wRes.json();
    assert.equal(wJson.error.code, 502);
    assert.ok(wJson.error.type);

    const metrics = await (await fetch(`${baseUrl}/jev/queue-metrics`)).json();
    assert.equal(metrics.upstreamErrors, 1);
    assert.equal(metrics.completed, 0);
  } finally {
    await gw.close();
    await new Promise((r) => upstreamServer.close(r));
  }
});

test('avgWaitMs and totalWaitMs are preserved across aging promotions', async () => {
  let fakeNow = 1000;
  let releaseBlocker;
  const blockerGate = new Promise((r) => { releaseBlocker = r; });
  let jobWaitTime = null;
  const scheduler = new FairPriorityScheduler({
    concurrency: 1,
    agingMs: 100,
    nowFn: () => fakeNow,
    executor: async (job) => {
      if (job.id === 'blocker') {
        await blockerGate;
        return;
      }
      jobWaitTime = fakeNow - job.enqueuedAt;
    },
  });

  // Occupy single slot at fakeNow = 1000 (wait = 0)
  scheduler.enqueue({ id: 'blocker', lane: 0, sessionId: 's0', costBytes: 512 });
  // Enqueue P2 job at fakeNow = 1000
  scheduler.enqueue({ id: 'aged-job', lane: 2, sessionId: 's1', costBytes: 512 });
  assert.equal(scheduler.totalQueued, 1);

  // Age into P1 at fakeNow = 1110
  fakeNow = 1110;
  scheduler._promoteAgedJobs(fakeNow);
  assert.equal(scheduler.lanes[1].sessions.get('s1').queue.length, 1);

  // Age into P0 at fakeNow = 1220
  fakeNow = 1220;
  scheduler._promoteAgedJobs(fakeNow);
  assert.equal(scheduler.lanes[0].sessions.get('s1').queue.length, 1);

  // Release blocker at fakeNow = 1300 so aged-job dispatches with total wait 300ms
  fakeNow = 1300;
  releaseBlocker();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(jobWaitTime, 300); // 1300 - 1000 = 300ms
  assert.equal(scheduler.metrics.totalWaitMs, 300); // 0 (blocker) + 300 (aged-job)
  const snap = scheduler.snapshotMetrics();
  assert.equal(snap.avgWaitMs, 150); // 300 / 2 dispatched jobs
});

test('BoundedLruCache enforces maxBytes, tracks totalBytes, and prunes expired items', () => {
  const cache = new BoundedLruCache(10, 1000, 1000); // 1000 maxBytes cap

  // 1. Add item 1 (400 bytes)
  cache.set('k1', { status: 200, contentType: 'application/json', bodyBuf: Buffer.alloc(400) }, 1000);
  assert.equal(cache.bytes, 400);
  assert.equal(cache.size, 1);

  // 2. Add item 2 (400 bytes) -> total 800 <= 1000
  cache.set('k2', { status: 200, contentType: 'application/json', bodyBuf: Buffer.alloc(400) }, 1000);
  assert.equal(cache.bytes, 800);
  assert.equal(cache.size, 2);

  // 3. Add item 3 (400 bytes) -> 800 + 400 = 1200 > 1000 -> evicts oldest item 'k1'
  cache.set('k3', { status: 200, contentType: 'application/json', bodyBuf: Buffer.alloc(400) }, 1000);
  assert.equal(cache.get('k1', 1050), null);
  assert.ok(cache.get('k2', 1050));
  assert.ok(cache.get('k3', 1050));
  assert.equal(cache.bytes, 800);
  assert.equal(cache.size, 2);

  // 4. Item exceeding maxBytes entirely is rejected
  cache.set('huge', { status: 200, contentType: 'application/json', bodyBuf: Buffer.alloc(1500) }, 1000);
  assert.equal(cache.get('huge', 1050), null);
  assert.equal(cache.bytes, 800);

  // 5. Expired entry pruned on get() decreases totalBytes
  assert.equal(cache.get('k2', 2500), null); // Expired (ttl = 1000)
  assert.equal(cache.bytes, 400); // k2 was pruned
});

test('buildCoalesceKey handles stream:true, completions, chat/completions, and systemone', () => {
  // 1. stream: true returns null for all endpoints
  assert.equal(buildCoalesceKey('POST', '/v1/systemone', { stream: true, model: 'qev' }), null);
  assert.equal(buildCoalesceKey('POST', '/v1/completions', { stream: true, prompt: 'hi', max_tokens: 1 }), null);
  assert.equal(buildCoalesceKey('POST', '/v1/chat/completions', { stream: true, messages: [] }), null);

  // 2. stableCanonicalJson omits undefined values
  assert.equal(stableCanonicalJson({ a: undefined, b: 1 }), '{"b":1}');
  assert.equal(stableCanonicalJson([undefined, 2]), '[null,2]');

  // 3. /v1/completions and /completions
  const compKey1 = buildCoalesceKey('POST', '/v1/completions', { model: 'm', prompt: 'test', max_tokens: 1, temperature: 0 });
  const compKey2 = buildCoalesceKey('POST', '/completions', { model: 'm', prompt: 'test', n_predict: 1, temperature: 0 });
  assert.ok(compKey1);
  assert.equal(compKey1, compKey2);

  // Skip non-deterministic completions without seed
  assert.equal(buildCoalesceKey('POST', '/v1/completions', { prompt: 'test', max_tokens: 1, temperature: 0.8 }), null);
  // Allow completions with temperature > 0 if seed is set
  assert.ok(buildCoalesceKey('POST', '/v1/completions', { prompt: 'test', max_tokens: 1, temperature: 0.8, seed: 42 }));
  // Reject completions with max_tokens > 1
  assert.equal(buildCoalesceKey('POST', '/v1/completions', { prompt: 'test', max_tokens: 10 }), null);

  // 4. /v1/chat/completions and /chat/completions
  const chatKey1 = buildCoalesceKey('POST', '/v1/chat/completions', { model: 'm', messages: [{ role: 'user', content: 'hi' }], temperature: 0 });
  const chatKey2 = buildCoalesceKey('POST', '/chat/completions', { model: 'm', messages: [{ role: 'user', content: 'hi' }], temperature: 0 });
  assert.ok(chatKey1);
  assert.equal(chatKey1, chatKey2);

  // Non-deterministic chat without seed returns null
  assert.equal(buildCoalesceKey('POST', '/v1/chat/completions', { messages: [{ role: 'user', content: 'hi' }], temperature: 0.7 }), null);
  // Deterministic chat with seed returns key
  assert.ok(buildCoalesceKey('POST', '/v1/chat/completions', { messages: [{ role: 'user', content: 'hi' }], temperature: 0.7, seed: 123 }));

  // 5. /v1/systemone with full fields
  const sKey1 = buildCoalesceKey('POST', '/v1/systemone', { model: 'qev', state: 's', files: ['a.txt'], questions: { q: { type: 'noul' } }, temperature: 0 });
  const sKey2 = buildCoalesceKey('POST', '/v1/systemone', { model: 'qev', state: 's', images: ['a.txt'], questions: { q: { type: 'noul' } }, temperature: 0 });
  assert.ok(sKey1);
  assert.equal(sKey1, sKey2); // files and images normalize identically
});

test('IPv6 ::1 loopback formatting and CLI parsing', () => {
  assert.equal(isLoopbackHost('::1'), true);
  assert.equal(isLoopbackHost('[::1]'), true);
  assert.equal(isLoopbackHost('127.0.0.1'), true);
  assert.equal(isLoopbackHost('localhost'), true);
  assert.equal(isLoopbackHost('8.8.8.8'), false);

  assert.equal(formatHostForUrl('::1'), '[::1]');
  assert.equal(formatHostForUrl('[::1]'), '[::1]');
  assert.equal(formatHostForUrl('127.0.0.1'), '127.0.0.1');

  const parsed = parseCliArgs([
    '--host', '::1',
    '--port', '8017',
    '--concurrency', 'NaN',
    '--p0-reserve', '2',
    '--cache-bytes', '1048576',
  ]);
  assert.equal(parsed.host, '::1');
  assert.equal(parsed.upstream, 'http://[::1]:18017');
  assert.equal(parsed.concurrency, 1); // NaN fell back to default 1
  assert.equal(parsed.p0ReservedSlots, 2);
  assert.equal(parsed.cacheMaxBytes, 1048576);
});

test('/health upstream response is cached for 500ms with single-flight deduplication', async () => {
  let healthHits = 0;
  const upstreamServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      healthHits += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', hit: healthHits }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((r) => upstreamServer.listen(0, '127.0.0.1', r));
  const upPort = upstreamServer.address().port;

  const gw = createJevGateway({
    host: '127.0.0.1',
    port: 0,
    upstream: `http://127.0.0.1:${upPort}`,
  });
  const gwAddr = await gw.listen();
  const baseUrl = `http://127.0.0.1:${gwAddr.port}`;

  try {
    // Fire 5 concurrent health requests -> single flight hits upstream once
    const reqs = await Promise.all([
      fetch(`${baseUrl}/health`).then((r) => r.json()),
      fetch(`${baseUrl}/health`).then((r) => r.json()),
      fetch(`${baseUrl}/health`).then((r) => r.json()),
      fetch(`${baseUrl}/health`).then((r) => r.json()),
      fetch(`${baseUrl}/health`).then((r) => r.json()),
    ]);
    assert.equal(healthHits, 1);
    for (const r of reqs) {
      assert.equal(r.status, 'ok');
      assert.ok(r.gateway);
    }

    // Immediate subsequent request within 500ms hits cache -> healthHits still 1
    const cachedResp = await (await fetch(`${baseUrl}/health`)).json();
    assert.equal(cachedResp.status, 'ok');
    assert.equal(healthHits, 1);

    // Wait > 500ms -> cache expires
    await new Promise((r) => setTimeout(r, 550));
    const freshResp = await (await fetch(`${baseUrl}/health`)).json();
    assert.equal(freshResp.status, 'ok');
    assert.equal(healthHits, 2);
  } finally {
    await gw.close();
    await new Promise((r) => upstreamServer.close(r));
  }
});

test('p0ReservedSlots reserves slots for P0 when active reaches threshold', async () => {
  const dispatchHistory = [];
  let releaseHold;
  const holdGate = new Promise((r) => { releaseHold = r; });

  const scheduler = new FairPriorityScheduler({
    concurrency: 3,
    p0ReservedSlots: 1, // When active >= (3 - 1) = 2, only P0 can dispatch
    executor: async (job) => {
      dispatchHistory.push(job.id);
      if (job.id.startsWith('hold')) {
        await holdGate;
      }
    },
  });

  // Start 2 long-running jobs (active = 2)
  scheduler.enqueue({ id: 'hold-1', lane: 1, sessionId: 's1', costBytes: 512 });
  scheduler.enqueue({ id: 'hold-2', lane: 1, sessionId: 's2', costBytes: 512 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(scheduler.active, 2);

  // Queue a P1 job and a P2 job -> neither should dispatch into slot 3 because slot 3 is reserved for P0
  scheduler.enqueue({ id: 'queued-p1', lane: 1, sessionId: 's3', costBytes: 512 });
  scheduler.enqueue({ id: 'queued-p2', lane: 2, sessionId: 's4', costBytes: 512 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(scheduler.active, 2);
  assert.equal(dispatchHistory.length, 2);

  // Queue a P0 job -> it CAN dispatch into the reserved slot!
  scheduler.enqueue({ id: 'hold-urgent-p0', lane: 0, sessionId: 's5', costBytes: 512 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(scheduler.active, 3);
  assert.ok(dispatchHistory.includes('hold-urgent-p0'));
  // Release the blockers
  releaseHold();
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(dispatchHistory.includes('queued-p1'));
  assert.ok(dispatchHistory.includes('queued-p2'));
});

test('forwardToUpstream strips hop-by-hop headers, Connection tokens, and internal x-jev-* headers', async () => {
  let receivedHeaders = null;
  const upstreamServer = http.createServer((req, res) => {
    receivedHeaders = req.headers;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise((r) => upstreamServer.listen(0, '127.0.0.1', r));
  const upPort = upstreamServer.address().port;

  const gw = createJevGateway({
    host: '127.0.0.1',
    port: 0,
    upstream: `http://127.0.0.1:${upPort}`,
  });
  const gwAddr = await gw.listen();
  const baseUrl = `http://127.0.0.1:${gwAddr.port}`;

  try {
    const status = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: gwAddr.port,
        path: '/v1/models',
        method: 'GET',
        headers: {
          'Connection': 'close, x-custom-token',
          'X-Custom-Token': 'secret-should-strip',
          'X-Jev-Op': 'review',
          'X-Jev-Session-Id': 'sess-internal',
          'Accept': 'application/json',
        },
      }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 200);
    assert.ok(receivedHeaders);

    // Hop-by-hop Connection-listed & internal x-jev-* headers must be stripped
    assert.equal(receivedHeaders['x-custom-token'], undefined);
    assert.equal(receivedHeaders['x-jev-op'], undefined);
    assert.equal(receivedHeaders['x-jev-session-id'], undefined);
    // Standard request headers preserved
    assert.equal(receivedHeaders['accept'], 'application/json');
  } finally {
    await gw.close();
    await new Promise((r) => upstreamServer.close(r));
  }
});
