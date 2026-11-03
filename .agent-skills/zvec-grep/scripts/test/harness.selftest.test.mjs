// Positive controls for the isolation harness. If these fail, the "no network"
// and "no real index touched" assertions in the managed-daemon contract tests
// would be vacuous, so they run (and must pass) first.
// Run: node --test .agent-skills/zvec-grep/scripts/test/
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  OS_SANDBOX_AVAILABLE, REAL_HOME, REPO_ROOT, createSandbox, diffFingerprints, fingerprintTree,
  localModelArtifactAvailable, realZg, zg, LOCAL_MODEL,
} from "./harness.mjs";

const sandboxes = [];
after(() => sandboxes.forEach((sandbox) => sandbox.cleanup()));
function sandbox(options) {
  const created = createSandbox(options);
  sandboxes.push(created);
  return created;
}

const NODE = process.execPath;

test("sandbox lives outside the real HOME and the repo, and children see only sandbox paths", async () => {
  const sb = sandbox();
  assert.ok(!sb.root.startsWith(REAL_HOME + "/"), "sandbox must not be under the real HOME");
  assert.ok(!sb.root.startsWith(REPO_ROOT + "/"), "sandbox must not be under the repo");
  const probe = "console.log(JSON.stringify({home:process.env.HOME,zhome:process.env.ZVEC_GREP_HOME,cache:process.env.ZVEC_GREP_MODEL_CACHE,os:(await import('node:os')).homedir()}))";
  const result = await sb.run(NODE, ["--input-type=module", "-e", probe]);
  assert.equal(result.code, 0, result.stderr);
  const seen = JSON.parse(result.stdout);
  assert.equal(seen.home, sb.home);
  assert.equal(seen.os, sb.home);
  assert.equal(seen.zhome, sb.zvecHome);
  assert.equal(seen.cache, sb.modelCache);
});

test("OS sandbox denies writes to a sibling private fixture while allowing its own", { skip: !OS_SANDBOX_AVAILABLE && "sandbox-exec unavailable" }, async () => {
  const sb = sandbox();
  const other = sandbox();
  const probe = `
    import { writeFileSync } from 'node:fs';
    const attempt = path => { try { writeFileSync(path, 'probe'); return 'ok'; } catch (error) { return error.code; } };
    console.log(JSON.stringify({ own: attempt(process.argv[1]), sibling: attempt(process.argv[2]) }));`;
  const result = await sb.run(NODE, ["--input-type=module", "-e", probe, join(sb.root, "inside"), join(other.root, "outside")]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { own: "ok", sibling: "EPERM" });
  assert.equal(existsSync(join(other.root, "outside")), false);
});

test("tripwire refuses and records non-loopback fetch, net.connect and dns; allows loopback", async () => {
  const sb = sandbox();
  const script = `
    import net from 'node:net'; import dns from 'node:dns';
    const out = {};
    try { await fetch('https://models.invalid/x'); out.fetch = 'allowed'; } catch (e) { out.fetch = e.code ?? e.message; }
    out.connect = await new Promise((r) => { const s = net.connect(443, '192.0.2.1'); s.on('error', (e) => r(e.code ?? e.message)); s.on('connect', () => r('connected')); });
    out.dns = await new Promise((r) => dns.lookup('models.invalid', (e) => r(e ? (e.code ?? e.message) : 'resolved')));
    const server = net.createServer((c) => c.end()).listen(0, '127.0.0.1', () => {
      const s = net.connect(server.address().port, '127.0.0.1'); s.on('connect', () => { out.loopback = 'connected'; s.destroy(); server.close(); console.log(JSON.stringify(out)); });
    });`;
  const result = await sb.run(NODE, ["--input-type=module", "-e", script]);
  assert.equal(result.code, 0, result.stderr);
  const seen = JSON.parse(result.stdout);
  assert.equal(seen.fetch, "ZVEC_TRIPWIRE_NETWORK");
  assert.equal(seen.connect, "ZVEC_TRIPWIRE_NETWORK");
  assert.equal(seen.dns, "ZVEC_TRIPWIRE_NETWORK");
  assert.equal(seen.loopback, "connected");
  const egress = sb.egressEvents().map((event) => `${event.api}:${event.host}`).sort();
  assert.deepEqual(egress, ["dns.lookup:models.invalid", "fetch:models.invalid", "net.connect:192.0.2.1"]);
  assert.ok(sb.tripwireEvents().some((event) => event.kind === "loopback"), "loopback use is recorded, not hidden");
});

