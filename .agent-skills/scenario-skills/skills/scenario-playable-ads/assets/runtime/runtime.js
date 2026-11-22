/* Playable ad runtime, shared by every game.
 *
 * Sections: config, network adapter, audio, scaling, tweens, input, effects, drawing helpers,
 * end card, main loop, boot. A game calls PA.boot(cfg, game); game provides init(), update(dt, realDt),
 * draw(ctx), and optionally onDown/onMove/onUp(x, y) and qa().
 *
 * Coordinates: the game draws in logical units. The play area is at least 720x1280 logical
 * (portrait); wider screens letterbox the play area to 9:16 and draw side panels with the logo and
 * a CTA. No network access, no emoji, sound only after the first touch.
 *
 * Helpers:
 *   PA.idle()                      never-autoplay states: wait (before the first touch), hint (2.5 s idle),
 *                                  timeout (10 s with no input: go to the end card)
 *   PA.audio.play(...)             a sound never repeats faster than cfg.soundGap s (default 0.3, ~3 a second)
 *   PA.audio.duck(level, sec)      duck the music under a payoff sound, then restore cfg.musicVolume
 *   PA.draw.hintHand(c, from, to)  the shared image hand looping a tap (no `to`) or a drag; it only points;
 *                                  {urgent: true} adds a "tap now" cue for moving or timed targets
 *   PA.draw.banner(c, t, sub, o)   result text on a backing plate
 *   PA.drawEndCard options         logoMaxH, heroH, tagline, art(c, layout)
 *   PA.toClient(x, y)              logical -> client px (for qa() targets)
 * The mute button is always drawn by the runtime (cfg.mute only moves it) and is never the first move.
 *
 * Network adapter: nine network targets (see its comment). It holds the game until the container says it is
 * viewable (MRAID, Mintegral gameStart), pauses when it stops being viewable, and PA.emit('endcard') /
 * PA.emit('replay') signal gameEnd / gameRetry to the container without a call in game.js.
 */
