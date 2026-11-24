<script lang="ts">
  import { useHandlePart, usePrimitive } from "../../src/use-primitive.svelte"
  import { plot } from "./plot"

  let { onrender }: { onrender: () => void } = $props()

  const id = $props.id()
  const handle = usePrimitive(plot, () => ({ id }))
  const marker = useHandlePart(handle, "marker")
  export const api = handle.api

  const text = (state: typeof marker.state) => {
    onrender()
    return `${state.point.x},${state.points[0]!.x}`
  }
</script>

<output>{text(marker.state)}</output>
