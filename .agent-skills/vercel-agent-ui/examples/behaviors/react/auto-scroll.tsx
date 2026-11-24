import * as React from "react"
import {
  bindDrag,
  bindDragPreview,
  createAutoScroll,
  createChange,
  definePrimitive,
  dragThreshold,
  type ChangeDetails,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { BookmarkIcon } from "lucide-react"
import { useLog } from "../../shared/react/log"

type BookState = { bookmark: string | null; over: string | null }

type BookOptions = {
  onBookmarkChange?: (
    bookmark: string | null,
    details: ChangeDetails<"drag">
  ) => void
}

const book = definePrimitive({
  name: "book",
  options: { onBookmarkChange: "callback" },
  state: (_options: BookOptions): BookState => ({ bookmark: null, over: null }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    let stop: (() => void) | undefined
    context.onDestroy(() => stop?.())
    return {
      pointerdown(event: PointerEvent, el: HTMLElement) {
        if (event.button !== 0) {
          return
        }
        let preview: ReturnType<typeof bindDragPreview> | undefined
        let pointer = { x: event.clientX, y: event.clientY }
        const findChapter = () => {
          const hit = document
            .elementFromPoint(pointer.x, pointer.y)
            ?.closest<HTMLElement>("[data-chapter]")
          store.set({ over: hit?.dataset.chapter ?? null })
        }
        const scroll = createAutoScroll({
          edge: 48,
          speed: 16,
          ignore: () => preview?.el,
          onScroll: findChapter,
        })
        stop?.()
        stop = bindDrag(el, event, {
          threshold: dragThreshold,
          cancelOnEscape: true,
          onStart: () => {
            preview = bindDragPreview(el, pointer)
          },
          onMove: ({ x, y }) => {
            pointer = { x, y }
            preview?.move(x, y)
            scroll.update(x, y)
            findChapter()
          },
          onEnd: (end, canceled) => {
            const { over } = store.get()
            scroll.stop()
            preview?.remove()
            stop = undefined
            store.set({ over: null })
            if (preview && over && !canceled) {
              change("bookmark", over, { reason: "drag", event: end })
            }
          },
        })
      },
    }
  },
  slots: (slot) => ({
    bookmark: slot({
      attrs: () => ({
        type: "button",
        style: "touch-action:none;user-select:none",
      }),
      on: { pointerdown: (event, { el, api }) => api.pointerdown(event, el!) },
    }),
    chapters: slot({ attrs: () => ({ role: "list" }) }),
    chapter: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        role: "listitem",
        "data-chapter": part.key,
        "data-over": state.over === part.key ? "" : undefined,
        "data-bookmarked": state.bookmark === part.key ? "" : undefined,
      }),
    }),
  }),
})

const parts = createParts(book, {
  bookmark: "button",
  chapters: "div",
  chapter: "div",
})

const Book = parts.Root

const BookBookmark = parts.Bookmark

const BookChapters = parts.Chapters

const BookChapter = parts.Chapter

const chapters = Array.from(
  { length: 24 },
  (_, index) => `Chapter ${index + 1}`
)

function Example() {
  const log = useLog()
  return (
    <Book
      onBookmarkChange={(bookmark) =>
        log(bookmark ? `Bookmarked ${bookmark}` : "Removed the bookmark")
      }
    >
      <div data-slot="stack">
        <BookBookmark data-size="sm">
          <BookmarkIcon aria-hidden="true" />
          Bookmark
        </BookBookmark>
        <BookChapters aria-label="Chapters">
          {chapters.map((chapter) => (
            <BookChapter key={chapter} value={chapter}>
              {chapter}
            </BookChapter>
          ))}
        </BookChapters>
      </div>
    </Book>
  )
}

export { Example }
