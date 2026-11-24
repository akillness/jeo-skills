import "@ui-sdk/web/file-input"
import { createElement, File as FileIcon, Upload, X } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-file-input multiple>
      <ui-file-input-dropzone>
        ${createElement(Upload, { "aria-hidden": "true" }).outerHTML}
        <p>Drag and drop files here</p>
        <p data-slot="hint">Or paste them from your clipboard.</p>
        <ui-file-input-trigger><button>Browse Files</button></ui-file-input-trigger>
      </ui-file-input-dropzone>
      <ui-file-input-list aria-label="Files">
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
