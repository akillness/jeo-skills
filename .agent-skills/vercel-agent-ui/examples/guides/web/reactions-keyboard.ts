import { createParts, wrappedButton } from "@ui-sdk/web"
import { reactions } from "../reactions-keyboard"

createParts(reactions, {
  root: "keyed-reactions",
  reaction: { tag: "keyed-reaction", target: wrappedButton },
})

function mount(root: HTMLElement) {
  root.innerHTML = `
    <keyed-reactions>
      <keyed-reaction value="thumbs-up">
        <button>👍</button>
      </keyed-reaction>
      <keyed-reaction value="heart">
        <button>❤️</button>
      </keyed-reaction>
      <keyed-reaction value="laugh">
        <button>😂</button>
      </keyed-reaction>
      <keyed-reaction value="celebrate">
        <button>🎉</button>
      </keyed-reaction>
    </keyed-reactions>
  `
}

export { mount }