(function () {
  "use strict";
  const PA = (window.PA = {});

  // ---------- config ----------
  const QA = window.__QA || {};
  PA.cfg = null;
  PA.game = null;
  PA.time = 0; // game time, scaled by timeScale
  PA.realTime = 0;
  PA.timeScale = 1;
  PA.img = {};
  PA.events = window.__events = [];
  PA.emit = function (name, data) {
    PA.events.push({
      name: name,
      t: Math.round(PA.realTime * 100) / 100,
      data: data || null,
    });
    // the end card and Replay tell the network container by themselves, so a game needs no extra call
    if (PA.net) {
      if (name === "endcard") PA.net.gameEnd();
      else if (name === "replay") PA.net.gameRetry();
    }
  };

  // ---------- network adapter ----------
  // The game never talks to a network directly. PA.net.cta() is its only exit and the lifecycle hooks below are
  // its only signals. build.py puts window.NETWORK in the head. Per network (contracts and what is still
  // unconfirmed: the skill's references/networks.md):
  //   meta, moloco            CTA FbPlayableAd.onCTAClick()
  //   google                  CTA ExitApi.exit()                (exitapi.js is loaded by the head)
  //   applovin, unity, mraid  CTA mraid.open(store); wait for ready, hold until viewable, pause on
  //                           viewableChange(false) / exposureChange(0)
  //   mintegral               CTA install(); gameReady() once loaded, start on gameStart(), gameEnd() at the end
  //                           card, gameRetry() on Replay, pause on gameClose()
  //   liftoff                 CTA postMessage('download'); postMessage('complete') at the end card
  //   pangle                  CTA openAppStore()                (the playable SDK is loaded by the head)
  //   web                     local preview: a tap opens the store link in a new tab
  const NET = window.NETWORK || "web";
  // AppLovin and Unity publish "the first tap must not open the store"; the generic MRAID file follows them
  const FIRST_TAP_NO_STORE = { applovin: true, unity: true, mraid: true };
  let netEnded = false,
    netHold = false;
  function netPause(on) {
    if (netHold === on) return;
    netHold = on;
    PA.emit(on ? "netHold" : "netResume");
    syncAudio();
  }
  PA.net = {
    name: NET,
    store: function () {
      const ua = navigator.userAgent;
      const ios =
        /iPhone|iPad|iPod/.test(ua) ||
        (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      return ios ? PA.cfg.store.ios : PA.cfg.store.android;
    },
    cta: function () {
      if (FIRST_TAP_NO_STORE[NET] && PA.input.taps < 2) {
        PA.emit("ctaHeld", { network: NET });
        return;
      }
      PA.emit("cta", { network: NET });
      try {
        if ((NET === "meta" || NET === "moloco") && window.FbPlayableAd)
          return window.FbPlayableAd.onCTAClick();
        if (NET === "google" && window.ExitApi) return window.ExitApi.exit();
        if (NET === "mintegral" && typeof window.install === "function")
          return window.install();
        if (NET === "pangle" && typeof window.openAppStore === "function")
          return window.openAppStore();
        if (NET === "liftoff") {
          window.parent.postMessage("download", "*");
          if (window.parent !== window) return; // top level = local preview: also open the store link below
        }
        if (window.mraid && window.mraid.open)
          return window.mraid.open(PA.net.store());
      } catch (e) {
        /* fall through to the plain link */
      }
      // outside an ad container (local preview) a user tap opens the store in a new tab
      window.open(PA.net.store(), "_blank");
    },
    // end card shown: once per round (PA.emit('endcard') calls it, so a game does not have to)
    gameEnd: function () {
      if (netEnded) return;
      netEnded = true;
      PA.emit("gameEnd");
      try {
        if (typeof window.gameEnd === "function") window.gameEnd(); // Mintegral
        if (NET === "liftoff") window.parent.postMessage("complete", "*"); // Liftoff
      } catch (e) {
        /* optional hook */
      }
    },
    // Replay tapped (PA.emit('replay') calls it)
    gameRetry: function () {
      if (!netEnded) return;
      netEnded = false;
      PA.emit("gameRetry");
      try {
        if (typeof window.gameRetry === "function") window.gameRetry();
      } catch (e) {
        /* optional hook */
      }
    },
    // Calls go() when the container says the ad may run: nothing moves, no hook tween, no music clock before that.
    // Networks without a start signal (Meta, Google, Moloco, Pangle, Liftoff, local preview) start at once.
    whenViewable: function (go) {
      let started = false;
      const begin = function () {
        if (!started) {
          started = true;
          PA.emit("viewable");
          go();
        }
      };
      if (NET === "mintegral" && typeof window.gameReady === "function") {
        window.gameStart = function () {
          if (started) netPause(false);
          else begin();
        };
        window.gameClose = function () {
          if (started) netPause(true);
        };
        try {
          window.gameReady();
        } catch (e) {
          begin();
        }
        return;
      }
      const m = window.mraid;
      if (
        (NET === "applovin" || NET === "unity" || NET === "mraid") &&
        m &&
        typeof m.addEventListener === "function"
      ) {
        const on = function (v) {
          if (v) {
            if (started) netPause(false);
            else begin();
          } else if (started) netPause(true);
        };
        const watch = function () {
          try {
            m.addEventListener("viewableChange", on);
          } catch (e) {
            /* MRAID 2 only */
          }
          try {
            m.addEventListener("exposureChange", function (p) {
              on(Number(p) > 0);
            });
          } catch (e) {
            /* MRAID 3 only */
          }
          let v = true;
          try {
            v = m.isViewable();
          } catch (e) {
            /* assume viewable */
          }
          if (v) begin();
        };
        let st = "default";
        try {
          st = m.getState();
        } catch (e) {
          /* assume ready */
        }
        if (st === "loading") m.addEventListener("ready", watch);
        else watch();
        return;
      }
      begin();
    },
  };

  // ---------- audio ----------
  function b64ToBuffer(uri) {
    const bin = atob(uri.slice(uri.indexOf(",") + 1));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }
  const audio = (PA.audio = {
    ctx: null,
    master: null,
    bufs: {},
    last: {},
    music: null,
    musicGain: null,
    wantMusic: false,
    muted: false,
    // the shared mute button flips this; the master gain carries it so every sound and the music follow
    setMuted: function (m) {
      audio.muted = m;
      if (audio.master)
        audio.master.gain.setTargetAtTime(
          m ? 0 : 1,
          audio.ctx.currentTime,
          0.02,
        );
      PA.emit("mute", { muted: m });
    },
    unlock: function () {
      if (audio.ctx) {
        if (audio.ctx.state === "suspended") audio.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.connect(audio.ctx.destination);
      audio.master.gain.value = audio.muted ? 0 : 1;
      const sounds = PA.cfg.sounds || {};
      Object.keys(sounds).forEach(function (k) {
        audio.ctx.decodeAudioData(
          b64ToBuffer(sounds[k]),
          function (b) {
            audio.bufs[k] = b;
            if (k === PA.cfg.music && audio.wantMusic) audio.startMusic();
          },
          function () {
            /* a bad clip only loses its sound */
          },
        );
      });
    },
    play: function (name, vol, rate, minGap) {
      const b = audio.bufs[name];
      if (!b || audio.ctx.state !== "running") return;
      const now = audio.ctx.currentTime;
      // no sound repeats faster than about 3 times a second (cfg.soundGap, default 0.3 s): rapid repeats grate
      const gap = Math.max(
        minGap || 0,
        PA.cfg.soundGap == null ? 0.3 : PA.cfg.soundGap,
      );
      if (gap && audio.last[name] != null && now - audio.last[name] < gap)
        return;
      audio.last[name] = now;
      const src = audio.ctx.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = rate || 1;
      const g = audio.ctx.createGain();
      g.gain.value = vol == null ? 1 : vol;
      src.connect(g);
      g.connect(audio.master);
      src.start();
    },
    startMusic: function () {
      audio.wantMusic = true;
      const b = audio.ctx && audio.bufs[PA.cfg.music];
      if (!b || audio.music) return;
      audio.music = audio.ctx.createBufferSource();
      audio.music.buffer = b;
      audio.music.loop = true;
      audio.musicGain = audio.ctx.createGain();
      audio.musicGain.gain.value = PA.cfg.musicVolume || 0.4;
      audio.music.connect(audio.musicGain);
      audio.musicGain.connect(audio.master);
      audio.music.start();
    },
    musicTo: function (v, sec) {
      if (!audio.musicGain) return;
      const t = audio.ctx.currentTime;
      audio.musicGain.gain.cancelScheduledValues(t);
      audio.musicGain.gain.setValueAtTime(audio.musicGain.gain.value, t);
      audio.musicGain.gain.linearRampToValueAtTime(v, t + (sec || 0.3));
    },
    // duck the music under a payoff sound, then bring it back to cfg.musicVolume; overlapping ducks extend
    duckUntil: 0,
    duck: function (level, sec) {
      if (!audio.musicGain) return;
      audio.musicTo(level == null ? 0.12 : level, 0.08);
      const until = PA.realTime + (sec || 1);
      if (until <= audio.duckUntil) return;
      audio.duckUntil = until;
      PA.after(
        sec || 1,
        function () {
          if (PA.realTime + 1e-3 >= audio.duckUntil)
            audio.musicTo(PA.cfg.musicVolume || 0.4, 0.4);
        },
        true,
      );
    },
  });

  // ---------- scaling ----------
  let canvas, ctx;
  const view = (PA.view = {
    W: 0,
    H: 0,
    dpr: 1,
    s: 1,
    gx: 0,
    gy: 0,
    gw: 0,
    gh: 0,
    w: 720,
    h: 1280,
    letterbox: false,
  });
  let sideCache = null;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth,
      H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    let gw = W,
      gh = H;
    view.letterbox = W / H > 0.75;
    if (view.letterbox) gw = Math.round((H * 9) / 16);
    const s = gw / gh < 720 / 1280 ? gw / 720 : gh / 1280;
    Object.assign(view, {
      W: W,
      H: H,
      dpr: dpr,
      s: s,
      gx: Math.round((W - gw) / 2),
      gy: 0,
      gw: gw,
      gh: gh,
      w: gw / s,
      h: gh / s,
    });
    sideCache = null;
    if (PA.game && PA.game.resize) PA.game.resize();
  }
  PA.toLogical = function (cx, cy) {
    return { x: (cx - view.gx) / view.s, y: (cy - view.gy) / view.s };
  };
  PA.toClient = function (x, y) {
    return { x: view.gx + x * view.s, y: view.gy + y * view.s };
  };

  // ---------- tweens and timers ----------
  const tweens = [];
  PA.ease = {
    linear: function (t) {
      return t;
    },
    outQuad: function (t) {
      return t * (2 - t);
    },
    inQuad: function (t) {
      return t * t;
    },
    inOutQuad: function (t) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    },
    outCubic: function (t) {
      return 1 - Math.pow(1 - t, 3);
    },
    outBack: function (t) {
      const c = 1.70158;
      return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    },
    outElastic: function (t) {
      return t === 0 || t === 1
        ? t
        : Math.pow(2, -10 * t) *
            Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) +
            1;
    },
  };
  // real: run on unscaled time (UI during slow-mo)
  PA.tween = function (obj, to, dur, opts) {
    opts = opts || {};
    const tw = {
      obj: obj,
      to: to,
      from: {},
      dur: dur,
      t: -(opts.delay || 0),
      ease: PA.ease[opts.ease || "outQuad"],
      done: opts.done,
      real: !!opts.real,
    };
    tweens.push(tw);
    return tw;
  };
  PA.after = function (sec, fn, real) {
    return PA.tween({}, {}, sec, { done: fn, real: real });
  };
  // stop running tweens on obj (optionally only those touching prop), so a newer change wins
  // drop every pending tween and PA.after timer: call it when a game restarts (Replay)
  PA.clearTweens = function () {
    tweens.length = 0;
    PA.setTimeScale(1);
    audio.musicTo(PA.cfg.musicVolume || 0.4, 0.2); // undo any ducking left by the last round
  };
  PA.killTweens = function (obj, prop) {
    for (let i = tweens.length - 1; i >= 0; i--)
      if (tweens[i].obj === obj && (!prop || prop in tweens[i].to))
        tweens.splice(i, 1);
  };
  // slow-mo helper: always use this instead of tweening PA.timeScale directly
  PA.setTimeScale = function (v, dur) {
    PA.killTweens(PA, "timeScale");
    if (dur) PA.tween(PA, { timeScale: v }, dur, { real: true });
    else PA.timeScale = v;
  };
  function updateTweens(gd, rd) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += tw.real ? rd : gd;
      if (tw.t < 0) continue;
      for (const k in tw.to) if (!(k in tw.from)) tw.from[k] = tw.obj[k]; // start values are read when the delay ends
      const p = Math.min(1, tw.t / tw.dur),
        e = tw.ease(p);
      for (const k in tw.to)
        tw.obj[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
      if (p >= 1) {
        tweens.splice(i, 1);
        if (tw.done) tw.done();
      }
    }
  }

  // ---------- input ----------
  const input = (PA.input = {
    down: false,
    x: 0,
    y: 0,
    sx: 0,
    sy: 0,
    idle: 0,
    touched: false,
    taps: 0,
    id: null,
  });
  let hits = [],
    hitsNext = [];
  // games register clickable rects while drawing; hit-testing uses the last drawn frame
  PA.hit = function (x, y, w, h, fn) {
    hitsNext.push({ x: x, y: y, w: w, h: h, fn: fn });
  };
  function onDown(e) {
    e.preventDefault();
    // before the container shows the ad, or while it hides it, a tap must not start sound or play
    if (!live || netHold || paused) return;
    audio.unlock();
    // the mute button is a control, not a move: it neither starts the game nor the music
    if (
      muteHit &&
      !(
        view.letterbox &&
        (e.clientX < view.gx || e.clientX > view.gx + view.gw)
      )
    ) {
      const q = PA.toLogical(e.clientX, e.clientY);
      if (
        q.x >= muteHit.x &&
        q.x <= muteHit.x + muteHit.w &&
        q.y >= muteHit.y &&
        q.y <= muteHit.y + muteHit.h
      ) {
        input.idle = 0;
        muteHit.fn();
        return;
      }
    }
    if (PA.cfg.music) audio.startMusic(); // any first tap starts the music, buttons included
    input.taps++; // the mute button never counts
    if (!input.touched) {
      input.touched = true;
      PA.emit("firstTouch");
    }
    input.idle = 0;
    if (
      view.letterbox &&
      (e.clientX < view.gx || e.clientX > view.gx + view.gw)
    ) {
      if (sideCtaHit(e.clientX, e.clientY)) PA.net.cta();
      return;
    }
    const p = PA.toLogical(e.clientX, e.clientY);
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) {
        h.fn(p.x, p.y);
        return;
      }
    }
    if (input.id !== null) return;
    input.id = e.pointerId;
    input.down = true;
    input.x = input.sx = p.x;
    input.y = input.sy = p.y;
    if (PA.game.onDown) PA.game.onDown(p.x, p.y);
  }
  function onMove(e) {
    if (e.pointerId !== input.id) return;
    const p = PA.toLogical(e.clientX, e.clientY);
    input.x = p.x;
    input.y = p.y;
    input.idle = 0;
    if (PA.game.onMove) PA.game.onMove(p.x, p.y);
  }
  function onUp(e) {
    if (e.pointerId !== input.id) return;
    input.id = null;
    input.down = false;
    input.idle = 0;
    if (PA.game.onUp) PA.game.onUp(input.x, input.y);
  }

  // never-autoplay states, the same for every game:
  //   wait:    no touch yet. Hold the gameplay clock, keep the screen alive, loop the hand on a real good move
  //   hint:    touched, finger up, 2.5 s without input: the hand points at the next good move (it never moves it)
  //   timeout: 10 s without any input (before or after the first touch): go to the end card
  // Nothing ever plays a move for the player.
  PA.HINT_AFTER = 2.5;
  PA.IDLE_TIMEOUT = 10;
  PA.idle = function () {
    const i = input,
      free = !i.down;
    return {
      wait: !i.touched,
      hint: free && (!i.touched || i.idle >= PA.HINT_AFTER),
      timeout: free && i.idle >= PA.IDLE_TIMEOUT,
    };
  };

  // ---------- effects ----------
  PA.makeFx = function () {
    const fx = { parts: [], texts: [] };
    fx.burst = function (x, y, o) {
      o = o || {};
      const n = o.n || 12;
      for (let i = 0; i < n && fx.parts.length < 900; i++) {
        const a = Math.random() * Math.PI * 2,
          sp = (o.speed || 300) * (0.35 + Math.random() * 0.75);
        fx.parts.push({
          x: x,
          y: y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (o.lift || 0),
          g: o.gravity || 0,
          life: (o.life || 0.6) * (0.7 + Math.random() * 0.6),
          t: 0,
          size: (o.size || 9) * (0.6 + Math.random() * 0.8),
          color: o.colors
            ? o.colors[(Math.random() * o.colors.length) | 0]
            : "#fff",
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 14,
          shape: o.shape || "rect",
          drag: o.drag || 2.5,
          add: !!o.additive,
        });
      }
    };
    fx.text = function (x, y, str, o) {
      o = o || {};
      fx.texts.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y,
        str: str,
        t: 0,
        life: o.life || 0.7,
        size: o.size || 30,
        color: o.color || "#fff",
        rise: o.rise || 70,
      });
      if (fx.texts.length > 60) fx.texts.shift();
    };
    fx.update = function (dt) {
      for (let i = fx.parts.length - 1; i >= 0; i--) {
        const p = fx.parts[i];
        p.t += dt;
        if (p.t >= p.life) {
          fx.parts.splice(i, 1);
          continue;
        }
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy = p.vy * k + p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
      for (let i = fx.texts.length - 1; i >= 0; i--) {
        const t = fx.texts[i];
        t.t += dt;
        if (t.t >= t.life) fx.texts.splice(i, 1);
      }
    };
    fx.draw = function (c) {
      for (const p of fx.parts) {
        const a = 1 - p.t / p.life;
        c.globalAlpha = Math.min(1, a * 1.6);
        c.globalCompositeOperation = p.add ? "lighter" : "source-over";
        c.fillStyle = p.color;
        if (p.shape === "circle") {
          c.beginPath();
          c.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, 7);
          c.fill();
        } else if (p.shape === "spark") {
          // four-point star
          const s = p.size * (0.5 + a * 0.5);
          c.beginPath();
          c.moveTo(p.x, p.y - s);
          c.lineTo(p.x + s * 0.25, p.y - s * 0.25);
          c.lineTo(p.x + s, p.y);
          c.lineTo(p.x + s * 0.25, p.y + s * 0.25);
          c.lineTo(p.x, p.y + s);
          c.lineTo(p.x - s * 0.25, p.y + s * 0.25);
          c.lineTo(p.x - s, p.y);
          c.lineTo(p.x - s * 0.25, p.y - s * 0.25);
          c.closePath();
          c.fill();
        } else {
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          c.restore();
        }
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
      for (const t of fx.texts) {
        const p = t.t / t.life,
          pop =
            p < 0.15 ? 0.6 + (p / 0.15) * 0.6 : 1.2 - Math.min(0.2, p - 0.15);
        c.globalAlpha = p > 0.7 ? (1 - p) / 0.3 : 1;
        PA.draw.text(c, t.str, t.x, t.y - t.rise * PA.ease.outQuad(p), {
          size: t.size * pop,
          color: t.color,
        });
      }
      c.globalAlpha = 1;
    };
    return fx;
  };
  const shake = { mag: 0, t: 0, dur: 0 },
    flash = { a: 0, color: "#fff" };
  PA.shake = function (mag, dur) {
    if (mag >= shake.mag * (1 - shake.t / (shake.dur || 1))) {
      shake.mag = mag;
      shake.t = 0;
      shake.dur = dur;
    }
  };
  PA.flash = function (color, a, dur) {
    flash.color = color;
    flash.a = a;
    PA.tween(flash, { a: 0 }, dur, { real: true });
  };
  PA.shakeOffset = function () {
    if (shake.t >= shake.dur) return { x: 0, y: 0 };
    const m = shake.mag * (1 - shake.t / shake.dur);
    return {
      x: (Math.random() - 0.5) * 2 * m,
      y: (Math.random() - 0.5) * 2 * m,
    };
  };

  // ---------- drawing helpers ----------
  const draw = (PA.draw = {});
  draw.font = function (size) {
    return (
      "700 " +
      Math.round(size) +
      "px " +
      (PA.cfg.font || "sans-serif") +
      ", sans-serif"
    );
  };
  draw.rrect = function (c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };
  // bold text with a dark outline, the house style of mobile game HUDs
  draw.text = function (c, str, x, y, o) {
    o = o || {};
    c.font = draw.font(o.size || 32);
    c.textAlign = o.align || "center";
    c.textBaseline = o.baseline || "middle";
    c.lineJoin = "round";
    if (o.stroke !== false) {
      c.strokeStyle = o.stroke || PA.cfg.ink || "#13244d";
      c.lineWidth = o.sw || Math.max(3, (o.size || 32) * 0.18);
      c.strokeText(str, x, y);
    }
    c.fillStyle = o.color || "#fff";
    c.fillText(str, x, y);
  };
  // chunky game button; returns nothing, registers its hit area
  draw.button = function (c, x, y, w, h, label, fn, o) {
    o = o || {};
    const top = o.top || "#ffe066",
      bot = o.bot || "#ff8a1f",
      ink = PA.cfg.ink || "#13244d";
    c.save();
    c.translate(x + w / 2, y + h / 2);
    c.scale(o.scale || 1, o.scale || 1);
    c.translate(-w / 2, -h / 2);
    draw.rrect(c, 0, 6, w, h, h * 0.32);
    c.fillStyle = "rgba(10,20,50,0.35)";
    c.fill();
    draw.rrect(c, 0, 0, w, h, h * 0.32);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = Math.max(3, h * 0.07);
    c.strokeStyle = ink;
    c.stroke();
    draw.rrect(c, h * 0.18, h * 0.1, w - h * 0.36, h * 0.3, h * 0.15);
    c.fillStyle = "rgba(255,255,255,0.35)";
    c.fill();
    draw.text(c, label, w / 2, h * 0.53, {
      size: o.size || h * 0.46,
      color: "#fff",
      stroke: ink,
    });
    c.restore();
    if (fn) PA.hit(x, y, w, h, fn);
  };
  // tutorial hand, fingertip at (x, y): the project's assets/web/hand.webp when it has one, else a vector hand
  const HAND = { src: "{{hand.webp}}", tipX: 0.276, tipY: 0.007, h: 118 };
  draw.hand = function (c, x, y, scale, press) {
    const im = PA.img.__hand;
    if (press) {
      c.save();
      c.globalAlpha = 0.55;
      c.strokeStyle = "#fff";
      c.lineWidth = 5;
      c.beginPath();
      c.arc(x, y, 24, 0, 7);
      c.stroke();
      c.restore();
    }
    c.save();
    c.translate(x, y);
    c.scale(scale || 1, scale || 1);
    c.rotate(-0.25);
    if (press) {
      c.translate(0, 4);
      c.scale(0.92, 0.92);
    }
    if (im && im.width) {
      const h = HAND.h,
        w = (h * im.width) / im.height;
      c.shadowColor = "rgba(10,20,50,0.35)";
      c.shadowBlur = 10;
      c.shadowOffsetX = 3;
      c.shadowOffsetY = 6;
      c.drawImage(im, -w * HAND.tipX, -h * HAND.tipY, w, h);
    } else {
      c.lineWidth = 4;
      c.strokeStyle = PA.cfg.ink || "#13244d";
      c.fillStyle = "#fff";
      draw.rrect(c, -10, 28, 50, 46, 16);
      c.fill();
      c.stroke();
      draw.rrect(c, -10, 0, 20, 48, 10);
      c.fill();
      c.stroke();
    }
    c.restore();
  };
  // hint hand on a loop: a tap at `from`, or a drag from `from` to `to` ({x, y} logical). It only points.
  // o.urgent: a "tap now" cue for a moving or timed target (an air jump, a closing gap): faster loop, bigger hand,
  // and an expanding ring at the spot
  draw.hintHand = function (c, from, to, o) {
    o = o || {};
    const per = o.period || (o.urgent ? 0.6 : 1.4),
      p = (PA.realTime % per) / per,
      sc = (o.scale || 1) * (o.urgent ? 1.15 : 1);
    if (o.urgent) {
      const at = to || from,
        k = (PA.realTime * 2.2) % 1;
      c.save();
      c.globalAlpha = 0.8 * (1 - k);
      c.strokeStyle = o.ringColor || "#fff36a";
      c.lineWidth = 6;
      c.beginPath();
      c.arc(at.x, at.y, 26 + k * 46, 0, 7);
      c.stroke();
      c.restore();
    }
    if (!to) {
      const press = p > 0.55 && p < 0.85;
      draw.hand(
        c,
        from.x,
        from.y - (press ? 0 : Math.sin(p * Math.PI) * 16),
        sc,
        press,
      );
      return;
    }
    // press (0-0.2), travel (0.2-0.75), hold at the target (0.75-1)
    const k = p < 0.2 ? 0 : p > 0.75 ? 1 : PA.ease.inOutQuad((p - 0.2) / 0.55);
    c.save();
    c.globalAlpha = 0.35;
    c.strokeStyle = "#fff";
    c.lineWidth = 6;
    c.setLineDash([14, 12]);
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.lineTo(to.x, to.y);
    c.stroke();
    c.restore();
    draw.hand(
      c,
      from.x + (to.x - from.x) * k,
      from.y + (to.y - from.y) * k,
      sc,
      p > 0.1 && p < 0.8,
    );
  };
  // result text on a backing plate, so it reads over any busy board. o: { y, color, subColor, w, plate, size }
  draw.banner = function (c, title, sub, o) {
    o = o || {};
    const w = o.w || Math.min(view.w - 60, 640),
      h = sub ? 190 : 130,
      x = view.w / 2 - w / 2,
      y = (o.y || view.h * 0.2) - h / 2;
    c.save();
    draw.rrect(c, x, y + 8, w, h, 34);
    c.fillStyle = "rgba(10,20,50,0.35)";
    c.fill();
    draw.rrect(c, x, y, w, h, 34);
    c.fillStyle = o.plate || "rgba(19,36,77,0.86)";
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = "rgba(255,255,255,0.55)";
    c.stroke();
    draw.text(c, title, view.w / 2, y + (sub ? 70 : h / 2), {
      size: o.size || 68,
      color: o.color || "#ffd23a",
    });
    if (sub)
      draw.text(c, sub, view.w / 2, y + 140, {
        size: 38,
        color: o.subColor || "#fff",
      });
    c.restore();
  };
  // small always-visible CTA pill
  draw.ctaPill = function (c, x, y, w, h, label) {
    const pulse = 1 + Math.sin(PA.realTime * 5) * 0.04;
    PA.pillRect = {
      x: view.gx + (x + w / 2) * view.s,
      y: view.gy + (y + h / 2) * view.s,
    };
    draw.button(
      c,
      x,
      y,
      w,
      h,
      label || PA.cfg.ctaLabel || "PLAY FREE",
      function () {
        PA.net.cta();
      },
      { scale: pulse, size: h * 0.5 },
    );
  };

  // ---------- end card ----------
  // o: { logo, hero, title, titleColor, tagline, stats: [{label, value}], replay: fn,
  //      logoMaxH (logical px, default 0.2 * height: square logos no longer run into the title),
  //      heroH (logical px, default 250, 220 with a tagline),
  //      art: function (c, layout) drawn instead of the hero, layout = { x, y, w, h } of the hero slot }
  const endFx = { t: 0 };
  PA.drawEndCard = function (c, o) {
    const w = view.w,
      h = view.h,
      t = (endFx.t += 1 / 60);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(20,50,120,0.78)");
    g.addColorStop(1, "rgba(10,25,70,0.9)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // rotating light rays behind the hero keep the card alive
    c.save();
    c.translate(w / 2, h * 0.47);
    c.rotate(t * 0.25);
    c.globalAlpha = 0.16;
    c.fillStyle = "#fff";
    for (let i = 0; i < 12; i++) {
      c.rotate(Math.PI / 6);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(-60, -700);
      c.lineTo(60, -700);
      c.closePath();
      c.fill();
    }
    c.restore();
    const logo = PA.img[o.logo];
    if (logo) {
      let lw = Math.min(w * 0.68, 480),
        lh = (lw * logo.height) / logo.width;
      const maxH = o.logoMaxH || h * 0.2;
      if (lh > maxH) {
        lw *= maxH / lh;
        lh = maxH;
      }
      c.drawImage(logo, w / 2 - lw / 2, h * 0.05 + Math.sin(t * 2) * 6, lw, lh);
    }
    const slot = {
      x: w / 2 - 200,
      y: h * (o.tagline ? 0.44 : 0.41),
      w: 400,
      h: o.heroH || (o.tagline ? 220 : 250),
    };
    const hero = PA.img[o.hero];
    if (o.art) o.art(c, slot);
    else if (hero) {
      const hh = slot.h,
        hw = (hh * hero.width) / hero.height;
      c.drawImage(hero, w / 2 - hw / 2, slot.y + Math.sin(t * 3) * 8, hw, hh);
    }
    if (o.title)
      draw.text(c, o.title, w / 2, h * 0.375, {
        size: 56,
        color: o.titleColor || "#ffd23a",
      });
    if (o.tagline)
      draw.text(c, o.tagline, w / 2, h * 0.375 + 52, {
        size: 30,
        color: "#fff",
      });
    const stats = o.stats || [];
    const bw = Math.min(w - 80, 600),
      bx = w / 2 - bw / 2,
      by = h * 0.625;
    if (stats.length) {
      draw.rrect(c, bx, by, bw, 120, 26);
      c.fillStyle = "rgba(255,255,255,0.14)";
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.4)";
      c.lineWidth = 3;
      c.stroke();
      stats.forEach(function (s, i) {
        const cx = bx + (bw * (i + 0.5)) / stats.length;
        draw.text(c, s.value, cx, by + 50, { size: 46, color: "#fff" });
        draw.text(c, s.label, cx, by + 92, {
          size: 22,
          color: "#9fe6ff",
          stroke: false,
        });
      });
    }
    const pulse = 1 + Math.sin(t * 6) * 0.05;
    draw.button(
      c,
      w / 2 - 210,
      h * 0.76,
      420,
      116,
      PA.cfg.ctaLabel || "PLAY FREE",
      function () {
        PA.net.cta();
      },
      { scale: pulse, size: 52 },
    );
    // the logo and hero are part of the CTA too: most taps on an end card are meant as installs
    PA.hit(0, 0, w, h * 0.6, function () {
      PA.net.cta();
    });
    if (o.replay) {
      draw.text(c, "Replay", w / 2, h * 0.9, {
        size: 30,
        color: "rgba(255,255,255,0.85)",
        stroke: false,
      });
      PA.hit(w / 2 - 90, h * 0.9 - 30, 180, 60, o.replay);
      PA.replayRect = {
        x: view.gx + (w / 2) * view.s,
        y: view.gy + h * 0.9 * view.s,
      }; // for QA
    }
  };
  PA.resetEndCard = function () {
    endFx.t = 0;
  };

  // ---------- mute button (every game) ----------
  // a small round speaker button that every playable has (it cannot be turned off), bottom-left by default;
  // cfg.mute moves it: 'bl' | 'br' | 'tl' | 'tr' | {x, y} (logical center, negative = from the right/bottom edge)
  let muteHit = null;
  function drawMute(c) {
    const pos = PA.cfg.mute || "bl";
    muteHit = null;
    const r = 26,
      m = 16;
    let x, y;
    if (typeof pos === "object") {
      x = pos.x < 0 ? view.w + pos.x : pos.x;
      y = pos.y < 0 ? view.h + pos.y : pos.y;
    } else {
      x = pos[1] === "l" ? m + r : view.w - m - r;
      y = pos[0] === "t" ? m + r + 70 : view.h - m - r;
    }
    c.save();
    c.globalAlpha = 0.92;
    c.fillStyle = "rgba(15,30,70,0.55)";
    c.beginPath();
    c.arc(x, y, r, 0, 7);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.85)";
    c.lineWidth = 3;
    c.stroke();
    c.fillStyle = "#fff";
    c.beginPath(); // speaker body
    c.moveTo(x - 13, y - 6);
    c.lineTo(x - 6, y - 6);
    c.lineTo(x + 3, y - 13);
    c.lineTo(x + 3, y + 13);
    c.lineTo(x - 6, y + 6);
    c.lineTo(x - 13, y + 6);
    c.closePath();
    c.fill();
    c.strokeStyle = "#fff";
    c.lineWidth = 3;
    c.lineCap = "round";
    if (audio.muted) {
      c.beginPath();
      c.moveTo(x + 8, y - 7);
      c.lineTo(x + 16, y + 7);
      c.moveTo(x + 16, y - 7);
      c.lineTo(x + 8, y + 7);
      c.stroke();
    } else {
      c.beginPath();
      c.arc(x + 4, y, 8, -0.8, 0.8);
      c.stroke();
      c.beginPath();
      c.arc(x + 4, y, 14, -0.8, 0.8);
      c.stroke();
    }
    c.restore();
    PA.muteRect = { x: view.gx + x * view.s, y: view.gy + y * view.s }; // for QA
    muteHit = {
      x: x - r - 6,
      y: y - r - 6,
      w: (r + 6) * 2,
      h: (r + 6) * 2,
      fn: function () {
        audio.setMuted(!audio.muted);
      },
    };
  }

  // ---------- side panels (letterbox) ----------
  let sideBtn = null;
  function sideCtaHit(x, y) {
    return (
      sideBtn &&
      x >= sideBtn.x &&
      x <= sideBtn.x + sideBtn.w &&
      y >= sideBtn.y &&
      y <= sideBtn.y + sideBtn.h
    );
  }
  function drawSides() {
    if (!view.letterbox) {
      sideBtn = null;
      return;
    }
    const W = view.W,
      H = view.H,
      d = view.dpr;
    if (!sideCache) {
      sideCache = document.createElement("canvas");
      sideCache.width = canvas.width;
      sideCache.height = canvas.height;
      const c = sideCache.getContext("2d");
      const bg = PA.img[PA.cfg.sideBg];
      if (bg) {
        // blur by drawing tiny and scaling up: works everywhere, unlike ctx.filter
        const sc = Math.max(W / bg.width, H / bg.height) * d;
        const tiny = document.createElement("canvas");
        tiny.width = Math.max(8, Math.round(canvas.width / 24));
        tiny.height = Math.max(8, Math.round(canvas.height / 24));
        tiny
          .getContext("2d")
          .drawImage(
            bg,
            (tiny.width - (bg.width * sc) / 24) / 2,
            (tiny.height - (bg.height * sc) / 24) / 2,
            (bg.width * sc) / 24,
            (bg.height * sc) / 24,
          );
        c.imageSmoothingQuality = "high";
        c.drawImage(tiny, 0, 0, canvas.width, canvas.height);
      }
      c.fillStyle = PA.cfg.sideTint || "rgba(20,50,120,0.3)";
      c.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(sideCache, 0, 0);
    const pw = view.gx; // panel width in css px
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const logo = PA.img[PA.cfg.logo];
    if (logo && pw > 120) {
      const lw = Math.min(pw * 0.8, 420),
        lh = (lw * logo.height) / logo.width;
      ctx.drawImage(
        logo,
        pw / 2 - lw / 2,
        H / 2 - lh / 2 + Math.sin(PA.realTime * 2) * 5,
        lw,
        lh,
      );
    }
    if (pw > 120) {
      const bw = Math.min(pw * 0.7, 320),
        bh = bw * 0.3,
        bx = W - pw / 2 - bw / 2,
        by = H / 2 - bh / 2;
      sideBtn = { x: bx, y: by, w: bw, h: bh };
      draw.button(ctx, bx, by, bw, bh, PA.cfg.ctaLabel || "PLAY FREE", null, {
        scale: 1 + Math.sin(PA.realTime * 5) * 0.04,
      });
    }
  }

  // ---------- main loop ----------
  let last = 0,
    paused = false,
    live = false; // set once the container says the ad is viewable
  function frame(now) {
    requestAnimationFrame(frame);
    if (paused || netHold || QA.pause) {
      last = now;
      return;
    } // QA.pause freezes the game while a screenshot is taken
    let dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
    last = now;
    dt *= QA.speed || 1;
    // fixed small steps keep fast-forwarded QA runs identical to real play
    while (dt > 1e-6) {
      const d = Math.min(1 / 60, dt);
      dt -= d;
      PA.realTime += d;
      const gd = d * PA.timeScale;
      PA.time += gd;
      input.idle += d;
      shake.t += d;
      updateTweens(gd, d);
      PA.game.update(gd, d);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PA.cfg.clearColor || "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawSides();
    ctx.save();
    const d = view.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.beginPath();
    ctx.rect(view.gx, view.gy, view.gw, view.gh);
    ctx.clip();
    ctx.setTransform(d * view.s, 0, 0, d * view.s, d * view.gx, d * view.gy);
    hitsNext = [];
    PA.game.draw(ctx);
    drawMute(ctx);
    if (flash.a > 0.01) {
      ctx.globalAlpha = flash.a;
      ctx.fillStyle = flash.color;
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.globalAlpha = 1;
    }
    hits = hitsNext;
    ctx.restore();
  }
  // a hidden page and a container hold are separate flags: sound resumes only when both are clear
  function syncAudio() {
    if (!audio.ctx) return;
    if (paused || netHold) audio.ctx.suspend();
    else audio.ctx.resume();
  }
  document.addEventListener("visibilitychange", function () {
    paused = document.hidden;
    syncAudio();
  });

  // ---------- boot ----------
  PA.boot = function (cfg, game) {
    PA.cfg = cfg;
    PA.game = game;
    canvas = document.getElementById("c");
    ctx = canvas.getContext("2d");
    if (HAND.src.indexOf("data:") === 0) {
      const hi = new Image();
      hi.src = HAND.src;
      PA.img.__hand = hi;
    }
    const jobs = Object.keys(cfg.images || {}).map(function (k) {
      return new Promise(function (res) {
        const im = new Image();
        im.onload = im.onerror = function () {
          PA.img[k] = im;
          res();
        };
        im.src = cfg.images[k];
      });
    });
    if (cfg.fontData && window.FontFace) {
      const ff = new FontFace(cfg.font, "url(" + cfg.fontData + ")", {
        weight: "700",
      });
      jobs.push(
        ff.load().then(
          function (f) {
            document.fonts.add(f);
          },
          function () {
            /* fall back to sans-serif */
          },
        ),
      );
    }
    Promise.all(jobs).then(function () {
      resize();
      window.addEventListener("resize", resize);
      canvas.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      game.init();
      window.__qa = function () {
        return game.qa ? game.qa() : {};
      };
      PA.emit("start");
      PA.net.whenViewable(function () {
        live = true;
        requestAnimationFrame(frame);
      });
    });
  };
})();
