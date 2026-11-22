// info.mjs [out.json]: what the renderer, mixer and checks need from the film: title, duration, fps, bpm, music,
// sounds, cuts, end card and every sound cue, as JSON (stdout, or out.json). Serve the film at FILM_URL first.
// Exits 1, listing the reasons, when the film does not build (a spec error, missing fonts, a crash).
import fs from "fs";
import { launch, openFilm, isMain } from "./browser.mjs";

// the exit code and the lines for stderr, from what the page reported
export function verdict(film, problems = [], errs = []) {
  const errors = problems.filter((p) => p.level === "error");
  const lines = problems.map((p) => `${p.level}: ${p.msg}`);
  if (!film || errors.length) {
    // warnings never explain a failure: without an error, the page errors are the reason
    if (!errors.length)
      lines.push(
        ...(errs.length
          ? errs.slice(0, 5)
          : ["the page set no film and no reason"]),
      );
    return { code: 1, lines: ["the film did not load:", ...lines] };
  }
  if (errs.length)
    lines.push("page errors: " + JSON.stringify(errs.slice(0, 5)));
  return { code: 0, lines };
}

async function main([out]) {
  const b = await launch();
  const { pg, errs, problems } = await openFilm(b, 1);
  const film = await pg
    .evaluate(() =>
      window.__film
        ? {
            title: __film.title,
            dur: __film.dur,
            fps: __film.fps,
            bpm: __film.bpm,
            music: __film.music,
            sounds: __film.sounds,
            cuts: __film.cuts,
            endCard: __film.endCard,
            lines: __film.lines,
            cues: __film.cues,
          }
        : null,
    )
    .catch(() => null);
  await b.close();
  const { code, lines } = verdict(film, problems, errs);
  for (const l of lines) console.error(l);
  if (code) process.exit(code);
  const s = JSON.stringify({ ...film, problems });
  if (out) fs.writeFileSync(out, s);
  else console.log(s);
  process.exit(0);
}

if (isMain(import.meta.url)) await main(process.argv.slice(2));
