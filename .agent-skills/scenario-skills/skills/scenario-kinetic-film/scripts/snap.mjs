// snap.mjs <outdir> <dsf> t1 t2 ... : stills of the film at the given times (seconds), named t_<seconds>.png
// Times may also be beats: b12.5. Serve the film folder first (FILM_URL, default http://127.0.0.1:5671/).
import fs from "fs";
import { launch, openFilm, isMain } from "./browser.mjs";

export const USAGE = "usage: node snap.mjs <outdir> <dsf> <t|bBeat> ...";
// '12.5' is seconds, 'b12.5' is beats; NaN for anything else
export const toSeconds = (raw, bpm) =>
  String(raw).startsWith("b") ? (+String(raw).slice(1) * 60) / bpm : +raw;
export const stillName = (t) => `t_${t.toFixed(2).padStart(6, "0")}.png`;

async function main([OUT, DSF = "1", ...TS]) {
  if (!OUT || !TS.length) {
    console.error(USAGE);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const b = await launch();
  const { pg, errs, problems } = await openFilm(b, DSF);
  const bpm = await pg.evaluate(() => window.__film && window.__film.bpm);
  if (!bpm) {
    console.error(
      "the film did not load:",
      JSON.stringify([...problems.map((p) => p.msg), ...errs].slice(0, 8)),
    );
    await b.close();
    process.exit(1);
  }
  for (const raw of TS) {
    const t = toSeconds(raw, bpm);
    if (!Number.isFinite(t)) {
      errs.push(`TIME ${raw}: not seconds or bBeat`);
      continue;
    }
    const err = await pg.evaluate((t) => {
      try {
        window.__seek(t);
        return null;
      } catch (e) {
        return e.message.slice(0, 160);
      }
    }, t);
    if (err) {
      errs.push(`SEEK ${raw}: ${err}`);
      continue;
    }
    await pg.screenshot({
      path: `${OUT}/${stillName(t)}`,
      clip: { x: 0, y: 0, width: 1920, height: 1080 },
    });
  }
  const warnings = problems
    .filter((p) => p.level === "warning")
    .map((p) => p.msg);
  console.log(
    "lines",
    await pg.evaluate(() => window.__film && window.__film.lines),
    errs.length ? "ERRORS " + JSON.stringify(errs.slice(0, 8)) : "no errors",
    warnings.length ? "WARNINGS " + JSON.stringify(warnings) : "",
  );
  await b.close();
}

if (isMain(import.meta.url)) await main(process.argv.slice(2));
