import {
  FileInput,
  FileInputDropzone,
  FileInputItem,
  FileInputItemRemove,
  FileInputList,
  FileInputTrigger,
  formatFileSize,
} from "@ui-sdk/react/file-input"
import { FileIcon, UploadIcon, XIcon } from "lucide-react"

function Example() {
  return (
    <FileInput multiple>
      <div data-slot="row">
        <p data-slot="hint">Drop files anywhere.</p>
        <FileInputTrigger>Upload Files</FileInputTrigger>
      </div>
      <FileInputDropzone target="document" data-variant="overlay">
        <div data-slot="stack">
          <UploadIcon aria-hidden="true" />
          <p>Drop to attach</p>
        </div>
      </FileInputDropzone>
      <FileInputList aria-label="Attachments">
        <FileInputItem>
          {({ file }) => (
            <>
              <FileIcon aria-hidden="true" />
              <span>{file.name}</span>
              <span data-slot="hint">{formatFileSize(file.size)}</span>
              <FileInputItemRemove>
                <XIcon aria-hidden="true" />
              </FileInputItemRemove>
            </>
          )}
        </FileInputItem>
      </FileInputList>
    </FileInput>
  )
}

export { Example }
