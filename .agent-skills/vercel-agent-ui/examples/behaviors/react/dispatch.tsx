import * as React from "react"
import { definePrimitive, dispatch, type ChangeDetails } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type FileListState = { files: string[] }

type FileListOptions = {
  defaultFiles: string[]
  onDelete?: (file: string, details: ChangeDetails<"delete-press">) => void
}

const fileList = definePrimitive({
  name: "file-list",
  options: { defaultFiles: "list", onDelete: "callback" },
  state: (options: FileListOptions): FileListState => ({
    files: options.defaultFiles,
  }),
  api: (context) => {
    const { store } = context
    return {
      remove(file: string, event?: Event) {
        if (
          dispatch(context, "onDelete", file, { reason: "delete-press", event })
        ) {
          return
        }
        store.set({
          files: store.get().files.filter((other) => other !== file),
        })
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, { files: string[] }>({
      state: (state) => ({ files: state.files }),
      attrs: () => ({ role: "list" }),
    }),
    file: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ role: "listitem" }),
    }),
    delete: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (_state, { key }) => ({
        type: "button",
        "aria-label": `Delete ${key}`,
      }),
      press: ({ api, key }, event) => api.remove(key, event),
    }),
  }),
})

const parts = createParts(fileList, {
  root: "div",
  file: "div",
  delete: "button",
})

const FileList = parts.Root

const FileListItem = parts.File

const FileListDelete = parts.Delete

function Example() {
  const log = useLog()
  return (
    <FileList
      aria-label="Files"
      defaultFiles={["README.md", "notes.txt", "draft.md"]}
      onDelete={(file, details) => {
        if (file === "README.md") {
          details.cancel()
          log("Canceled: the readme stays")
        } else {
          log(`Deleted ${file}`)
        }
      }}
    >
      {({ files }) =>
        files.map((file) => (
          <FileListItem key={file} value={file}>
            {file}
            <FileListDelete value={file}>Delete</FileListDelete>
          </FileListItem>
        ))
      }
    </FileList>
  )
}

export {
  Example,
  fileList,
  FileList,
  FileListDelete,
  FileListItem,
  type FileListOptions,
  type FileListState,
}
