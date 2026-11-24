<script lang="ts">
  import { Calendar } from "../../src/calendar"

  let {
    months,
    defaultValue,
    defaultMonth,
  }: { months?: number; defaultValue?: string; defaultMonth?: string } =
    $props()
</script>

<Calendar {months} {defaultValue} {defaultMonth} />
