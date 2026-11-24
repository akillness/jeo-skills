import * as React from "react"
import { createRovingFocus, definePrimitive, selects } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type TagListOptions = {
  onAdd?: (tag: string) => void
  onCountChange?: (count: number) => void
}

type TagListState = { focused: string | null }

const tagList = definePrimitive({
  name: "tag-list",
  options: { onAdd: "callback", onCountChange: "callback" },
  state: (_options: TagListOptions): TagListState => ({ focused: null }),
  api: (context) => {
    const roving = createRovingFocus<TagListState, { value: string }>(context, {
      slot: "tag",
      key: "focused",
      orientation: () => "horizontal",
      onItemsChange: () =>
        context.options().onCountChange?.(roving.items().length),
    })
    return {
      roving,
      add(input: HTMLInputElement) {
        const tag = input.value.trim()
        if (!tag) {
          return
        }
        context.options().onAdd?.(tag)
        input.value = ""
        roving.focus(tag)
      },
    }
  },
  slots: (slot) => ({
    root: slot({}),
    input: slot({
      on: {
        keydown: (event, { el, api }) => {
          if (event.key !== "Enter") {
            return
          }
          event.preventDefault()
          api.add(el as HTMLInputElement)
        },
      },
    }),
    list: slot({}),
    tag: slot<{ value: string }>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        type: "button",
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      on: { keydown: (event, { el, api }) => api.roving.keydown(event, el!) },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(tagList, {
  root: "div",
  input: "input",
  list: "div",
  tag: "button",
})

const TagList = parts.Root

const TagListInput = parts.Input

const TagListList = parts.List

const TagListTag = parts.Tag

function Example() {
  const log = useLog()
  const [tags, setTags] = React.useState(["design", "docs"])
  return (
    <TagList
      onAdd={(tag: string) =>
        setTags((tags) => (tags.includes(tag) ? tags : [...tags, tag]))
      }
      onCountChange={(count: number) =>
        log(`${count} ${count === 1 ? "tag" : "tags"}`)
      }
    >
      <TagListInput
        aria-label="New tag"
        placeholder="Type a tag and press Enter"
      />
      <TagListList role="group" aria-label="Tags">
        {tags.map((tag) => (
          <TagListTag data-size="sm" key={tag} value={tag}>
            {tag}
          </TagListTag>
        ))}
      </TagListList>
    </TagList>
  )
}

export {
  Example,
  tagList,
  TagList,
  TagListInput,
  TagListList,
  type TagListOptions,
  TagListTag,
}
