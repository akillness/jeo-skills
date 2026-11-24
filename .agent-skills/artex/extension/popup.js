const $ = (id) => document.getElementById(id);

async function refreshState() {
  const st = await chrome.runtime.sendMessage({ type: "getState" });
  const lines = [];
  lines.push(st.capturing
    ? `● Recording tab ${st.tabId}`
    : "○ Not recording");
  lines.push(`ingested: ${st.ingested} · queued: ${st.queued} · failed: ${st.failed}`);
  if (st.lastError) lines.push(st.lastError);
  $("status").textContent = lines.join("\n");
  $("error").textContent = st.capturing ? "" : (st.lastError || "");
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    serverUrl: $("serverUrl").value.trim(),
    token: $("token").value.trim(),
  });
  $("save").textContent = "Saved ✓";
  setTimeout(() => ($("save").textContent = "Save settings"), 1200);
});

$("start").addEventListener("click", async () => {
  const out = await chrome.runtime.sendMessage({ type: "start" });
  if (out && out.ok === false) $("error").textContent = out.error || "failed to start";
  refreshState();
});

$("stop").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "stop" });
  refreshState();
});

$("flush").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "flushNow" });
  refreshState();
});

(async () => {
  const { serverUrl = "", token = "" } = await chrome.storage.local.get(["serverUrl", "token"]);
  $("serverUrl").value = serverUrl;
  $("token").value = token;
  refreshState();
  setInterval(refreshState, 1500);
})();
