/* Playable skeleton: one verb (tap the rising pieces), a payoff, a win or an honest near-fail, end card.
 * Replace the game section with your genre; keep the structure:
 *   config -> reset -> input -> update (wait / play / result) -> draw -> qa() -> boot.
 * Never autoplay: before the first touch the game waits, alive (clock held, pieces bob, the target
 * glows, the hand loops a real tap). Nothing ever plays a move for the player. The ad ends by the goal,
 * the round timer (ROUND_S after the first touch), or 10 s without input straight to the end card.
 * Runs on runtime/runtime.js (window.PA).
 */
(function () {
  "use strict";
  const D = PA.draw;
  const INK = "#13244d";
  const GOAL = 40; // pops to win
  const ROUND_S = 40; // time cap after the first touch; a good run reaches the goal first, after about 32 s of play
  const SPAWN_S = 0.9; // seconds between pieces: the supply paces the goal, so a good run shows its end card about 35 s after load
  const PAYOFF_AT = 10; // the genre's signature moment fires at this score
  const CONFETTI = [
    "#ff4f6d",
    "#ffd23a",
    "#3fd1ff",
    "#7cff6b",
    "#ffffff",
    "#b06bff",
  ];

  let G;
  const fx = PA.makeFx(),
    ufx = PA.makeFx();

  function reset() {
    G = {
      started: false,
      t: 0,
      phase: "wait",
      score: 0,
      pieces: [],
      spawnT: 0,
      target: null,
      idleT: 0,
      hookA: 0,
      hookS: 0,
      hudA: 0,
      banner: null,
      result: null,
      payoff: false,
    };
    fx.parts.length = fx.texts.length = 0;
    ufx.parts.length = ufx.texts.length = 0;
    for (let i = 0; i < 5; i++) spawn(470 + i * 160);
    // the hook pops in (visible motion in the first second) and stays until the first touch
    PA.tween(G, { hookA: 1, hookS: 1 }, 0.45, {
      ease: "outBack",
      delay: 0.1,
      real: true,
    });
    PA.resetEndCard();
  }
  function start() {
    // the first touch starts the gameplay clock; before it nothing advances
    G.started = true;
    G.phase = "play";
    PA.tween(G, { hookA: 0 }, 0.3, { real: true });
    PA.tween(G, { hudA: 1 }, 0.3, { real: true });
    PA.emit("play");
  }

  // ---------- game ----------
  function spawn(y) {
    const v = PA.view;
    G.pieces.push({
      x: 110 + Math.random() * (v.w - 220),
      y: y || v.h + 80,
      vy: 170 + Math.random() * 70,
      ph: Math.random() * 6,
      r: 66,
      kind: Math.random() < 0.2 ? "star" : "piece",
    });
  }
  function pop(p) {
    G.pieces.splice(G.pieces.indexOf(p), 1);
    G.score++;
    fx.burst(p.x, p.y, {
      n: 16,
      colors: CONFETTI,
      speed: 420,
      life: 0.6,
      size: 14,
    });
    ufx.text(p.x, p.y - 40, "+1", { size: 44, color: "#ffd23a" });
    PA.audio.play("pop", 0.7, 0.9 + Math.random() * 0.25); // the runtime caps repeats at ~3 a second
    PA.emit("pop", { score: G.score });
    if (!G.payoff && G.score >= PAYOFF_AT) payoff();
  }
  function payoff() {
    // the signature moment: everything on screen pops, music ducks under the big sound
    G.payoff = true;
    const n = G.pieces.length;
    G.pieces.slice().forEach(function (p, i) {
      PA.after(i * 0.06, function () {
        if (G.pieces.indexOf(p) >= 0) {
          G.pieces.splice(G.pieces.indexOf(p), 1);
          fx.burst(p.x, p.y, {
            n: 22,
            colors: CONFETTI,
            speed: 600,
            life: 0.8,
            size: 16,
          });
        }
      });
    });
    G.score += n;
    PA.shake(14, 0.5);
    PA.flash("#fff", 0.5, 0.35);
    PA.audio.duck(0.12, 1.4);
    PA.audio.play("payoff", 1);
    G.banner = { text: "MEGA POP!", sub: "+" + n, t: 0 };
    PA.after(
      1.4,
      function () {
        if (G.banner && G.banner.text === "MEGA POP!") G.banner = null;
      },
      true,
    );
    PA.emit("payoff", { popped: n, score: G.score });
  }
  function resultText(why) {
    // honest result text, read from the real state
    const left = GOAL - G.score;
    if (left <= 0) return { text: "GOAL REACHED!", sub: G.score + " popped" };
    const head =
      why === "idle" ? "TIME OUT!" : left <= 10 ? "SO CLOSE!" : "NICE TRY!";
    return { text: head, sub: left + " to go!", color: "#ff8ac8" };
  }
  function finish(why) {
    G.phase = "result";
    G.result = G.score >= GOAL ? "win" : "close";
    G.banner = Object.assign(resultText(why), { t: 0 });
    PA.audio.duck(0.15, 2.5);
    PA.audio.play(G.result === "win" ? "win" : "fail", 1);
    if (G.result === "win")
      for (let i = 0; i < 4; i++)
        PA.after(
          i * 0.25,
          function () {
            fx.burst(PA.view.w / 2, 300, {
              n: 40,
              colors: CONFETTI,
              speed: 800,
              gravity: 700,
              lift: 200,
              life: 1.4,
              size: 18,
            });
          },
          true,
        );
    PA.emit("result", {
      result: G.result,
      score: G.score,
      goal: GOAL,
      why: why,
    });
    // an idle timeout shows its line for at most 1.5 s; a played ending holds the result for 3 s
    PA.after(why === "idle" ? 1.4 : 3, endCard, true);
  }
  function endCard() {
    G.phase = "end";
    PA.emit("endcard", { result: G.result });
  }
  function hitPiece(x, y) {
    let best = null,
      bd = 1e9;
    for (const p of G.pieces) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < p.r + 24 && d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }
  // the piece the hand points at: the highest one still well inside the screen
  function nextTarget() {
    let best = null;
    for (const p of G.pieces)
      if (p.y > 300 && p.y < PA.view.h - 160 && (!best || p.y < best.y))
        best = p;
    return best;
  }

  // ---------- update ----------
  function update(dt) {
    fx.update(dt);
    ufx.update(dt);
    if (G.banner) G.banner.t += dt;
    for (const p of G.pieces) p.ph += dt * 3; // idle life runs even while waiting
    if (G.phase === "end" || G.phase === "result") return;
    G.target = nextTarget();
    // 10 s with no input at all: untouched goes straight to the end card, a started round shows its line first
    if (PA.idle().timeout) {
      if (!G.started) {
        G.result = null;
        endCard();
      } else finish("idle");
      return;
    }
    if (!G.started) return; // the gameplay clock is held until the first touch
    G.t += dt;
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      spawn();
      G.spawnT = SPAWN_S;
    }
    for (let i = G.pieces.length - 1; i >= 0; i--) {
      const p = G.pieces[i];
      p.y -= p.vy * dt;
      if (p.y < 140) G.pieces.splice(i, 1);
    }
    if (G.score >= GOAL) finish("goal");
    else if (G.t >= ROUND_S) finish("time");
  }

  // ---------- input (one verb, acted on at pointerdown so quick taps are never lost) ----------
  function onDown(x, y) {
    if (G.phase === "end" || G.phase === "result") return;
    if (!G.started) start();
    const p = hitPiece(x, y);
    if (p) pop(p);
  }

  // ---------- draw ----------
  function drawBg(c) {
    const v = PA.view,
      bg = PA.img.bg,
      sh = PA.shakeOffset();
    const s = Math.max(v.w / bg.width, v.h / bg.height);
    c.drawImage(
      bg,
      (v.w - bg.width * s) / 2 + sh.x,
      (v.h - bg.height * s) / 2 + sh.y,
      bg.width * s,
      bg.height * s,
    );
  }
  function drawPieces(c) {
    const waitGlow = !G.started;
    for (const p of G.pieces) {
      const im = PA.img[p.kind],
        isT = p === G.target;
      // waiting: every piece bobs, and the target glows and bounces
      const bob = waitGlow ? Math.sin(p.ph * 1.4) * 10 : 0,
        k = isT && waitGlow ? 1.08 + Math.sin(PA.realTime * 7) * 0.06 : 1;
      const d = p.r * 2 * k * (1 + Math.sin(p.ph) * 0.04);
      if (isT && waitGlow) {
        c.save();
        c.globalAlpha = 0.45 + Math.sin(PA.realTime * 7) * 0.2;
        c.fillStyle = "#fff6a8";
        c.beginPath();
        c.arc(p.x, p.y + bob, d * 0.66, 0, 7);
        c.fill();
        c.restore();
      }
      c.drawImage(
        im,
        p.x - d / 2,
        p.y + bob - d / 2,
        d,
        (d * im.height) / im.width,
      );
    }
  }
  function drawHud(c) {
    const v = PA.view;
    c.globalAlpha = G.hudA;
    D.rrect(c, 24, 36, 300, 70, 35);
    c.fillStyle = "rgba(19,36,77,0.85)";
    c.fill();
    c.drawImage(PA.img.coin, 30, 40, 62, 62);
    D.text(c, G.score + " / " + GOAL, 190, 72, { size: 40 });
    const left = Math.max(0, Math.ceil(ROUND_S - G.t));
    D.text(c, "0:" + String(left).padStart(2, "0"), v.w / 2 + 40, 72, {
      size: 40,
      color: left <= 5 ? "#ff8ac8" : "#fff",
    });
    c.globalAlpha = 1;
    if (G.phase !== "end") D.ctaPill(c, v.w - 196, 44, 172, 56); // plain logical coords: PA.pillRect is right
  }
  function drawHook(c) {
    if (G.hookA <= 0.01) return;
    const v = PA.view;
    c.save();
    c.globalAlpha = G.hookA;
    c.translate(v.w / 2, 300);
    c.scale(G.hookS, G.hookS);
    const logo = PA.img.logo,
      lh = 170,
      lw = (lh * logo.width) / logo.height;
    c.drawImage(logo, -lw / 2, -200, lw, lh);
    D.rrect(c, -300, 0, 600, 96, 30);
    c.fillStyle = "#2a8cff";
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = INK;
    c.stroke();
    D.text(c, "POP " + GOAL + " IN " + ROUND_S + "S!", 0, 50, { size: 46 });
    c.restore();
  }
  function drawHint(c) {
    if ((G.phase !== "play" && G.phase !== "wait") || !G.target) return;
    // the shared image hand: loops a real tap while waiting, returns after 2.5 s idle. It only points.
    // urgent cue when the target is about to float out of reach (the template's "tap now" moment)
    if (!G.started || PA.idle().hint)
      D.hintHand(c, { x: G.target.x, y: G.target.y }, null, {
        period: 1.1,
        urgent: G.started && G.target.y < 420,
      });
  }
  function drawBanner(c) {
    const b = G.banner;
    if (!b) return;
    const k = Math.min(1, b.t / 0.25),
      s = PA.ease.outBack(k);
    c.save();
    c.translate(PA.view.w / 2, 240);
    c.scale(s, s);
    c.translate(-PA.view.w / 2, -240);
    D.banner(c, b.text, b.sub, { y: 240, color: b.color || "#ffd23a" }); // top band, clear of the pieces
    c.restore();
  }
  function draw(c) {
    drawBg(c);
    if (G.phase === "end") {
      const r = G.result
        ? resultText(G.result === "win" ? "win" : "time")
        : null;
      PA.drawEndCard(c, {
        logo: "logo",
        hero: "hero",
        logoMaxH: 220,
        heroH: 150,
        title: r ? r.text : "CAN YOU POP " + GOAL + "?", // untouched viewers get the promise, not a result
        titleColor: G.result === "win" ? "#ffd23a" : "#ff8ac8",
        tagline: r ? r.sub : "Tap to pop them all",
        stats: [
          { label: "POPPED", value: String(G.score) },
          { label: "GOAL", value: String(GOAL) },
        ],
        replay: function () {
          PA.emit("replay");
          PA.clearTweens();
          reset();
        },
      });
      return;
    }
    drawPieces(c);
    fx.draw(c);
    drawHud(c);
    drawHook(c);
    drawHint(c);
    ufx.draw(c);
    drawBanner(c);
  }

  const game = {
    init: reset,
    update: update,
    draw: draw,
    onDown: onDown,
    // QA snapshot: phase, scale, progress (only grows with gameplay), and every tap target in client px
    qa: function () {
      const v = PA.view;
      return {
        phase: G.phase,
        t: G.t,
        score: G.score,
        goal: GOAL,
        result: G.result,
        scale: v.s,
        progress: Math.round(G.t * 100) / 100 + G.score,
        pieces: G.pieces
          .filter(function (p) {
            return p.y > 260 && p.y < v.h - 120;
          })
          .map(function (p) {
            return PA.toClient(p.x, p.y - (G.started ? p.vy * 0.03 : 0));
          }),
        empty: PA.toClient(6, v.h * 0.45), // never near a piece or the mute button
        cta: PA.toClient(v.w / 2, v.h * 0.76 + 58),
      };
    },
  };
  PA.boot(window.GAME_CFG, game);
})();
