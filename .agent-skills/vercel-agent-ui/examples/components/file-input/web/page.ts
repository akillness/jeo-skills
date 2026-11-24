import "@ui-sdk/web/file-input"
import { createElement, File as FileIcon, Upload, X } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-file-input multiple>
      <div data-slot="row">
        <p data-slot="hint">Drop files anywhere.</p>
        <ui-file-input-trigger><button>Upload Files</button></ui-file-input-trigger>
      </div>
      <ui-file-input-dropzone target="document" data-variant="overlay">
        <div data-slot="stack">
          ${createElement(Upload, { "aria-hidden": "true" }).outerHTML}
          <p>Drop to attach</p>
        </div>
      </ui-file-input-dropzone>
      <ui-file-input-list aria-label="Attachments">
        <template>
          <ui-file-input-item>
            ${createElement(FileIcon, { "aria-hidden": "true" }).outerHTML}
            <span data-file="name"></span>
            <span data-file="size" data-slot="hint"></span>
            <ui-file-input-item-remove><button type="button">${createElement(X, { "aria-hidden": "true" }).outerHTML}</button></ui-file-input-item-remove>
          </ui-file-input-item>
        </template>
      </ui-file-input-list>
    </ui-file-input>
  `
}

export { mount }
