#!/usr/bin/env python3
"""blind_review.py - blind side-by-side review page for any set of films (two versions, before/after a fix, two directions, a film vs a reference).

Usage:
  python3 blind_review.py [OUT_DIR=review] --round "Round name" a.mp4 b.mp4 [--round "Another" c.mp4=Name d.mp4=Name e.mp4 ...]
                          [--title "Launch films: blind review"] [--reshuffle]
  FILE or FILE=Name: the name goes into the hidden key (default: the file stem; equal stems get their folder name added).

Writes  OUT_DIR/index.html         one self-contained page (open it in a browser; add #<round-id> to open a tab, ids are printed)
        OUT_DIR/videos/<round>-<L|R|X|Y|Z...>.mp4   hard links when possible (no disk cost), copies otherwise
        OUT_DIR/.answer-key.json   the answer key (hidden file, mode 600; ALSO obfuscated behind the page's two-click Reveal button).
                                   Do not open it, and do not look in videos/ before judging: file sizes can give the films away.
Sides are randomly labelled (L/R for two films, X/Y/Z... for more) with os-level randomness; re-running keeps the earlier shuffle so
verdicts stay valid unless --reshuffle. The page plays all films of a round in sync (play/pause, scrub, frame step, 0.25-1x, loop), lets
each film be heard alone (judge the picture silent first, then each soundtrack by itself), and records per-film pick / slop / 1-10 rating /
worst-moment notes in the browser, with a "Copy verdict" button (paste it into taste/verdicts.md). Warns when the films differ in
resolution, frame rate or duration (a giveaway, and unfair to the viewer).
Exit: 0 ok, 2 bad usage (missing file, fewer than 2 films in a round).
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import random
import re
import shutil
import subprocess
import sys
from pathlib import Path

TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blind Review</title>
<style>
:root{
  --bg:#111113; --panel:#1a1a1d; --line:#2a2a2f; --text:#ececea; --dim:#9a9a9f; --accent:#e9e6df;
  --pick:#7fd6a4; --slop:#f08a78; --chip:#26262b;
}
:root[data-theme="light"]{
  --bg:#f3f2ef; --panel:#ffffff; --line:#dddcd7; --text:#18181a; --dim:#6b6b70; --accent:#18181a;
  --pick:#1f8f55; --slop:#c4442f; --chip:#ecebe7;
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif}
header{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:18px 24px;border-bottom:1px solid var(--line)}
header h1{font-size:18px;margin:0;font-weight:600;letter-spacing:-.01em}
header p{margin:0;color:var(--dim);font-size:13px;flex:1;min-width:240px}
.tabs{display:flex;gap:6px}
button,.btn{font:inherit;font-size:13px;color:var(--text);background:var(--chip);border:1px solid var(--line);border-radius:8px;padding:7px 12px;cursor:pointer}
button:hover{border-color:var(--dim)}
button[aria-pressed="true"],.tabs button[aria-selected="true"]{background:var(--accent);color:var(--bg);border-color:var(--accent)}
main{padding:20px 24px 60px;max-width:1800px;margin:0 auto}
.panel{display:none}.panel.on{display:block}
.grid{display:grid;gap:16px}
.grid.n2{grid-template-columns:1fr 1fr}.grid.n3{grid-template-columns:1fr 1fr 1fr}
@media (max-width:900px){.grid.n2,.grid.n3{grid-template-columns:1fr}}
.film{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.film.picked{outline:2px solid var(--pick)}
.vwrap{position:relative;background:#000;aspect-ratio:16/9}
video{width:100%;height:100%;display:block;object-fit:contain;background:#000}
.badge{position:absolute;top:10px;left:10px;background:rgba(0,0,0,.6);color:#fff;font-weight:700;font-size:20px;padding:2px 12px;border-radius:8px}
.time{position:absolute;bottom:8px;right:10px;background:rgba(0,0,0,.55);color:#ddd;font:12px ui-monospace,Menlo,monospace;padding:2px 7px;border-radius:5px}
.reveal-name{position:absolute;top:12px;right:10px;background:var(--pick);color:#0b0b0b;font-weight:600;font-size:13px;padding:3px 9px;border-radius:6px;display:none}
.revealed .reveal-name{display:block}
.form{padding:12px 14px;display:grid;gap:8px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.row label{color:var(--dim);font-size:13px}
.seg button{padding:5px 9px;min-width:30px}
textarea{width:100%;min-height:52px;resize:vertical;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;font-size:13px}
.transport{position:sticky;bottom:0;margin-top:16px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.transport input[type=range]{flex:1;min-width:200px;accent-color:var(--accent)}
.mono{font:12px ui-monospace,Menlo,monospace;color:var(--dim)}
.verdict{margin-top:16px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;display:grid;gap:10px}
.verdict h2{margin:0;font-size:15px}
.hint{color:var(--dim);font-size:12px}
.slop-on{background:var(--slop)!important;color:#111!important;border-color:var(--slop)!important}
kbd{font:11px ui-monospace,Menlo,monospace;border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;padding:0 5px;color:var(--dim)}
</style>
</head>
<body>
<header>
  <h1>__TITLE__</h1>
  <p>Sides are shuffled and the names are hidden until you reveal them. Judge the picture first with sound off, then each soundtrack on its own.</p>
  <nav class="tabs" role="tablist" id="tabs"></nav>
  <button id="theme" title="Toggle light/dark">◐</button>
</header>
<main id="main"></main>

<script>
const PANELS = __PANELS__;
const KEY = JSON.parse(atob("__KEY__".split("").reverse().join("")));
const store = {
  get(k, d) { try { const v = localStorage.getItem("blind:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("blind:" + k, JSON.stringify(v)); } catch {} }
};
const $ = (s, el = document) => el.querySelector(s);
const fmt = t => isFinite(t) ? t.toFixed(2) + "s" : "–";

// theme
const root = document.documentElement;
root.dataset.theme = store.get("theme", "dark");
$("#theme").onclick = () => { root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark"; store.set("theme", root.dataset.theme); };

const tabs = $("#tabs"), main = $("#main");
let active = store.get("tab", PANELS[0].id);

PANELS.forEach(p => {
  const tab = document.createElement("button");
  tab.textContent = p.title; tab.setAttribute("role", "tab"); tab.dataset.id = p.id;
  tab.onclick = () => show(p.id);
  tabs.appendChild(tab);

  const sec = document.createElement("section");
  sec.className = "panel"; sec.id = "p-" + p.id;
  const v = store.get("v:" + p.id, { pick: null, films: {}, notes: "" });
  sec.innerHTML = `
    <div class="grid n${p.items.length}">
      ${p.items.map(it => `
        <article class="film" data-label="${it.label}">
          <div class="vwrap">
            <video src="${it.src}" preload="auto" playsinline muted></video>
            <span class="badge">${it.label}</span>
            <span class="reveal-name"></span>
            <span class="time">0.00s</span>
          </div>
          <div class="form">
            <div class="row">
              <button class="snd" aria-pressed="false" title="Hear this film's own soundtrack">🔈 Sound</button>
              <button class="pick" aria-pressed="false">Pick ${it.label}</button>
              <button class="slop" aria-pressed="false">Slop?</button>
            </div>
            <div class="row seg" aria-label="Rating 1 to 10"><label>Rating</label>
              ${[1,2,3,4,5,6,7,8,9,10].map(n => `<button data-r="${n}">${n}</button>`).join("")}
            </div>
            <textarea placeholder="Worst moment / best moment for ${it.label} (timecode + one phrase)"></textarea>
          </div>
        </article>`).join("")}
    </div>
    <div class="transport">
      <button class="play" title="Space">▶ Play both</button>
      <button class="restart" title="R">⟲ Restart</button>
      <button class="back" title="←">−1f</button><button class="fwd" title="→">+1f</button>
      <span class="mono">speed</span>
      <span class="seg">${[1,0.5,0.25].map(s => `<button class="spd" data-s="${s}" aria-pressed="${s===1}">${s}×</button>`).join("")}</span>
      <button class="loop" aria-pressed="false">Loop</button>
      <input type="range" class="scrub" min="0" max="1000" value="0" aria-label="Scrub both films">
      <span class="mono clock">0.00s</span>
    </div>
    <div class="verdict">
      <h2>Verdict: ${p.title}</h2>
      <textarea class="overall" placeholder="Overall: which is better and why? Is either one slop?">${v.notes || ""}</textarea>
      <div class="row">
        <button class="copy">Copy verdict</button>
        <button class="reveal">Reveal which is which</button>
        <span class="hint">Keys: <kbd>Space</kbd> play/pause · <kbd>R</kbd> restart · <kbd>←</kbd><kbd>→</kbd> frame · <kbd>1</kbd>–<kbd>3</kbd> sound from film</span>
      </div>
    </div>`;
  main.appendChild(sec);
  wire(p, sec, v);
});

function show(id) {
  active = id; store.set("tab", id);
  document.querySelectorAll(".panel").forEach(s => s.classList.toggle("on", s.id === "p-" + id));
  tabs.querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", b.dataset.id === id));
  document.querySelectorAll("video").forEach(v => v.pause());
}

function wire(p, sec, v) {
  const films = [...sec.querySelectorAll(".film")];
  const videos = films.map(f => $("video", f));
  const save = () => store.set("v:" + p.id, v);
  const longest = () => Math.max(...videos.map(x => x.duration || 0));
  let playing = false, rate = 1, loop = false;

  films.forEach((f, i) => {
    const lab = f.dataset.label, vid = videos[i];
    const fv = v.films[lab] = v.films[lab] || { rating: null, slop: false, note: "" };
    // restore
    if (fv.rating) $(`[data-r="${fv.rating}"]`, f).setAttribute("aria-pressed", "true");
    if (fv.slop) { $(".slop", f).classList.add("slop-on"); $(".slop", f).setAttribute("aria-pressed", "true"); }
    if (v.pick === lab) { f.classList.add("picked"); $(".pick", f).setAttribute("aria-pressed", "true"); }
    $("textarea", f).value = fv.note || "";
    // controls
    f.querySelectorAll("[data-r]").forEach(b => b.onclick = () => {
      f.querySelectorAll("[data-r]").forEach(x => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true"); fv.rating = +b.dataset.r; save();
    });
    $(".slop", f).onclick = e => { fv.slop = !fv.slop; e.currentTarget.classList.toggle("slop-on", fv.slop); e.currentTarget.setAttribute("aria-pressed", fv.slop); save(); };
    $(".pick", f).onclick = () => {
      v.pick = v.pick === lab ? null : lab; save();
      films.forEach(g => { const on = g.dataset.label === v.pick; g.classList.toggle("picked", on); $(".pick", g).setAttribute("aria-pressed", on); });
    };
    $("textarea", f).oninput = e => { fv.note = e.target.value; save(); };
    $(".snd", f).onclick = () => solo(i);
    vid.addEventListener("timeupdate", () => { $(".time", f).textContent = fmt(vid.currentTime); });
    vid.addEventListener("ended", () => { if (videos.every(x => x.ended || x.currentTime >= x.duration - 0.05)) { if (loop) restart(true); else setPlaying(false); } });
  });

  function solo(i) {
    videos.forEach((x, j) => { const on = j === i && x.muted; x.muted = !on; $(".snd", films[j]).setAttribute("aria-pressed", on); $(".snd", films[j]).textContent = on ? "🔊 Sound" : "🔈 Sound"; });
  }
  function setPlaying(on) {
    playing = on; $(".play", sec).textContent = on ? "❚❚ Pause" : "▶ Play both";
    videos.forEach(x => { x.playbackRate = rate; if (on && x.currentTime < x.duration - 0.05) x.play().catch(() => {}); else x.pause(); });
  }
  function seek(t) { videos.forEach(x => { x.currentTime = Math.min(t, (x.duration || t) - 0.001); }); }
  function restart(play) { seek(0); setPlaying(play ?? playing); }
  function step(d) { setPlaying(false); seek(Math.max(0, (videos[0].currentTime || 0) + d)); }

  $(".play", sec).onclick = () => setPlaying(!playing);
  $(".restart", sec).onclick = () => restart();
  $(".back", sec).onclick = () => step(-1 / 30);
  $(".fwd", sec).onclick = () => step(1 / 30);
  sec.querySelectorAll(".spd").forEach(b => b.onclick = () => {
    rate = +b.dataset.s; sec.querySelectorAll(".spd").forEach(x => x.setAttribute("aria-pressed", x === b)); videos.forEach(x => x.playbackRate = rate);
  });
  $(".loop", sec).onclick = e => { loop = !loop; e.currentTarget.setAttribute("aria-pressed", loop); };
  const scrub = $(".scrub", sec), clock = $(".clock", sec);
  scrub.oninput = () => { setPlaying(false); seek(scrub.value / 1000 * longest()); };
  (function tick() {
    const t = Math.max(...videos.map(x => x.currentTime || 0)), L = longest();
    if (L && document.activeElement !== scrub) scrub.value = Math.round(t / L * 1000);
    clock.textContent = `${fmt(t)} / ${fmt(L)}`;
    requestAnimationFrame(tick);
  })();

  $(".overall", sec).oninput = e => { v.notes = e.target.value; save(); };
  $(".copy", sec).onclick = async e => {
    const lines = [`${p.title}: pick ${v.pick || "–"}`];
    films.forEach(f => { const lab = f.dataset.label, fv = v.films[lab];
      lines.push(`  ${lab}: rating ${fv.rating ?? "–"}/10 · slop: ${fv.slop ? "yes" : "no"}${fv.note ? " · " + fv.note : ""}`); });
    if (v.notes) lines.push(`  overall: ${v.notes}`);
    if (sec.classList.contains("revealed")) films.forEach(f => lines.push(`  ${f.dataset.label} = ${KEY[p.title + " · " + f.dataset.label]}`));
    try { await navigator.clipboard.writeText(lines.join("\n")); e.target.textContent = "Copied ✓"; } catch { e.target.textContent = "Copy failed"; }
    setTimeout(() => e.target.textContent = "Copy verdict", 1600);
  };
  let armed = false;
  $(".reveal", sec).onclick = e => {
    if (!armed) { armed = true; e.target.textContent = "Sure? Click again to reveal"; setTimeout(() => { if (armed) { armed = false; e.target.textContent = "Reveal which is which"; } }, 3000); return; }
    sec.classList.add("revealed");
    films.forEach(f => $(".reveal-name", f).textContent = KEY[p.title + " · " + f.dataset.label]);
    e.target.textContent = "Revealed"; e.target.disabled = true;
  };
  sec._keys = { toggle: () => setPlaying(!playing), restart: () => restart(), step, solo };
}

document.addEventListener("keydown", e => {
  if (e.target.tagName === "TEXTAREA") return;
  const k = $("#p-" + active)._keys;
  if (e.code === "Space") { e.preventDefault(); k.toggle(); }
  else if (e.key === "r" || e.key === "R") k.restart();
  else if (e.key === "ArrowLeft") k.step(-1 / 30);
  else if (e.key === "ArrowRight") k.step(1 / 30);
  else if (/^[1-3]$/.test(e.key)) k.solo(+e.key - 1);
});

const fromHash = location.hash.slice(1);
show(PANELS.some(p => p.id === fromHash) ? fromHash : PANELS.some(p => p.id === active) ? active : PANELS[0].id);
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (PANELS.some(p => p.id === h)) show(h); });
</script>
</body>
</html>
"""


