import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// English source text is the key. Check every shipped dictionary, including
// dynamic entries, while retaining the existing literal-call coverage check.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const localeDir = join(root, "src/i18n/locales");
const dictionaries = readdirSync(localeDir)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => [name, JSON.parse(readFileSync(join(localeDir, name), "utf8"))]);

const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) files.push(p);
  }
}
walk(join(root, "src"));

const calls = new Map();
const literalCall = /(?:^|[^\w$.])t\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/gm;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(literalCall)) {
    const key =
      m[1] !== undefined ? JSON.parse(`"${m[1]}"`) : m[2].replace(/\\(['\\])/g, "$1");
    if (!calls.has(key)) calls.set(key, file.slice(root.length + 1));
  }
}

function placeholders(s) {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
}

const allKeys = new Set(dictionaries.flatMap(([, dict]) => Object.keys(dict)));
const errors = [];
if (!dictionaries.length) errors.push("No locale dictionaries found");
for (const [name, dict] of dictionaries) {
  for (const key of new Set([...allKeys, ...calls.keys()])) {
    if (!Object.prototype.hasOwnProperty.call(dict, key)) {
      errors.push(`${name}: missing ${JSON.stringify(key)} (${calls.get(key) ?? "dictionary parity"})`);
      continue;
    }
    const value = dict[key];
    if (typeof value !== "string" || !value.trim()) {
      errors.push(`${name}: empty or non-string value for ${JSON.stringify(key)}`);
    } else if (placeholders(value) !== placeholders(key)) {
      errors.push(`${name}: placeholder mismatch for ${JSON.stringify(key)}`);
    }
  }
  console.log(`i18n: ${calls.size} literal keys checked against ${Object.keys(dict).length} ${name} entries`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
