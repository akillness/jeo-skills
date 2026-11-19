import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createJevGateway, FairPriorityScheduler, inferPriorityLane, buildCoalesceKey } from './jev-gateway.mjs';

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
