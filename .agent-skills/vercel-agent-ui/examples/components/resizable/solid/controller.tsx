import {
  createResizableController,
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/solid/resizable"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const editor = createResizableController()
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          type="button"
          onClick={() => editor.collapse("controller-sidebar")}
        >
          Collapse
        </button>
        <button
          type="button"
          onClick={() => editor.expand("controller-sidebar")}
        >
          Expand
        </button>
        <button
          type="button"
          onClick={() => editor.resize("controller-sidebar", "240px")}
        >
          240px
        </button>
        <button
          type="button"
          onClick={() =>
            log(
              `Layout ${editor.getLayout().map(Math.round).join(" / ")}${editor.isCollapsed("controller-sidebar") ? ", collapsed" : ""}`
            )
          }
        >
          Read
        </button>
      </div>
      <Resizable controller={editor}>
        <ResizablePanel
          id="controller-sidebar"
          defaultSize={30}
          minSize={20}
          collapsible
        >
          <h3>Files</h3>
          <ul>
            <li>page.tsx</li>
            <li>layout.tsx</li>
            <li>globals.css</li>
          </ul>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize files" />
        <ResizablePanel minSize={30}>
          <h3>page.tsx</h3>
          <span data-slot="hint">Saved just now</span>
        </ResizablePanel>
      </Resizable>
    </div>
  )
}

export { Example }
