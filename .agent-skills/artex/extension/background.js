// ARTEX Traffic Capture — background service worker.
//
// Captures the network activity of one tab through the chrome.debugger API
// (Network domain) and pushes text request/response pairs to the ARTEX
// ingest endpoint in batches. State lives in chrome.storage.session so the
// popup and the (short-lived) service worker share one view; the queue is
// deliberately in-memory — a browser restart drops unsent entries, which is
// the acceptable failure mode for a manual capture session.

const FLUSH_AT = 10; // entries per batch
const MAX_BODY = 256 * 1024; // matches the server-side ingest cap
const SKIP_MIME = ["image/", "font/", "audio/", "video/", "application/octet-stream"];

let session = {
  capturing: false,
  tabId: null,
  queue: [], // pending ExternalExchange objects
  requests: new Map(), // debugger requestId -> partial request info
  ingested: 0,
  failed: 0,
  lastError: "",
};

async function saveState() {
  await chrome.storage.session.set({
    capturing: session.capturing,
    tabId: session.tabId,
    ingested: session.ingested,
    failed: session.failed,
    lastError: session.lastError,
    queued: session.queue.length,
  });
}

async function getConfig() {
  const { serverUrl = "", token = "" } = await chrome.storage.local.get(["serverUrl", "token"]);
  return { serverUrl: serverUrl.replace(/\/+$/, ""), token };
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ? tab.id : null;
}

async function start() {
  if (session.capturing) return { ok: true };
  const { serverUrl, token } = await getConfig();
  if (!serverUrl || !token) {
    return { ok: false, error: "Set the ARTEX URL and token first." };
  }
  const tabId = await getActiveTabId();
  if (tabId == null) return { ok: false, error: "No active tab." };
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
  } catch (e) {
    return { ok: false, error: `attach failed: ${e.message}` };
  }
  await chrome.debugger.sendCommand({ tabId }, "Network.enable", {});
  session = { ...session, capturing: true, tabId, queue: [], requests: new Map(), ingested: 0, failed: 0, lastError: "" };
  chrome.action.setBadgeText({ text: "REC" });
  chrome.action.setBadgeBackgroundColor({ color: "#c2410c" });
  await saveState();
  return { ok: true };
}

async function stop() {
  if (session.capturing && session.tabId != null) {
    await flush();
    try {
      await chrome.debugger.sendCommand({ tabId: session.tabId }, "Network.disable", {});
      await chrome.debugger.detach({ tabId: session.tabId });
    } catch (_) {
      // tab may already be gone; nothing to do
    }
  }
  session.capturing = false;
  session.tabId = null;
  chrome.action.setBadgeText({ text: "" });
  await saveState();
  return { ok: true };
}

function skipBody(mimeType) {
  const mt = (mimeType || "").toLowerCase();
  return SKIP_MIME.some((p) => mt.startsWith(p));
}

function truncate(s) {
  if (s.length <= MAX_BODY) return s;
  return s.slice(0, MAX_BODY) + "\n... [truncated by extension]";
}

async function queueExchange(info, response) {
  const respHeaders = {};
  // CDP hands back response.headers as a plain object (dict), not an array of
  // {name,value} records; iterating it with for...of throws "object is not
  // iterable" and no exchange is ever queued. Accept both shapes.
  const rawHeaders = response.headers || {};
  if (Array.isArray(rawHeaders)) {
    for (const h of rawHeaders) {
      if (h && h.name != null) respHeaders[String(h.name).toLowerCase()] = h.value;
    }
  } else {
    for (const [k, v] of Object.entries(rawHeaders)) respHeaders[String(k).toLowerCase()] = v;
  }
  const mime = respHeaders["content-type"] || "";

  let reqBody = info.postData || "";
  let respBody = "";
  if (!skipBody(mime)) {
    try {
      const body = await chrome.debugger.sendCommand(
        { tabId: session.tabId },
        "Network.getResponseBody",
        { requestId: info.requestId }
      );
      if (body && !body.base64Encoded) {
        reqBody = truncate(reqBody);
        respBody = truncate(body.body || "");
      }
    } catch (_) {
      // body already discarded by the browser; capture the pair without bodies
    }
  }

  session.queue.push({
    method: info.method,
    url: info.url,
    status: response.status || 0,
    requestHeaders: info.headers || {},
    requestBody: reqBody,
    responseHeaders: respHeaders,
    responseBody: respBody,
  });
  if (session.queue.length >= FLUSH_AT) await flush();
}

async function flush() {
  if (session.queue.length === 0) return;
  const { serverUrl, token } = await getConfig();
  if (!serverUrl || !token) {
    session.lastError = "missing server URL or token";
    await saveState();
    return;
  }
  const batch = session.queue.splice(0, FLUSH_AT);
  try {
    const res = await fetch(`${serverUrl}/api/traffic/ingest`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ exchanges: batch }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const out = await res.json();
    session.ingested += out.ingested || 0;
    session.failed += out.failed || 0;
    session.lastError = out.failed ? `${out.failed} entries rejected by the server` : "";
  } catch (e) {
    // put the batch back (oldest first) but cap the queue so a dead server
    // cannot grow memory unbounded
    session.queue = batch.concat(session.queue).slice(0, 200);
    session.lastError = e.message;
  }
  await saveState();
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!session.capturing || !source.tabId || source.tabId !== session.tabId) return;
  if (method === "Network.requestWillBeSent") {
    session.requests.set(params.requestId, {
      requestId: params.requestId,
      method: params.request.method,
      url: params.request.url,
      headers: params.request.headers,
      postData: params.request.postData || "",
    });
  } else if (method === "Network.responseReceived") {
    const info = session.requests.get(params.requestId);
    if (info) info.response = params.response;
  } else if (method === "Network.loadingFinished") {
    const info = session.requests.get(params.requestId);
    session.requests.delete(params.requestId);
    if (!info || !info.response) return;
    queueExchange(info, info.response).catch((e) => {
      session.lastError = e.message;
      saveState();
    });
  }
});

chrome.debugger.onDetach.addListener((source) => {
  if (session.capturing && source.tabId === session.tabId) {
    // DevTools opened, or the tab navigated somewhere undebaggable: stop
    // cleanly instead of silently dropping events.
    session.capturing = false;
    session.tabId = null;
    session.lastError = "debugger detached (DevTools opened?)";
    chrome.action.setBadgeText({ text: "" });
    saveState();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case "getState": {
        sendResponse({
          capturing: session.capturing,
          tabId: session.tabId,
          ingested: session.ingested,
          failed: session.failed,
          queued: session.queue.length,
          lastError: session.lastError,
          configured: !!(await getConfig()).serverUrl,
        });
        return;
      }
      case "start":
        sendResponse(await start());
        return;
      case "stop":
        sendResponse(await stop());
        return;
      case "flushNow":
        await flush();
        sendResponse(await stateSnapshot());
        return;
      default:
        sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true; // async sendResponse
});

async function stateSnapshot() {
  return {
    capturing: session.capturing,
    tabId: session.tabId,
    ingested: session.ingested,
    failed: session.failed,
    queued: session.queue.length,
    lastError: session.lastError,
  };
}
