<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
</script>

<div data-slot="stack" dir="rtl">
  <label data-slot="label">
    <Checkbox>
      <CheckboxIndicator>
        <CheckIcon />
      </CheckboxIndicator>
    </Checkbox>
    قبول الشروط والأحكام
  </label>
  <label data-slot="label">
    <Checkbox defaultChecked>
      <CheckboxIndicator>
        <CheckIcon />
      </CheckboxIndicator>
    </Checkbox>
    تفعيل الإشعارات
  </label>
</div>
