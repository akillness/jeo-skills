// Every `if`, `else`, `for`, `while` and `do` body is a block, even a one-line
// one, so adding a second statement never changes what runs. ESLint's `curly`
// rule alone, on every tracked script, Vue and Svelte file; `--fix` adds them.
import { execFileSync } from "node:child_process"
import path from "node:path"
import { ESLint } from "eslint"
import svelte from "eslint-plugin-svelte"
import vue from "eslint-plugin-vue"
import tseslint from "typescript-eslint"

const root = path.resolve(import.meta.dirname, "..")
const fix = process.argv.includes("--fix")
const rules = { curly: ["error", "all"] }

const files = execFileSync(
  "git",
  [
    "ls-files",
    "-z",
    "*.ts",
    "*.tsx",
    "*.mts",
    "*.js",
    "*.mjs",
    "*.vue",
    "*.svelte",
  ],
  { cwd: root, encoding: "utf8" }
)
  .split("\0")
  .filter(Boolean)

const eslint = new ESLint({
  cwd: root,
  fix,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["**/*.{ts,tsx,mts}"],
      languageOptions: { parser: tseslint.parser },
    },
    ...vue.configs["flat/base"],
    {
      files: ["**/*.vue"],
      languageOptions: { parserOptions: { parser: tseslint.parser } },
    },
    ...svelte.configs["flat/base"],
    {
      files: ["**/*.svelte", "**/*.svelte.{js,ts}"],
      languageOptions: { parserOptions: { parser: tseslint.parser } },
    },
    {
      files: ["**/*"],
      linterOptions: { reportUnusedDisableDirectives: "off" },
      rules,
    },
  ],
})

const results = await eslint.lintFiles(files)
if (fix) {
  await ESLint.outputFixes(results)
}

let failed = false
for (const result of results) {
  for (const message of result.messages) {
    failed = true
    const file = path.relative(root, result.filePath)
    console.log(
      `${file}:${message.line} ${message.ruleId ?? "parse"} ${message.message}`
    )
  }
}
process.exitCode = failed ? 1 : 0