test("fingerprint diff reports added, changed and removed files and is stable when nothing changes", async () => {
  const sb = sandbox();
  sb.writeWorkspaceFiles({ "a.txt": "one", "dir/b.txt": "two" });
  const before = fingerprintTree(sb.workspace);
  assert.ok(diffFingerprints(before, fingerprintTree(sb.workspace)).same);
  sb.writeWorkspaceFiles({ "a.txt": "ONE", "c.txt": "three" });
  rmSync(join(sb.workspace, "dir", "b.txt"));
  const delta = diffFingerprints(before, fingerprintTree(sb.workspace));
  assert.deepEqual(delta.added, ["c.txt"]);
  assert.deepEqual(delta.changed, ["a.txt"]);
  assert.deepEqual(delta.removed, ["dir/b.txt"]);
});

test("OS sandbox denies creating anything under the real HOME and the repo, allows writes inside the sandbox",
  { skip: !OS_SANDBOX_AVAILABLE && "sandbox-exec unavailable on this host" }, async () => {
  const sb = sandbox();
  const homeProbe = join(REAL_HOME, ".zvec-selftest-never-created-dir");
  const repoProbe = join(REPO_ROOT, ".zvec-selftest-never-created-dir");
  // If the guard were broken these empty directories would appear; they are
  // removed again below so a failing run still leaves nothing behind.
  try {
    const script = `
      import { writeFileSync, mkdirSync } from 'node:fs';
      const out = {};
      for (const [name, path] of Object.entries(${JSON.stringify({ home: homeProbe, repo: repoProbe })})) {
        try { mkdirSync(path); out[name] = 'created'; } catch (e) { out[name] = e.code; }
      }
      try { writeFileSync(${JSON.stringify(join(sb.workspace, "inside.txt"))}, 'ok'); out.inside = 'wrote'; } catch (e) { out.inside = e.code; }
      console.log(JSON.stringify(out));`;
    const result = await sb.run(NODE, ["--input-type=module", "-e", script]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { home: "EPERM", repo: "EPERM", inside: "wrote" });
    assert.ok(!existsSync(homeProbe) && !existsSync(repoProbe));
  } finally {
    rmSync(homeProbe, { recursive: true, force: true });
    rmSync(repoProbe, { recursive: true, force: true });
  }
});

test("OS sandbox denies non-loopback outbound at the kernel, independent of the JS tripwire",
  { skip: !OS_SANDBOX_AVAILABLE && "sandbox-exec unavailable on this host" }, async () => {
  const sb = sandbox();
  const script = `
    import net from 'node:net';
    // TEST-NET-1 (RFC 5737) is non-routable; only the kernel sandbox is in the way here.
    const r = await new Promise((resolve) => {
      const s = new net.Socket();
      s.on('error', (e) => resolve(e.code ?? e.message));
      s.on('connect', () => resolve('connected'));
      s.connect({ host: '192.0.2.1', port: 443 });
    });
    console.log(JSON.stringify({ r }));`;
  // Disable the preload for this one process so only the kernel sandbox stands in the way.
  const result = await sb.run(NODE, ["--input-type=module", "-e", script], { env: { NODE_OPTIONS: "" } });
  assert.equal(result.code, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).r, /^(EPERM|EACCES|ENETUNREACH)$/);
});

test("positive control: indexing without a local model tries to download, and the tripwire sees and stops it",
  { skip: !realZg() && "zg not installed" }, async () => {
  const sb = sandbox();
  sb.writeWorkspaceFiles({ "a.ts": "export const a = 1;\n" });
  const result = await zg(sb, ["index", sb.workspace, "--embedding", LOCAL_MODEL, "--mode", "direct"]);
  assert.notEqual(result.code, 0, "indexing cannot succeed without a model and without network");
  const hosts = sb.egressEvents().map((event) => event.host);
  assert.ok(hosts.includes("huggingface.co"), `expected a download attempt, saw ${JSON.stringify(hosts)}`);
});

test("positive control: with the model copied into the sandbox cache, local indexing succeeds with zero egress",
  { skip: (!realZg() || !localModelArtifactAvailable()) && "zg or local model artifact unavailable" }, async () => {
  const sb = sandbox();
  sb.writeWorkspaceFiles({ "a.ts": "export function parseInvoice(text: string) { return text.trim(); }\n" });
  assert.ok(sb.seedLocalModel());
  const result = await zg(sb, ["index", sb.workspace, "--embedding", LOCAL_MODEL, "--mode", "direct"]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(sb.egressEvents(), []);
  assert.ok(existsSync(join(sb.indexDir, "index.zvec")));
  assert.ok(existsSync(join(sb.indexDir, "files.zvec")));
});
