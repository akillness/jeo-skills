import { createParts, wrappedButton } from "@ui-sdk/web"
import { reactions } from "../reactions"

createParts(reactions, {
  root: "my-reactions",
  reaction: { tag: "my-reaction", target: wrappedButton },
})

function mount(root: HTMLElement) {
  root.innerHTML = `
    <my-reactions aria-label="Reactions">
      <my-reaction value="thumbs-up">
        <button aria-label="Thumbs up">👍</button>
      </my-reaction>
      <my-reaction value="heart">
        <button aria-label="Heart">❤️</button>
      </my-reaction>
      <my-reaction value="laugh">
        <button aria-label="Laugh">😂</button>
      </my-reaction>
      <my-reaction value="celebrate">
        <button aria-label="Celebrate">🎉</button>
      </my-reaction>
    </my-reactions>
  `
}

export { mount }
