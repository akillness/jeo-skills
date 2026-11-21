/* native-ui.js: HTML builders for iOS UI at true proportions + two Motion moves (arrive, macro). Plain <script>; pair with native-ui.css; load AFTER motion.js.
 *
 *   <link rel="stylesheet" href="../runtime/native-ui/native-ui.css"><script src="../runtime/native-ui/native-ui.js"></script>
 *   const icon = NativeUI.appIcon({ bg: 'linear-gradient(#6b5bff,#3d2fd1)', glyph: '<svg ...>' });
 *   const html = NativeUI.phone(NativeUI.lockScreen({ time: '7:52', date: 'Monday 5 October', wallpaper: 'radial-gradient(...)',
 *     notifs: [{ icon, title: 'Priya Raman', time: 'now', body: 'Landed early. Meet me at door 4? I have two bags.' }] }));
 *   stage.insertAdjacentHTML('beforeend', '<div class="nu" id="ui" style="--s:.72">' + html + '</div>');
 *   NativeUI.arrive(M, '#ui .nu-notif:last-child', { at: 18, dir: 'up', push: ['#ui .nu-notif:first-child'] });   // frames, M.enter underneath
 *   NativeUI.macro(M, '#ui .nu-notif:last-child', { at: 62, world: '#cam', fill: .62 });                          // M.camera push-in, target fills 62 % of the frame width
 *
 * A UI needs identity: every notification takes an icon (or app), a title (the sender / subject), a time and a real sentence. Missing pieces throw, because a
 * notification without them is the "label . value card" the director rejects. Copy comes from the brief; invented senders/apps are fine when the film says illustrative.
 * Entries are hard appearances plus measured travel (M.enter: smear, measured ease), never an opacity ramp. All sizes are in points via --s (see native-ui.css).
 */
