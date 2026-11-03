import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ManagedController } from "../managed-daemon/controller.mjs";
import { ReservationStore } from "../managed-daemon/state.mjs";
import { createSandbox } from "./harness.mjs";

function fixture(t) {
  const sandbox = createSandbox();
  t.after(() => sandbox.cleanup());
  const root = sandbox.workspace;
  const directory = join(sandbox.root, "reservations");
  mkdirSync(directory);
  return { root, directory, store: new ReservationStore(directory) };
}

const valid = { id: "reservation-1", reason: "turn_end", created_at_ms: 1000, expires_at_ms: 2000 };

test("valid persisted reservation survives restart, including an expired record", t => {
  const f = fixture(t);
  f.store.save(f.root, [valid]);
  const restarted = new ReservationStore(f.directory);
  assert.deepEqual(restarted.load(f.root), [valid]);
  assert.deepEqual(restarted.roots(), [f.root]);
});

test("missing reservation file or directory is empty", t => {
  const f = fixture(t);
  assert.deepEqual(f.store.load(f.root), []);
  assert.deepEqual(new ReservationStore(join(f.directory, "missing")).roots(), []);
});

for (const [name, record] of [
  ["wrong root", { root: "/different/root", reservations: [valid] }],
  ["missing list", { root: "ROOT" }],
  ["not a list", { root: "ROOT", reservations: {} }],
  ["missing id", { root: "ROOT", reservations: [{ ...valid, id: undefined }] }],
  ["empty id", { root: "ROOT", reservations: [{ ...valid, id: "" }] }],
  ["missing creation time", { root: "ROOT", reservations: [{ ...valid, created_at_ms: undefined }] }],
  ["non-numeric expiry", { root: "ROOT", reservations: [{ ...valid, expires_at_ms: "later" }] }],
  ["expiry before creation", { root: "ROOT", reservations: [{ ...valid, expires_at_ms: 999 }] }],
]) {
  test(`corrupt persisted reservation fails closed: ${name}`, t => {
    const f = fixture(t);
    const candidate = { ...record, root: record.root === "ROOT" ? f.root : record.root };
    writeFileSync(f.store.path(f.root), JSON.stringify(candidate));
    const restarted = new ReservationStore(f.directory);
    assert.throws(() => restarted.load(f.root));
    assert.throws(() => restarted.roots());
  });
}

test("malformed JSON and mismatched root hash fail closed during restart", t => {
  const f = fixture(t);
  writeFileSync(f.store.path(f.root), "{");
  assert.throws(() => new ReservationStore(f.directory).load(f.root));
  assert.throws(() => new ReservationStore(f.directory).roots());
  writeFileSync(f.store.path(f.root), JSON.stringify({ root: "/different/root", reservations: [valid] }));
  assert.throws(() => new ReservationStore(f.directory).roots());
});

test("reservation directory read failure is not interpreted as no active roots", t => {
  const f = fixture(t);
  const notDirectory = join(f.directory, "file");
  writeFileSync(notDirectory, "not a directory");
  assert.throws(() => new ReservationStore(notDirectory).roots());
  assert.throws(() => new ReservationStore(notDirectory).load(f.root));
});

test("a failed adoption never caches an empty root on retry", t => {
  const f = fixture(t);
  writeFileSync(f.store.path(f.root), "{");
  const controller = new ManagedController({ warnings: {}, reservations: f.store });
  assert.throws(() => controller.state(f.root));
  assert.throws(() => controller.state(f.root));
  assert.throws(() => controller.reserve(f.root));
});
