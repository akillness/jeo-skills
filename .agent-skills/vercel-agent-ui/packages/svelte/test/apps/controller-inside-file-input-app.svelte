<script lang="ts">
  import type { FileInputController } from "@ui-sdk/core/file-input"
  import { FileInput, FileInputTrigger } from "../../src/file-input"

  let { other }: { other: FileInputController } = $props()
</script>

<FileInput name="around"
  ><FileInputTrigger controller={other} id="trigger">Browse</FileInputTrigger
  ></FileInput
>
<FileInput controller={other} name="other" />
