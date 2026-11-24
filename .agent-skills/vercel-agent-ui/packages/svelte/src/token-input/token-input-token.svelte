<!--
@component
A token's content, inside the `token` snippet, with its state for styling.
@stable
-->
<script lang="ts">
  import {
    tokenInput,
    type TokenInputTokenState,
  } from "@ui-sdk/core/token-input"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useTokenId } from "./context"

  let props: PartProps<"span", TokenInputTokenState> = $props()

  const input = useHandle(tokenInput)
  const id = useTokenId("TokenInputToken")
  const token = useHandlePart(input, "token", () => ({ id, token: id }))
</script>

<Part tag="span" part={token} {props} />
