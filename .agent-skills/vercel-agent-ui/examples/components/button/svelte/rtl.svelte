<script lang="ts">
  import { ChevronRightIcon } from "@lucide/svelte"
  import { Button } from "@ui-sdk/svelte/button"
</script>

<div data-slot="row" dir="rtl">
  <Button>
    متابعة
    <ChevronRightIcon />
  </Button>
  <Button>إلغاء</Button>
</div>
