<script lang="ts">
  import type { Attachment } from "svelte/attachments"
  import { OTPInput } from "../../src/otp-input"

  // An attachment beside an attribute OTPInput moves to its input.
  let { attach }: { attach: Attachment<HTMLElement> } = $props()
</script>

<OTPInput maxLength={4} aria-label="Code" {@attach attach} />
