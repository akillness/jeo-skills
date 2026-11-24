<script lang="ts">
  import { Button } from "@ui-sdk/svelte/button"
</script>

<div data-slot="row">
  <Button>
    {#snippet render({ props })}<a {...props} href="#installation"
        >Get Started</a
      >{/snippet}
  </Button>
  <Button disabled>
    {#snippet render({ props })}<a {...props} href="#changelog">Changelog</a
      >{/snippet}
  </Button>
</div>
