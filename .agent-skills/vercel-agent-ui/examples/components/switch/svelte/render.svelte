<script lang="ts">
  import { MoonIcon, SunIcon } from "@lucide/svelte"
  import { Switch, SwitchThumb } from "@ui-sdk/svelte/switch"
</script>

<label data-slot="label">
  Dark mode
  <Switch>
    <SwitchThumb>
      {#snippet render({ props, state })}
        <span {...props}>
          {#if state.checked}<MoonIcon aria-hidden="true" />{:else}<SunIcon
              aria-hidden="true"
            />{/if}
        </span>
      {/snippet}
    </SwitchThumb>
  </Switch>
</label>
