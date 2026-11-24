<script lang="ts">
  import {
    Select,
    SelectTrigger,
    SelectValue,
    createSelectController,
  } from "../../src/select"

  let {
    external = true,
    content = "default",
    connected = true,
  }: {
    external?: boolean
    content?: "default" | "static" | "children" | "render"
    connected?: boolean
  } = $props()
  const controller = createSelectController<string>()
  const items = [
    { value: "apple", label: "Apple" },
    { value: "pear", label: "Pear" },
  ]
  let selected = $state("apple")
  let placeholder = $state("Pick a fruit")
  let attached = $state(false)

  export const attach = () => {
    attached = true
  }
  export const choosePear = () => {
    selected = "pear"
  }
  export const changePlaceholder = () => {
    placeholder = "Choose a fruit"
  }
</script>

{#snippet value()}
  {#if content === "static"}
    <SelectValue {placeholder} id="value">Fruit</SelectValue>
  {:else if content === "children"}
    <SelectValue {placeholder} id="value">
      {#snippet children(state)}
        <span
          data-value={JSON.stringify(state.value)}
          data-count={state.labels.length}
          data-placeholder={state.placeholder}
          >{state.label.toLowerCase() || placeholder}</span
        >
      {/snippet}
    </SelectValue>
  {:else if content === "render"}
    <SelectValue {placeholder} id="value">
      {#snippet render({ props, state, children })}
        <strong
          {...props}
          data-value={JSON.stringify(state.value)}
          data-label={state.label.toLowerCase()}
          data-count={state.labels.length}
          data-placeholder={state.placeholder}
          >{@render children?.(state)}</strong
        >
      {/snippet}
    </SelectValue>
  {:else}
    <SelectValue {placeholder} id="value" />
  {/if}
{/snippet}

{#if external}
  <SelectTrigger {controller} aria-label="Fruit"
    >{@render value()}</SelectTrigger
  >
  {#if connected || attached}
    <Select {controller} {items} value={selected} />
  {/if}
{:else}
  <Select {items} value={selected}>
    <SelectTrigger aria-label="Fruit">{@render value()}</SelectTrigger>
  </Select>
{/if}
