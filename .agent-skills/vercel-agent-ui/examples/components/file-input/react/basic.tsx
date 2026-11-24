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
      <FileInputDropzone>
        <UploadIcon aria-hidden="true" />
        <p>Drag and drop files here</p>
        <p data-slot="hint">Or paste them from your clipboard.</p>
        <FileInputTrigger>Browse Files</FileInputTrigger>
      </FileInputDropzone>
      <FileInputList aria-label="Files">
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
