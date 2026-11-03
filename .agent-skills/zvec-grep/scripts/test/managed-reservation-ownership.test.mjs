import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ManagedController } from "../managed-daemon/controller.mjs";
import { ReservationStore, WarningStore } from "../managed-daemon/state.mjs";
import { createSandbox, sleep } from "./harness.mjs";

function fixture(t, barrierMs = 2000) {
  const sandbox = createSandbox();
  t.after(() => sandbox.cleanup());
  const root = sandbox.workspace;
  const reservations = new ReservationStore(join(sandbox.root, "reservations"));
  const warnings = new WarningStore(join(sandbox.root, "warnings"));
  const directives = [];
  let controller;
  controller = new ManagedController({
    warnings, reservations, barrierMs,
    runJob: async () => {
      const startedAt = Date.now();
      directives.push(controller.takeDirectives(root));
      return { state: "succeeded", startedAt };
    },
    takeResult: () => ({}),
  });
  return { root, reservations, warnings, controller, directives };
}

test("independent verification cannot release another host turn", async t => {
  const f = fixture(t);
  const first = f.controller.reserve(f.root);
  const second = f.controller.reserve(f.root);
  await f.controller.refresh(f.root, { verify: true });
  assert.equal(f.directives[0].verify, true);
  assert.deepEqual(f.reservations.load(f.root).map(x => x.id), [first.id, second.id]);
  await f.controller.refresh(f.root, { reservationId: first.id, changed: ["changed.txt"] });
  assert.deepEqual(f.reservations.load(f.root).map(x => x.id), [second.id]);
  assert.equal(f.controller.release(f.root, second.id, "unchanged").found, true);
  assert.deepEqual(f.reservations.load(f.root), []);
});

test("expired reservation fences search across restart until late release and repair", { timeout: 3000 }, async t => {
  const f = fixture(t, 80);
  const reservation = f.controller.reserve(f.root);
  await sleep(120);
  assert.equal(f.warnings.read(f.root)?.code, "RESERVATION_EXPIRED");
  assert.deepEqual(f.reservations.load(f.root).map(x => x.id), [reservation.id]);
  let restarted;
  const jobs = [];
  restarted = new ManagedController({
    warnings: f.warnings, reservations: f.reservations, barrierMs: 80,
    runJob: async () => {
      const startedAt = Date.now();
      jobs.push(restarted.takeDirectives(f.root));
      return { state: "succeeded", startedAt };
    },
    takeResult: () => ({}),
  });
  let searched = false;
  await assert.rejects(restarted.gate(f.root, async () => { searched = true; return "stale"; }), { code: "FRESHNESS_BARRIER_TIMEOUT" });
  assert.equal(searched, false);
  assert.deepEqual(f.reservations.load(f.root).map(x => x.id), [reservation.id]);
  assert.equal(restarted.release(f.root, reservation.id, "unchanged").found, true);
  const result = await restarted.gate(f.root, async () => "fresh");
  assert.equal(result.result, "fresh");
  assert.ok(jobs.some(job => job.verify), "late release must trigger verified repair");
  assert.equal(result.recovered?.code, "RESERVATION_EXPIRED");
  assert.deepEqual(f.reservations.load(f.root), []);
});

test("named refresh finishing after expiry forces a new verification before search", async t => {
  const sandbox = createSandbox();
  t.after(() => sandbox.cleanup());
  const root = sandbox.workspace;
  const warnings = new WarningStore(join(sandbox.root, "warnings"));
  const reservations = new ReservationStore(join(sandbox.root, "reservations"));
  let now = Date.now();
  let finish;
  const jobs = [];
  let controller;
  controller = new ManagedController({
    warnings, reservations, barrierMs: 5000, now: () => now,
    runJob: async () => {
      const startedAt = now;
      jobs.push(controller.takeDirectives(root));
      if (jobs.length === 1) await new Promise(resolve => { finish = resolve; });
      return { state: "succeeded", startedAt };
    },
    takeResult: () => ({}),
  });
  const reservation = controller.reserve(root);
  const refresh = controller.refresh(root, { reservationId: reservation.id, changed: ["changed.txt"] });
  assert.equal(typeof finish, "function");
  now = reservation.expires_at_ms + 1;
  finish();
  await refresh;
  assert.equal(warnings.read(root)?.code, "RESERVATION_EXPIRED");
  assert.deepEqual(reservations.load(root), []);
  const result = await controller.gate(root, async () => {
    assert.ok(jobs.length >= 2 && jobs.at(-1).verify, "search ran before post-expiry verification");
    return "fresh";
  });
  assert.equal(result.result, "fresh");
  assert.equal(result.recovered?.code, "RESERVATION_EXPIRED");
});
