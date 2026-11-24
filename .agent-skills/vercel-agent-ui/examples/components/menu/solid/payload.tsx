import {
  createMenuController,
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@ui-sdk/solid/menu"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

type File = { name: string; size: string }

const files: File[] = [
  { name: "Roadmap.pdf", size: "2.4 MB" },
  { name: "Budget.xlsx", size: "860 KB" },
  { name: "Team photo.jpg", size: "5.1 MB" },
]

function Example() {
  const menu = createMenuController<File>()
  const log = useLog()

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          onClick={async (event) => {
            const result = await menu.open({
              payload: files[0],
              anchor: event.currentTarget,
            })
            log(`Closed with ${result.reason}`)
          }}
        >
          Open {files[0].name} Actions
        </button>
      </div>
      <ul data-slot="list">
        <For each={files}>
          {(file) => (
            <li data-slot="row">
              {file.name}
              <span data-slot="hint">{file.size}</span>
              <MenuTrigger
                controller={menu}
                payload={file}
                aria-label={`Actions for ${file.name}`}
                data-variant="ghost"
                data-size="sm"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="19" cy="12" r="1" />
                  <circle cx="5" cy="12" r="1" />
                </svg>
              </MenuTrigger>
            </li>
          )}
        </For>
      </ul>
      <Menu
        controller={menu}
        onAction={(action) => log(`${action} ${menu.getPayload()?.name}`)}
      >
        <MenuContent<File> align="end">
          {(state) => (
            <>
              <MenuGroup>
                <MenuGroupLabel>{state.payload?.name}</MenuGroupLabel>
                <MenuItem value="open">Open</MenuItem>
                <MenuItem value="rename">Rename</MenuItem>
                <MenuItem value="duplicate">Duplicate</MenuItem>
              </MenuGroup>
              <MenuSeparator />
              <MenuItem value="delete">Delete</MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
    </div>
  )
}

export { Example }
