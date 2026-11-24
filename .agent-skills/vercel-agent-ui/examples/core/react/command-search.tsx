import * as React from "react"
import { definePrimitive } from "@ui-sdk/core"
import { fuzzyScore } from "@ui-sdk/core/text-match"
import { createParts } from "@ui-sdk/react/primitive"

type CommandSearchState = { query: string }

const commandSearch = definePrimitive({
  name: "command-search",
  state: (): CommandSearchState => ({ query: "" }),
  api: (context) => ({
    search: (query: string) => context.store.set({ query }),
  }),
  slots: (slot) => ({
    root: slot<{}, CommandSearchState>({
      state: (state) => ({ query: state.query }),
    }),
    input: slot({
      attrs: (state) => ({ type: "search", value: state.query }),
      on: {
        input: (event, { api }) =>
          api.search((event.target as HTMLInputElement).value),
      },
    }),
    list: slot({ attrs: () => ({ role: "list" }) }),
    command: slot({ attrs: () => ({ role: "listitem" }) }),
  }),
})

const parts = createParts(commandSearch, {
  root: "div",
  input: "input",
  list: "ul",
  command: "li",
})

const CommandSearch = parts.Root

const CommandSearchInput = parts.Input

const CommandSearchList = parts.List

const CommandSearchCommand = parts.Command

const commands = [
  "Git push",
  "Git pull",
  "Go to file",
  "Open settings",
  "Settings",
  "Résumé template",
  "Toggle sidebar",
]

function rank(query: string) {
  return commands
    .map((command) => ({ command, score: fuzzyScore(command, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
}

function Example() {
  return (
    <CommandSearch>
      {({ query }) => (
        <>
          <CommandSearchInput
            aria-label="Search commands"
            placeholder="Search commands…"
          />
          <CommandSearchList>
            {rank(query).map(({ command, score }) => (
              <CommandSearchCommand key={command}>
                {command}
                <span data-slot="hint">{score.toFixed(2)}</span>
              </CommandSearchCommand>
            ))}
          </CommandSearchList>
        </>
      )}
    </CommandSearch>
  )
}

export {
  CommandSearch,
  commandSearch,
  CommandSearchCommand,
  CommandSearchInput,
  CommandSearchList,
  type CommandSearchState,
  Example,
}
