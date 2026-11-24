/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/* MRNote Go toolchain worker. Authored source is never executed. */
"use strict";

const PROTOCOL = "mrnote.go-toolchain.v1";
const TOOLCHAIN = "go1.26.5";
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();

let runtimeFailed = false;

function failure(id, op, message) {
  return {
    protocol: PROTOCOL,
    toolchain: TOOLCHAIN,
    id,
    op,
    ok: false,
    diagnostics: [],
    error: message,
  };
}

function failRuntime() {
  if (runtimeFailed) return;
  runtimeFailed = true;
  self.postMessage({
    protocol: PROTOCOL,
    toolchain: TOOLCHAIN,
    type: "fatal",
  });
}

self.onmessage = (event) => {
  const value = event.data;
  const record =
    value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const id = record && typeof record.id === "string" ? record.id : "";
  const op = record && typeof record.op === "string" ? record.op : "";
  if (
    runtimeFailed ||
    !record ||
    record.protocol !== PROTOCOL ||
    id.length === 0 ||
    id.length > 160 ||
    (op !== "format" && op !== "diagnostics") ||
    typeof record.source !== "string" ||
    encoder.encode(record.source).byteLength > MAX_SOURCE_BYTES
  ) {
    self.postMessage(failure(id, op, "Malformed Go toolchain request."));
    return;
  }
  const call = self.__mraiGoToolchainCall;
  if (typeof call !== "function") {
    self.postMessage(failure(id, op, "Go toolchain is unavailable."));
    return;
  }
  try {
    // Rebuild the object from validated scalars before JSON encoding. A cyclic
    // or accessor-bearing inbound value can never reach JSON.stringify.
    const raw = call(
      JSON.stringify({
        protocol: PROTOCOL,
        id,
        op,
        source: record.source,
      }),
    );
    if (typeof raw !== "string") {
      self.postMessage(failure(id, op, "Malformed Go toolchain receipt."));
      return;
    }
    const receipt = JSON.parse(raw);
    self.postMessage(receipt);
  } catch {
    self.postMessage(failure(id, op, "Go toolchain request failed."));
  }
};

try {
  importScripts("/go-wasm-exec.js");
  const go = new self.Go();
  fetch("/go-toolchain.wasm", {
    cache: "force-cache",
    credentials: "same-origin",
  })
    .then((response) => {
      if (!response.ok) throw new Error("Go toolchain asset unavailable");
      return response.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, go.importObject))
    .then(({ instance }) => go.run(instance))
    .catch(failRuntime);
} catch {
  failRuntime();
}
