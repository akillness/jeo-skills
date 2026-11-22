// A film folder for the vitest suites: the engine plus one example, as new_film.sh lays it out, so an
// example's `import ... from './blocks.js'` and the engine share one module instance. The engine files
// are symlinks: vite resolves them to the skill's own files, so coverage counts the engine the tests
// run. The example is copied, since its imports resolve beside its real path. The folders sit under
// node_modules/.cache: inside the project, where vite resolves them in every environment, and out of
// git.
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "fs";
import path from "path";

export const SKILL = path.resolve(
  __dirname,
  "../../skills/scenario-kinetic-film",
);
export const ENGINE = path.join(SKILL, "assets/engine");
export const EXAMPLES = readdirSync(path.join(SKILL, "assets/examples"));
const CACHE = path.resolve(
  __dirname,
  "../../node_modules/.cache/kinetic-film-tests",
);

const made: string[] = [];
// call from afterAll: removes every folder filmFolder made in this test file
export const removeFilms = () =>
  made.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));

export function filmFolder(example: string): string {
  mkdirSync(CACHE, { recursive: true });
  const dir = mkdtempSync(path.join(CACHE, `${example}-`));
  made.push(dir);
  for (const file of readdirSync(ENGINE))
    symlinkSync(path.join(ENGINE, file), path.join(dir, file));
  cpSync(path.join(SKILL, "assets/examples", example), dir, {
    recursive: true,
  });
  return dir;
}

export const load = (dir: string, file: string) =>
  import(/* @vite-ignore */ path.join(dir, file));
