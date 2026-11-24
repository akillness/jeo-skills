<script lang="ts">
  import {
    FileInput,
    FileInputDropzone,
    FileInputItem,
    FileInputItemRemove,
    FileInputList,
    FileInputTrigger,
  } from "../../src/file-input"

  let {
    which,
    files = [],
  }: {
    which: "named" | "disabled" | "list" | "render" | "forwarded" | "remove"
    files?: File[]
  } = $props()
</script>

{#if which === "named"}
  <FileInput name="files" accept="image/*" multiple required>
    <FileInputDropzone
      ><FileInputTrigger>Browse files</FileInputTrigger></FileInputDropzone
    >
  </FileInput>
{:else if which === "disabled"}
  <FileInput disabled><FileInputTrigger>Browse</FileInputTrigger></FileInput>
{:else if which === "list"}
  <FileInput multiple defaultValue={files}>
    <FileInputList>
      <FileInputItem>
        {#snippet children(state)}
          {state.file.name}
          <FileInputItemRemove>×</FileInputItemRemove>
        {/snippet}
      </FileInputItem>
    </FileInputList>
  </FileInput>
{:else if which === "render"}
  <FileInput name="files">
    {#snippet render({ props })}
      <section {...props}><FileInputTrigger>Browse</FileInputTrigger></section>
    {/snippet}
  </FileInput>
{:else if which === "forwarded"}
  <FileInput name="files">
    {#snippet render({ props, state, children })}
      <section {...props}>{@render children?.(state)}</section>
    {/snippet}
    <FileInputTrigger>Browse</FileInputTrigger>
  </FileInput>
{:else}
  <FileInput defaultValue={files}
    ><FileInputItemRemove file={files[0]}>×</FileInputItemRemove></FileInput
  >
{/if}
