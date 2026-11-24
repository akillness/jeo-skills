<!--
@component
The root: a box for the image and its fallback.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    avatar as avatarPrimitive,
    type AvatarLoadingStatus,
    type AvatarLoadingStatusChangeReason,
    type AvatarState,
  } from "@ui-sdk/core/avatar"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  let {
    debug,
    onLoadingStatusChange,
    ...rest
  }: PartProps<"span", AvatarState> & {
    /** Logs every status change with its reason. */
    debug?: boolean
    /** Runs when the image's loading status changes: `"loading"` when it gets a source, `"loaded"`, `"error"`, and `"idle"` when it leaves the page. */
    onLoadingStatusChange?: (
      status: AvatarLoadingStatus,
      details: ChangeDetails<AvatarLoadingStatusChangeReason>
    ) => void
  } = $props()

  const id = $props.id()
  const avatar = usePrimitive(avatarPrimitive, () => ({
    id,
    debug,
    onLoadingStatusChange,
  }))
  provideInstance(avatarPrimitive, avatar)
  const root = useHandlePart(avatar, "root")
</script>

<Part tag="span" part={root} props={rest} />
