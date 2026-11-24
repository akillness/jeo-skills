<script lang="ts">
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import { Textarea } from "@ui-sdk/svelte/textarea"
</script>

<Field dir="rtl" name="feedback">
  <FieldLabel>ملاحظاتك</FieldLabel>
  <Textarea autoResize placeholder="أخبرنا برأيك…" />
  <FieldDescription>نقرأ كل رسالة.</FieldDescription>
</Field>