(function (root) {
  const esc = (s) =>
    String(s == null ? "" : s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
  const need = (what, fn, v) => {
    if (v == null || v === "")
      throw new Error(
        "NativeUI." +
          fn +
          ": " +
          what +
          " is required (a UI without identity is the vibe-coded card)",
      );
    return v;
  };

  const GLYPH = {
    signal:
      '<svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg>',
    wifi: '<svg viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0zM3.5 6.9a6.4 6.4 0 0 1 9 0l1.5-1.5a8.5 8.5 0 0 0-12 0zM.6 4a10.6 10.6 0 0 1 14.8 0L16.8 2.6a12.6 12.6 0 0 0-17.6 0z" fill="currentColor"/></svg>',
    torch:
      '<svg viewBox="0 0 24 24"><path d="M8 2h8v4l-2 3v13h-4V9L8 6z" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    camera:
      '<svg viewBox="0 0 24 24"><path d="M3 7h4l2-2h6l2 2h4v12H3z" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.4" fill="none" stroke="#fff" stroke-width="1.6"/></svg>',
    lock: '<svg viewBox="0 0 14 18"><rect x="0" y="7" width="14" height="11" rx="2.5" fill="currentColor"/><path d="M3 7V5a4 4 0 0 1 8 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    home: '<svg viewBox="0 0 26 24"><path d="M3 11 13 3l10 8v10h-7v-6h-6v6H3z" fill="currentColor"/></svg>',
    chart:
      '<svg viewBox="0 0 26 24"><rect x="3" y="12" width="5" height="9" rx="1.5" fill="currentColor"/><rect x="10.5" y="6" width="5" height="15" rx="1.5" fill="currentColor"/><rect x="18" y="3" width="5" height="18" rx="1.5" fill="currentColor"/></svg>',
    list: '<svg viewBox="0 0 26 24"><circle cx="5" cy="6" r="2" fill="currentColor"/><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="5" cy="18" r="2" fill="currentColor"/><rect x="9" y="5" width="15" height="2.4" rx="1.2" fill="currentColor"/><rect x="9" y="10.8" width="15" height="2.4" rx="1.2" fill="currentColor"/><rect x="9" y="16.6" width="15" height="2.4" rx="1.2" fill="currentColor"/></svg>',
    person:
      '<svg viewBox="0 0 26 24"><circle cx="13" cy="8" r="5" fill="currentColor"/><path d="M3 22a10 10 0 0 1 20 0z" fill="currentColor"/></svg>',
    bubble:
      '<svg viewBox="0 0 26 24"><path d="M13 2.5c6.4 0 11 3.9 11 8.9s-4.6 8.9-11 8.9c-1.2 0-2.3-.1-3.3-.4L4.5 22l1.3-4.2C3.3 16.3 2 14 2 11.4 2 6.4 6.6 2.5 13 2.5z" fill="currentColor"/></svg>',
    calendar:
      '<svg viewBox="0 0 26 24"><rect x="3" y="4" width="20" height="17" rx="3.5" fill="currentColor"/><rect x="7" y="1.5" width="2.4" height="5" rx="1.2" fill="currentColor"/><rect x="16.6" y="1.5" width="2.4" height="5" rx="1.2" fill="currentColor"/><rect x="3" y="9" width="20" height="2" fill="#fff" opacity=".35"/></svg>',
  };

  /** Status bar: time (left ear), battery / wifi / signal (right ear). battery 0..1. */
  function statusBar({ time = "9:41", battery = 0.82, signal = true } = {}) {
    const b =
      '<svg viewBox="0 0 27 12"><rect x=".5" y=".5" width="23" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="' +
      (20 * Math.max(0.05, Math.min(1, battery))).toFixed(1) +
      '" height="8" rx="2" fill="currentColor"/><path d="M25 4v4a2 2 0 0 0 0-4z" fill="currentColor" opacity=".45"/></svg>';
    return (
      '<div class="nu-status"><span>' +
      esc(time) +
      '</span><span class="nu-glyphs">' +
      (signal ? GLYPH.signal : "") +
      GLYPH.wifi +
      b +
      "</span></div>"
    );
  }
  /** A device: bezel, titanium edge, island, status bar, home indicator. `screen` is inner HTML. */
  function phone(
    screen,
    { dark = false, time = "9:41", status = true, battery } = {},
  ) {
    return (
      '<div class="nu-phone"><div class="nu-screen' +
      (dark ? " dark" : "") +
      '">' +
      screen +
      (status ? statusBar({ time, battery }) : "") +
      '<div class="nu-island"></div><div class="nu-home"></div></div></div>'
    );
  }
  /** App icon (iOS superellipse). bg: any CSS background; glyph: inline <svg> or <img> html (white by default); letter: fallback. size in points (38 in a notification, 60 on a home screen). */
  function appIcon({ bg, glyph, letter, size = 38 } = {}) {
    return (
      '<div class="nu-icon" style="--isz:' +
      size +
      ";" +
      (bg ? "background:" + bg : "") +
      '">' +
      (glyph || esc((letter || "?").slice(0, 2))) +
      "</div>"
    );
  }
  const iconHtml = (icon, app) =>
    !icon
      ? appIcon({ letter: app })
      : /^\s*</.test(icon)
        ? icon
        : /\.(png|jpe?g|svg|webp)(\?|$)/i.test(icon)
          ? appIcon({ glyph: '<img src="' + esc(icon) + '" alt="">' })
          : appIcon({ letter: icon });
  /** iOS notification. Required: title + body + (icon | app). time defaults to 'now'. icon: appIcon() html, an image URL, or 1-2 letters. */
  function notification({
    app,
    icon,
    time = "now",
    title,
    body,
    dark = false,
  } = {}) {
    need("title (sender or subject)", "notification", title);
    need("body (a real sentence)", "notification", body);
    need("icon or app", "notification", icon || app);
    return (
      '<div class="nu-notif' +
      (dark ? " dark" : "") +
      '">' +
      iconHtml(icon, app) +
      '<div class="nu-notif-main"><div class="nu-notif-top"><span class="nu-notif-title">' +
      esc(title) +
      '</span><span class="nu-notif-time">' +
      esc(time) +
      '</span></div><div class="nu-notif-body">' +
      esc(body) +
      "</div></div></div>"
    );
  }
  /** The same notification as a top banner over any screen: place it as the last child of .nu-screen. */
  const banner = (n) => '<div class="nu-banner">' + notification(n) + "</div>";
  /** Lock screen with real furniture: padlock, date, clock, notification stack (OLDEST first; the last one is the newest, at the bottom), torch + camera. */
  function lockScreen({
    time = "9:41",
    date = "",
    wallpaper = "",
    notifs = [],
    dark = true,
  } = {}) {
    const bg = wallpaper
      ? /^(#|rgb|linear|radial|conic)/.test(wallpaper)
        ? "background:" + wallpaper
        : "background-image:url('" + wallpaper + "')"
      : "background:linear-gradient(160deg,#2b2f3a,#0e0f13)";
    return (
      '<div class="nu-lock" style="' +
      bg +
      '"><div class="nu-lock-lock">' +
      GLYPH.lock +
      '</div><div class="nu-lock-date">' +
      esc(date) +
      '</div><div class="nu-lock-time">' +
      esc(time) +
      "</div>" +
      '<div class="nu-lock-stack">' +
      notifs.map((n) => notification(Object.assign({ dark }, n))).join("") +
      '</div><div class="nu-lock-btn l">' +
      GLYPH.torch +
      '</div><div class="nu-lock-btn r">' +
      GLYPH.camera +
      "</div></div>"
    );
  }
  /** Grouped list section: rows = [{icon (html or letter), color, title, sub, value}] */
  function list(rows, { header = "" } = {}) {
    const r = rows
      .map(
        (x) =>
          '<div class="nu-row">' +
          (x.icon && /^\s*</.test(x.icon)
            ? x.icon
            : appIcon({
                letter: x.icon || (x.title || "")[0],
                bg: x.color,
                size: 30,
              })) +
          '<div class="nu-row-main"><div class="nu-row-title">' +
          esc(x.title) +
          "</div>" +
          (x.sub ? '<div class="nu-row-sub">' + esc(x.sub) + "</div>" : "") +
          "</div>" +
          (x.value != null
            ? '<div class="nu-row-value">' + esc(x.value) + "</div>"
            : "") +
          "</div>",
      )
      .join("");
    return (
      (header ? '<div class="nu-section-h">' + esc(header) + "</div>" : "") +
      '<div class="nu-section">' +
      r +
      "</div>"
    );
  }
  /** Tab bar: tabs = [[glyphName | '<svg ...>', label], ...], on = selected index. Glyph names: see NativeUI.GLYPH. */
  const tabBar = (
    tabs = [
      ["home", "Today"],
      ["chart", "Trends"],
      ["list", "Bills"],
      ["person", "Me"],
    ],
    on = 0,
  ) =>
    '<div class="nu-tabbar">' +
    tabs
      .map(
        ([g, label], i) =>
          '<div class="nu-tab' +
          (i === on ? " on" : "") +
          '">' +
          (/^\s*</.test(g) ? g : GLYPH[g] || "") +
          "<span>" +
          esc(label) +
          "</span></div>",
      )
      .join("") +
    "</div>";
  /** Full app screen: large title + your hero block + sections + tab bar. */
  const appScreen = ({
    title = "",
    caption = "",
    hero = "",
    sections = "",
    tabs,
    tab = 0,
  } = {}) =>
    '<div class="nu-app"><div class="nu-nav"><div><div class="nu-caption">' +
    esc(caption) +
    '</div><div class="nu-large-title">' +
    esc(title) +
    "</div></div></div>" +
    hero +
    sections +
    "</div>" +
    tabBar(tabs, tab);

  /* ---------------- motion (frames; builds on the Motion film M) ---------------- */
  const one = (x) => (typeof x === "string" ? document.querySelector(x) : x);
  // layout position of el inside `stop`, from offset* (ignores transforms, so it is right even after M.enter set a start pose)
  const lay = (el, stop) => {
    let x = 0,
      y = 0,
      e = el;
    while (e && e !== stop) {
      x += e.offsetLeft;
      y += e.offsetTop;
      e = e.offsetParent;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  };
  const pt = (el) =>
    parseFloat(
      getComputedStyle(el.closest(".nu") || document.body).getPropertyValue(
        "--s",
      ),
    ) || 1;

  /** Notification arrival. dir 'up' (lock screen: the new one is the LAST in the stack and rolls up from below the screen) or 'down' (banner: drops from above the screen).
   *  `push`: siblings that make room (older notifications) travel the same distance with the same ease. Hard appearance at `at` (outside the glass, so nothing "fades in"),
   *  then measured softLand travel with a short smear. Returns the frame it lands on. */
  function arrive(M, el, o) {
    o = o || {};
    el = one(el);
    const at = o.at || 0,
      frames = o.frames == null ? 14 : o.frames,
      s = pt(el),
      gap = 8 * s,
      h = el.offsetHeight || 70 * s,
      scr = el.closest(".nu-screen") || el.parentNode;
    const L = lay(el, scr),
      up = (o.dir || "up") === "up",
      ease = o.ease || "softLand";
    const away = up ? scr.offsetHeight - L.y + 16 * s : -(L.y + h + 16 * s); // start fully outside the screen (clipped by .nu-screen overflow)
    M.enter(el, {
      at,
      frames,
      ease,
      from: { y: away },
      smear:
        o.smear === false
          ? null
          : {
              axis: "y",
              px: o.smearPx || Math.min(40, Math.abs(away) * 0.1),
              frames: 3,
            },
      label: o.label || "notification",
    });
    const room = up ? h + gap : -(h + gap);
    // siblings are already on screen: a plain y keyframe pair (M.enter would hide them before `at`)
    (o.push || []).forEach((sib) => M.kf(sib, "y", [[at, room], [at + frames, 0, ease]]));
    return at + frames;
  }

  /** Camera push-in on one element: zoom about the fixed point that lands `target` at the frame centre, so it is a straight push (no sliding), by M.camera on `world`
   *  (the transformed container; a .cam / .mwrap that holds the whole UI). fill = share of frame WIDTH the target ends up filling. Returns the end frame.
   *  The target's layout position is measured from offsets inside `world` (transform-free); `world` must be positioned (position:absolute/relative). */
  function macro(M, target, o) {
    o = o || {};
    target = one(target);
    const world = one(o.world),
      W = o.frameW || M.width,
      H = o.frameH || M.height;
    if (getComputedStyle(world).position === "static")
      world.style.position = "relative";
    const L = lay(target, world),
      k = (W * (o.fill == null ? 0.6 : o.fill)) / L.w,
      cx = L.x + L.w / 2,
      cy = L.y + L.h / 2;
    const tx = o.centerX == null ? W / 2 : o.centerX,
      ty = o.centerY == null ? H / 2 : o.centerY; // where on the frame the target should end up
    const p =
      Math.abs(k - 1) < 1e-3
        ? [cx, cy]
        : [(tx - k * cx) / (1 - k), (ty - k * cy) / (1 - k)]; // fixed point of the zoom
    const at = o.at || 0,
      frames = o.frames == null ? 26 : o.frames;
    M.camera(
      world,
      [
        [at, { scale: 1 }],
        [at + frames, { scale: k }, o.ease || "glide"],
      ],
      { origin: [p[0], p[1]] },
    );
    M.mark(at, "macro", o.label || "macro push-in");
    return at + frames;
  }

  root.NativeUI = {
    phone,
    statusBar,
    appIcon,
    notification,
    banner,
    lockScreen,
    list,
    tabBar,
    appScreen,
    arrive,
    macro,
    GLYPH,
  };
})(typeof window !== "undefined" ? window : globalThis);
