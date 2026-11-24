import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/solid/accordion"
import { createSignal, For } from "solid-js"

const faq = [
  {
    value: "returns",
    question: "What is your return policy?",
    answer:
      "Return any unused item within 30 days. Once it reaches us, your refund is on its way.",
  },
  {
    value: "refunds",
    question: "How long do refunds take?",
    answer:
      "Refunds reach your card within 5 to 7 business days after we receive the item.",
  },
  {
    value: "shipping",
    question: "Do you ship internationally?",
    answer:
      "We ship to 40 countries. Duties are included in the price at checkout.",
  },
  {
    value: "tracking",
    question: "How do I track my order?",
    answer:
      "Every shipping email has a tracking link. You'll also find it under Orders.",
  },
  {
    value: "exchange",
    question: "Can I exchange an item for another size?",
    answer:
      "Yes. Start a return, choose Exchange and pick the new size. Shipping is free.",
  },
  {
    value: "gift",
    question: "Can I send an order as a gift?",
    answer:
      "Add a gift note at checkout and we'll leave the prices off the packing slip.",
  },
]

function matches(question: (typeof faq)[number], query: string) {
  const search = query.trim().toLowerCase()
  return (
    !search ||
    question.question.toLowerCase().includes(search) ||
    question.answer.toLowerCase().includes(search)
  )
}

function highlight(text: string, query: string) {
  const search = query.trim().toLowerCase()
  if (!search) {
    return [{ text, match: false }]
  }
  const parts: { text: string; match: boolean }[] = []
  let start = 0
  for (let index = text.toLowerCase().indexOf(search); index !== -1;) {
    if (index > start) {
      parts.push({ text: text.slice(start, index), match: false })
    }
    parts.push({ text: text.slice(index, index + search.length), match: true })
    start = index + search.length
    index = text.toLowerCase().indexOf(search, start)
  }
  if (start < text.length) {
    parts.push({ text: text.slice(start), match: false })
  }
  return parts
}

function Highlight(props: { text: string; query: string }) {
  return (
    <For each={highlight(props.text, props.query)}>
      {(part) => (part.match ? <mark>{part.text}</mark> : part.text)}
    </For>
  )
}

function Example() {
  const [query, setQuery] = createSignal("")
  const [value, setValue] = createSignal<string[]>([])
  const results = () => faq.filter((question) => matches(question, query()))

  return (
    <div>
      <div data-slot="controls">
        <input
          type="search"
          aria-label="Search questions"
          placeholder="Search questions…"
          value={query()}
          onInput={(event) => {
            const next = event.currentTarget.value
            setQuery(next)
            setValue(
              next.trim()
                ? faq
                    .filter((question) => matches(question, next))
                    .map((question) => question.value)
                : []
            )
          }}
        />
      </div>
      <Accordion multiple value={value()} onValueChange={setValue}>
        <For each={results()}>
          {(question) => (
            <AccordionItem value={question.value}>
              <AccordionHeader>
                <AccordionTrigger>
                  <span>
                    <Highlight text={question.question} query={query()} />
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel>
                <Highlight text={question.answer} query={query()} />
              </AccordionPanel>
            </AccordionItem>
          )}
        </For>
      </Accordion>
      <p data-slot="hint" role="status">
        {results().length === 0 ? `No questions match “${query()}”.` : ""}
      </p>
    </div>
  )
}

export { Example }