def probe_warn(title: str, files: list) -> None:
    """Warn when films differ in size / fps / duration: the viewer would guess the film from it."""
    info = []
    for f in files:
        try:
            r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate:format=duration",
                                "-of", "json", str(f)], capture_output=True, text=True, timeout=30)
            d = json.loads(r.stdout)
            st = d["streams"][0]
            n, m = st["avg_frame_rate"].split("/")
            info.append((st["width"], st["height"], round(float(n) / float(m), 2) if float(m) else 0, round(float(d["format"]["duration"]), 2)))
        except (OSError, ValueError, KeyError, IndexError, subprocess.SubprocessError):
            return
    if len({i[:3] for i in info}) > 1:
        print("warning: round '%s': films differ in resolution/fps %s: the viewer can tell them apart by it" % (title, [i[:3] for i in info]), file=sys.stderr)
    if max(i[3] for i in info) - min(i[3] for i in info) > 0.5:
        print("warning: round '%s': durations differ %s s" % (title, [i[3] for i in info]), file=sys.stderr)


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "round"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", nargs="?", default="review")
    ap.add_argument("--round", nargs="+", action="append", required=True, metavar=("NAME", "FILM"),
                    help="round name followed by 2+ video files")
    ap.add_argument("--title", default="Blind review")
    ap.add_argument("--reshuffle", action="store_true")
    a = ap.parse_args()

    out = Path(a.out).resolve()
    vids = out / "videos"
    vids.mkdir(parents=True, exist_ok=True)
    keyfile = out / ".answer-key.json"
    old = {} if a.reshuffle or not keyfile.exists() else json.loads(keyfile.read_text())
    rnd = random.SystemRandom()
    key, panels = {}, []
    for f in vids.iterdir():
        f.unlink()
    for spec in a.round:
        title = spec[0]
        files, given = [], {}
        for raw in spec[1:]:
            fp, _, nm = raw.partition("=")
            f = Path(fp).resolve()
            files.append(f)
            if nm:
                given[str(f)] = nm
        if len(files) < 2:
            ap.error(f"round '{title}' needs at least 2 films")
        for f in files:
            if not f.exists():
                ap.error(f"missing film: {f}")
        labels = ["L", "R"] if len(files) == 2 else [chr(ord("X") + i) if i < 3 else chr(ord("A") + i - 3) for i in range(len(files))]
        names = {str(f): given.get(str(f), f.stem) for f in files}
        if len(set(names.values())) < len(names):                 # equal stems (v1/final.mp4, v2/final.mp4): add the folder name
            names = {k: given.get(k, "%s/%s" % (Path(k).parent.name, Path(k).stem)) for k in names}
        if len(set(names.values())) < len(names):
            ap.error("round '%s': two films have the same name; give them FILE=Name" % title)
        probe_warn(title, files)
        rid = slug(title)
        prev = [old.get(f"{title} · {l}") for l in labels]
        if all(prev) and sorted(prev) == sorted(names.values()):
            order = [next(f for f in files if names[str(f)] == p) for p in prev]
        else:
            order = files[:]
            rnd.shuffle(order)
        items = []
        for lab, f in zip(labels, order):
            dst = vids / f"{rid}-{lab}{f.suffix}"
            try:
                os.link(f, dst)
            except OSError:
                shutil.copy2(f, dst)
            items.append({"label": lab, "src": f"videos/{dst.name}"})
            key[f"{title} · {lab}"] = names[str(f)]
        panels.append({"id": rid, "title": title, "items": items})
        print(f"round '{title}' -> #{rid} ({len(files)} films)")
    keyfile.write_text(json.dumps(key, indent=1) + "\n")
    try:
        os.chmod(keyfile, 0o600)
    except OSError:
        pass
    blob = base64.b64encode(json.dumps(key).encode()).decode()[::-1]
    html = (TEMPLATE.replace("__PANELS__", json.dumps(panels)).replace("__KEY__", blob)
            .replace("__TITLE__", a.title.replace("<", "&lt;")))
    (out / "index.html").write_text(html)
    print(f"wrote {out / 'index.html'}  (hidden answer key: {keyfile.name}; do not open it before judging)")


if __name__ == "__main__":
    main()
