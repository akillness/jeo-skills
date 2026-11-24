<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    createTokenInputController,
    TokenInput,
    TokenInputEditor,
    type Token,
    type TokenInputValue,
  } from "@ui-sdk/svelte/token-input"

  const draft: TokenInputValue = [
    "Compare ",
    { type: "file", value: "src/routes.ts", label: "routes.ts" },
    " with ",
  ]

  const loadFile = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 800))

  const prompt = createTokenInputController()
  const firstToken = () =>
    prompt
      .getValue()
      .find((segment): segment is Token => typeof segment !== "string")
  const keepFocus = (event: MouseEvent) => event.preventDefault()

  function showPath() {
    const token = firstToken()
    if (token) {
      prompt.updateToken(token.id!, { label: token.value })
    }
  }

  function removeFirst() {
    const token = firstToken()
    if (token) {
      prompt.removeToken(token.id!)
    }
  }
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button
      type="button"
      onmousedown={keepFocus}
      onclick={() =>
        prompt.insert(
          { type: "file", value: "package.json", label: "package.json" },
          { at: "end", resolve: loadFile() }
        )}
    >
      Attach File
    </button>
    <button type="button" onmousedown={keepFocus} onclick={showPath}
      >Show Path</button
    >
    <button type="button" onmousedown={keepFocus} onclick={removeFirst}
      >Remove First</button
    >
    <button type="button" onmousedown={keepFocus} onclick={() => prompt.undo()}
      >Undo</button
    >
    <button type="button" onmousedown={keepFocus} onclick={() => prompt.clear()}
      >Clear</button
    >
  </div>
  <Field>
    <FieldLabel>Prompt</FieldLabel>
    <TokenInput controller={prompt} defaultValue={draft}>
      <TokenInputEditor />
    </TokenInput>
  </Field>
</div>
