// AgentWebBridge.jslib (scenario-unity-web skill, 2026-09-24). C# <-> page bridge for a Unity 6.3 Web build.
// ES5 only: .jslib and .jspre files do not accept ES6 (no let/const, arrow functions, classes,
// template literals) (6.3 Manual, "Set up your JavaScript plug-in").
// Strings arrive as heap pointers: read them at once with UTF8ToString (never keep the pointer).
// Results go back through a C# function pointer with the makeDynCall macro, which works with and
// without "Use WebAssembly.Table" (dynCall/Pointer_stringify are deprecated).
// Never write the triple-brace macro syntax inside a comment: Emscripten expands it there too, and
// the expansion broke the build here ("SyntaxError: Illegal return statement", observed 2026-09-24).
// Page contract (host page or portal wrapper): window.StudioLeaderboard.submit(name, score)
// returns a value or a Promise of {rank: int}. No page object: the call answers ok=false.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-web/test_live_web.py (round trip in headless Chrome).
mergeInto(LibraryManager.library, {

  AgentWeb_SubmitScore: function (namePtr, score, requestId, callback) {
    var name = UTF8ToString(namePtr);            // copy now: the pointer dies after this call
    function reply(obj) {
      var json = JSON.stringify(obj);
      var size = lengthBytesUTF8(json) + 1;
      var buf = _malloc(size);
      stringToUTF8(json, buf, size);
      {{{ makeDynCall('vii', 'callback') }}}(requestId, buf);
      _free(buf);                                // C# copied the string inside the callback
    }
    var api = (typeof window !== 'undefined') ? window.StudioLeaderboard : null;
    if (!api || typeof api.submit !== 'function') {
      setTimeout(function () { reply({ ok: false, rank: -1, error: 'no window.StudioLeaderboard on this page' }); }, 0);
      return;
    }
    var p;
    try { p = Promise.resolve(api.submit(name, score)); }
    catch (e) { setTimeout(function () { reply({ ok: false, rank: -1, error: String(e) }); }, 0); return; }
    // name is echoed back so a test can prove non-ASCII text survives C# -> JS -> C#
    p.then(function (res) { reply({ ok: true, rank: (res && res.rank) | 0, error: '', name: name }); },
           function (e) { reply({ ok: false, rank: -1, error: String(e), name: name }); });
  },

  // C# errors and exceptions (WebErrorReporter.cs) -> the page reporter (AgentWeb template:
  // window.AgentWebReportError, console line + sendBeacon to its endpoint). Portals ignore or rewrite
  // index.html, so when no page reporter exists this beacons straight to the endpoint set from C#.
  AgentWeb_ReportError: function (kindPtr, messagePtr, stackPtr, endpointPtr) {
    var kind = UTF8ToString(kindPtr), message = UTF8ToString(messagePtr);
    var stack = UTF8ToString(stackPtr), endpoint = UTF8ToString(endpointPtr);
    if (typeof window !== 'undefined' && typeof window.AgentWebReportError === 'function') {
      window.AgentWebReportError(kind, message, stack);
      return;
    }
    var body = JSON.stringify({ kind: kind, message: message.slice(0, 2000), stack: stack.slice(0, 4000),
                                url: (typeof location !== 'undefined') ? location.href : '' });
    console.log('AGENTWEB_ERROR ' + body);
    if (endpoint && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      try { navigator.sendBeacon(endpoint, body); } catch (e) {}
    }
  },

  // Game -> page events (gameplay_start, level_done...). Portals measure the initial download up
  // to their own gameplay-start call: forward this event to the portal SDK in the host page.
  AgentWeb_Signal: function (eventPtr, payloadPtr) {
    var ev = UTF8ToString(eventPtr);
    var payload = UTF8ToString(payloadPtr);
    if (typeof window === 'undefined') return;
    window.__agentWeb = window.__agentWeb || { events: [] };
    window.__agentWeb.events.push({ name: ev, payload: payload, t: performance.now() });
    try { window.dispatchEvent(new CustomEvent('agentweb:' + ev, { detail: payload })); } catch (e) {}
  }
});
