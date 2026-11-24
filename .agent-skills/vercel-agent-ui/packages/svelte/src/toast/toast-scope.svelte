<script lang="ts">
  import type { Toast as ToastData } from "@ui-sdk/core/toast"
  import { setContext, untrack, type Snippet } from "svelte"
  import {
    ToastKey,
    type RegionHandle,
    type ToastContent,
    type ToastContext,
  } from "./context"

  // Provides one toast to the parts inside it. The region is read once: a
  // toast belongs to one region for its life.
  let {
    region,
    toast,
    children,
  }: {
    region: RegionHandle
    toast: ToastData<ToastContent>
    children: Snippet
  } = $props()

  setContext<ToastContext>(ToastKey, {
    region: untrack(() => region),
    toast: () => toast,
  })
</script>

{@render children()}
