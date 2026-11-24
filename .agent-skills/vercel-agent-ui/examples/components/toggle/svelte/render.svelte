<script lang="ts">
  import { HeartIcon } from "@lucide/svelte"
  import { Toggle, ToggleIcon } from "@ui-sdk/svelte/toggle"
</script>

<Toggle aria-label="Favorite">
  {#snippet render({ props, state })}
    <button {...props}>
      <ToggleIcon>
        <HeartIcon fill={state.pressed ? "currentColor" : "none"} />
      </ToggleIcon>
    </button>
  {/snippet}
</Toggle>
