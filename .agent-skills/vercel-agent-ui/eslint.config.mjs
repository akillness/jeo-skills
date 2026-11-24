import reactHooks from "eslint-plugin-react-hooks"
import solid from "eslint-plugin-solid/configs/typescript"
import svelte from "eslint-plugin-svelte"
import vue from "eslint-plugin-vue"
import tseslint from "typescript-eslint"

// Each framework's own rules, on that framework's code only. Prettier owns layout and
// tsc owns types, so their rules stay off. So do rules written for apps: Vue's
// multi-word names, and SvelteKit's `resolve()` for links.

const react = [
  "packages/react/src/**/*.{ts,tsx}",
  "examples/*/react/**/*.tsx",
  "examples/components/*/react/**/*.tsx",
  "apps/playground/src/fixtures/**/react*.tsx",
]
const solidFiles = [
  "packages/solid/src/**/*.{ts,tsx}",
  "examples/*/solid/**/*.tsx",
  "examples/components/*/solid/**/*.tsx",
  "apps/playground/src/fixtures/**/solid*.tsx",
]
const vueFiles = [
  "packages/vue/src/**/*.vue",
  "examples/*/vue/**/*.vue",
  "examples/components/*/vue/**/*.vue",
  "apps/playground/src/fixtures/**/*.vue",
]
const svelteFiles = [
  "packages/svelte/src/**/*.svelte",
  "examples/*/svelte/**/*.svelte",
  "examples/components/*/svelte/**/*.svelte",
  "apps/playground/src/fixtures/**/*.svelte",
]

const config = [
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.svelte-kit/**"] },
  {
    files: [...react, ...solidFiles],
    languageOptions: { parser: tseslint.parser },
  },
  { ...reactHooks.configs.flat.recommended, files: react },
  { ...solid, files: solidFiles },
  ...vue.configs["flat/recommended"].map((block) => ({
    ...block,
    files: vueFiles,
  })),
  { ...vue.configs["no-layout-rules"], files: vueFiles },
  {
    files: vueFiles,
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: { "vue/multi-word-component-names": "off" },
  },
  ...svelte.configs.recommended.map((block) => ({
    ...block,
    files: svelteFiles,
  })),
  {
    files: svelteFiles,
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: { "svelte/no-navigation-without-resolve": "off" },
  },
]

export default config
