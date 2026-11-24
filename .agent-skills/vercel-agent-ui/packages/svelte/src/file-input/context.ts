import type { fileInput } from "@ui-sdk/core/file-input"
import { getContext } from "svelte"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type FileInputContext = PrimitiveHandle<typeof fileInput>

// The file of the item a part sits in, or of the list row it's rendered in,
// read when needed, so it follows a standalone item's new `file`.
const FileKey = Symbol("file-input-file")

/** The file a part shows: its own `file` prop, else the one its item or list row provides. */
function useItemFile(part: string, own: () => File | undefined) {
  const listed = getContext<(() => File) | undefined>(FileKey)
  return () => {
    const file = own() ?? listed?.()
    if (!file) {
      throw new Error(
        `${part} must be used inside <FileInputList>, or be given a file.`
      )
    }
    return file
  }
}

export { type FileInputContext, FileKey, useItemFile }
