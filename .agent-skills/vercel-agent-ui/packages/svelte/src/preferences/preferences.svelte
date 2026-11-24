<!--
@component
Shows preferences on `data-*` attributes, so CSS styles by them from the first paint: global ones on `<html>`,
the rest on its own element, which has `display: contents`. On the server it renders one inline script as its
first child, which puts every saved value on its attribute as the page loads, before hydration. Content that
reads a preference, through `usePreference`, catches up after hydration.
@experimental
-->
<script lang="ts">
  import { preferencesScript, type PreferenceLike } from "@ui-sdk/core"
  import type { Snippet } from "svelte"
  import type { HTMLAttributes } from "svelte/elements"

  let {
    preferences,
    nonce,
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
    /** The preferences to show, from `createPreference` or `createColorScheme`. */
    preferences: readonly PreferenceLike[]
    /** The nonce your Content Security Policy gives inline scripts. */
    nonce?: string
    children?: Snippet
  } = $props()

  let element: HTMLDivElement | undefined = $state()
  // The script is in the server's HTML until mounted. A client-only render
  // drops it right away, and the browser never runs a script Svelte inserts.
  let mounted = $state(false)

  // The server renders the defaults. In the browser the effect below writes
  // them, never the template, since hydrating it would put the server's
  // values back over the ones the script put there.
  const server = $derived.by(() => {
    const shown: Record<string, string> = {}
    if (typeof window === "undefined") {
      for (const preference of preferences) {
        if (!preference.global) {
          shown[preference.attribute] = preference.initialState.value
        }
      }
    }
    return shown
  })

  // Escaped, since `{@html}` writes it as it is.
  const nonceAttribute = $derived(
    nonce
      ? ` nonce="${nonce.replace(/[&"<>]/g, (char) => `&#${char.charCodeAt(0)};`)}"`
      : ""
  )
  const script = $derived(
    `<script${nonceAttribute}>${preferencesScript(preferences)}<\/script>`
  )

  $effect(() => {
    const list = preferences
    const write = () => {
      for (const preference of list) {
        ;(preference.global ? document.documentElement : element)?.setAttribute(
          preference.attribute,
          preference.get().value
        )
      }
    }
    // Subscribing first reads back what was saved.
    const stops = list.map((preference) => preference.subscribe(write))
    write()
    mounted = true
    return () => stops.forEach((stop) => stop())
  })
</script>

<div
  {...rest}
  {...server}
  data-slot="preferences"
  style="display: contents"
  bind:this={element}
>
  {#if !mounted}{@html script}{/if}
  {@render children?.()}
</div>
