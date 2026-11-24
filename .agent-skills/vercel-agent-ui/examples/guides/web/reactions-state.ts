import { createParts, wrappedButton } from "@ui-sdk/web"
import { reactions } from "../reactions-state"

createParts(reactions, {
  root: "state-reactions",
  reaction: { tag: "state-reaction", target: wrappedButton },
})

function mount(root: HTMLElement) {
  root.innerHTML = `
    <state-reactions>
      <state-reaction value="thumbs-up">
        <button>👍</button>
      </state-reaction>
      <state-reaction value="heart">
        <button>❤️</button>
      </state-reaction>
      <state-reaction value="laugh">
        <button>😂</button>
      </state-reaction>
      <state-reaction value="celebrate">
        <button>🎉</button>
      </state-reaction>
    </state-reactions>
  `
}

export { mount }
