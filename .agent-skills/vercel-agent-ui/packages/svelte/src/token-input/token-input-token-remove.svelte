<!--
@component
Removes its token when pressed. Hidden from assistive technology: the keyboard's way is Backspace.
@stable
-->
<script lang="ts">
  import { tokenInput } from "@ui-sdk/core/token-input"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useTokenId } from "./context"

  let props: PartProps<"span"> = $props()

  const input = useHandle(tokenInput)
  const id = useTokenId("TokenInputTokenRemove")
  const remove = useHandlePart(input, "token-remove", () => ({ id, token: id }))
</script>

<Part tag="span" part={remove} {props} />
