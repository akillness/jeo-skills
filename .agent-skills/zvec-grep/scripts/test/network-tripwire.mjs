// Preloaded into every Node process the managed-daemon tests start
// (NODE_OPTIONS=--import <this file>). It records and blocks every network
// attempt so a test can assert "the offline refresh path never tried to talk
// to the network", independent of whether the OS sandbox also denied it.
//
// Loopback and unix-socket connects are recorded as kind "loopback"/"unix" and
// allowed (the daemon's own control plane may legitimately use them). Anything
// else is recorded as kind "egress" and refused. Events go to the JSONL file
// named by ZVEC_TRIPWIRE_LOG; the file is appended synchronously so events
// survive a SIGKILL of the process.
import { appendFileSync } from "node:fs";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const LOG = process.env.ZVEC_TRIPWIRE_LOG;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "::ffff:127.0.0.1"]);

function record(event) {
  if (!LOG) return;
  try {
    appendFileSync(LOG, `${JSON.stringify({ pid: process.pid, argv1: process.argv[1], ...event })}\n`);
  } catch {
    // The log lives in the sandbox; if it is gone the test is already over.
  }
}

function blocked(what, detail) {
  const error = new Error(`network tripwire: ${what} refused (${detail})`);
  error.code = "ZVEC_TRIPWIRE_NETWORK";
  return error;
}

function isLoopback(host) {
  if (host === undefined || host === null || host === "") return true; // net default is localhost
  return LOOPBACK.has(String(host).toLowerCase()) || /^127\./.test(String(host));
}

const realFetch = globalThis.fetch;
if (typeof realFetch === "function") {
  globalThis.fetch = async function tripwireFetch(input, init) {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    let host = "";
    try { host = new URL(url).hostname; } catch { /* not a URL */ }
    if (isLoopback(host)) {
      record({ kind: "loopback", api: "fetch", host });
      return realFetch.call(this, input, init);
    }
    record({ kind: "egress", api: "fetch", host });
    throw blocked("fetch", host);
  };
}

const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function tripwireConnect(...args) {
  // net.connect()/createConnection() hand over the already-normalized
  // [options, callback] array; a direct socket.connect() call passes options.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  let host;
  let port;
  let unix = false;
  if (first && typeof first === "object" && !Array.isArray(first)) {
    if (typeof first.path === "string") unix = true;
    else { host = first.host; port = first.port; }
  } else if (typeof first === "string") {
    unix = args.length === 1 || typeof args[1] === "function";
    if (!unix) host = args[1];
  } else if (typeof first === "number") {
    port = first;
    host = typeof args[1] === "string" ? args[1] : undefined;
  }
  // The managed daemon proves its kernel egress boundary by attempting ONE raw
  // connect to RFC 5737 TEST-NET-1 (192.0.2.1:9, never routable) from inside its
  // own sandbox and requiring the kernel to answer EPERM. Let exactly that probe
  // reach the kernel (and record it separately from real egress); everything
  // else is refused here regardless of the kernel sandbox.
  if (process.env.ZVEC_MANAGED_OS_SANDBOX === "darwin-sandbox-exec" && host === "192.0.2.1" && Number(port) === 9) {
    record({ kind: "kernel_probe", api: "net.connect", host, port: 9 });
    return realConnect.apply(this, args);
  }
  if (unix) {
    record({ kind: "unix", api: "net.connect" });
    return realConnect.apply(this, args);
  }
  if (isLoopback(host)) {
    record({ kind: "loopback", api: "net.connect", host: host ?? "localhost" });
    return realConnect.apply(this, args);
  }
  record({ kind: "egress", api: "net.connect", host: String(host) });
  const error = blocked("net.connect", String(host));
  process.nextTick(() => this.destroy(error));
  return this;
};

function guardDnsCallback(name, original) {
  return function tripwireDns(hostname, ...rest) {
    // net.Server.listen()/connect() route IP literals through dns.lookup, which
    // answers them locally without any query; the connect/bind itself is judged
    // by the Socket guard and the kernel sandbox.
    if (isLoopback(hostname) || net.isIP(String(hostname))) return original.call(this, hostname, ...rest);
    record({ kind: "egress", api: `dns.${name}`, host: String(hostname) });
    const callback = rest.find((value) => typeof value === "function");
    const error = blocked(`dns.${name}`, String(hostname));
    if (callback) {
      process.nextTick(callback, error);
      return undefined;
    }
    throw error;
  };
}

for (const name of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny"]) {
  if (typeof dns[name] === "function") dns[name] = guardDnsCallback(name, dns[name]);
}
for (const name of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny"]) {
  const original = dns.promises?.[name];
  if (typeof original !== "function") continue;
  dns.promises[name] = async function tripwireDnsPromise(hostname, ...rest) {
    if (isLoopback(hostname) || net.isIP(String(hostname))) return original.call(this, hostname, ...rest);
    record({ kind: "egress", api: `dns.promises.${name}`, host: String(hostname) });
    throw blocked(`dns.promises.${name}`, String(hostname));
  };
}

for (const [label, mod] of [["http", http], ["https", https]]) {
  for (const method of ["request", "get"]) {
    const original = mod[method];
    mod[method] = function tripwireHttp(...args) {
      const first = args[0];
      let host = "";
      if (typeof first === "string" || first instanceof URL) {
        try { host = new URL(String(first)).hostname; } catch { /* ignore */ }
      } else if (first && typeof first === "object") {
        host = first.hostname ?? first.host ?? "";
      }
      if (isLoopback(host)) {
        record({ kind: "loopback", api: `${label}.${method}`, host });
        return original.apply(this, args);
      }
      record({ kind: "egress", api: `${label}.${method}`, host: String(host) });
      throw blocked(`${label}.${method}`, String(host));
    };
  }
}

record({ kind: "armed" });
