import path from "node:path"
import ts from "typescript"
import { expect, test } from "vitest"

// What TypeScript says about each mistake a slot can make, since agents fix
// what the message names. Unions in the slot types can make it blame the
// wrong field, like telling an option without `focus` to add keys.
const cases = {
  option: [
    'slot({ role: "option", press, attrs: selected })',
    "Property 'focus' is missing",
  ],
  button: [
    'slot({ role: "button", focus: "native" })',
    "Property 'press' is missing",
  ],
  slider: [
    'slot({ role: "slider", focus: "native", attrs: () => ({ "aria-valuenow": "1" }) })',
    "keys, on",
  ],
  keyed: [
    'slot({ role: "slider", keys: ["ArrowUp"], on: { keydown }, attrs: () => ({ "aria-valuenow": "1" }) })',
    "Property 'focus' is missing",
  ],
  unhandled: [
    'slot({ role: "listbox", keys: ["ArrowDown"] })',
    "Property 'on' is missing",
  ],
  noAttrs: [
    'slot({ role: "checkbox", focus: "native", press })',
    "Property 'attrs' is missing",
  ],
  unchecked: [
    'slot({ role: "checkbox", focus: "native", press, attrs: () => ({ type: "button" }) })',
    `Property '"aria-checked"' is missing`,
  ],
  oriented: [
    'slot({ role: "group", attrs: () => ({ "aria-orientation": "vertical" as const }) })',
    `"aria-orientation isn't allowed on a group"`,
  ],
  named: [
    'slot({ role: "none", attrs: () => ({ "aria-label": "Divider" as const }) })',
    // `none` shares its checks with other roles that can't be named, so the
    // message says "this role", and the error shows which.
    `"aria-label isn't allowed on this role"`,
  ],
} as const

test("type errors name what a slot leaves out or can't have", () => {
  const configPath = path.join(import.meta.dirname, "../tsconfig.test.json")
  const config = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic() {} }
  )!
  const fixture = path.join(
    import.meta.dirname,
    "slot-role-messages.fixture.ts"
  )
  const names = Object.keys(cases) as (keyof typeof cases)[]
  const source = [
    'import { definePrimitive } from "../src/index"',
    "const press = () => {}",
    "const keydown = () => {}",
    'const selected = () => ({ "aria-selected": "false" })',
    'definePrimitive({ name: "m", state: () => ({}), api: () => ({}), slots: (slot) => ({',
    ...names.map((name) => `  ${name}: ${cases[name][0]},`),
    "}) })",
  ].join("\n")
  const host = ts.createCompilerHost(config.options)
  const getSourceFile = host.getSourceFile
  host.getSourceFile = (file, language, ...rest) =>
    file === fixture
      ? ts.createSourceFile(file, source, language)
      : getSourceFile(file, language, ...rest)
  const fileExists = host.fileExists
  host.fileExists = (file) => file === fixture || fileExists(file)
  const program = ts.createProgram(
    [fixture],
    { ...config.options, noEmit: true },
    host
  )
  const file = program.getSourceFile(fixture)!
  const messages = new Map<string, string>()
  for (const diagnostic of ts.getPreEmitDiagnostics(program, file)) {
    const line = file.getLineAndCharacterOfPosition(diagnostic.start!).line
    messages.set(
      names[line - 5]!,
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    )
  }
  for (const name of names) {
    expect(messages.get(name), name).toContain(cases[name][1])
  }
})
