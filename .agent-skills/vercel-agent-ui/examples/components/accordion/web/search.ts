import "@ui-sdk/web/accordion"
import { ChevronDown, createElement } from "lucide"

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

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

const highlighted = (text: string, query: string) =>
  highlight(text, query)
    .map((part) =>
      part.match ? `<mark>${escape(part.text)}</mark>` : escape(part.text)
    )
    .join("")

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div>
      <div data-slot="controls">
        <input type="search" aria-label="Search questions" placeholder="Search questions…" />
      </div>
      <ui-accordion multiple>
        ${faq
          .map(
            (question) => `
              <ui-accordion-item value="${question.value}">
                <ui-accordion-header>
                  <h3>
                    <ui-accordion-trigger>
                      <button type="button" aria-expanded="false">
                        <span>${question.question}</span>
                        ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
                      </button>
                    </ui-accordion-trigger>
                  </h3>
                </ui-accordion-header>
                <ui-accordion-panel hidden>
                  ${question.answer}
                </ui-accordion-panel>
              </ui-accordion-item>`
          )
          .join("")}
      </ui-accordion>
      <p data-slot="hint" role="status"></p>
    </div>
  `
  const accordion = root.querySelector("ui-accordion")!
  const status = root.querySelector("[role=status]")!
  root.querySelector("input")!.addEventListener("input", (event) => {
    const query = (event.target as HTMLInputElement).value
    const results = faq.filter((question) => matches(question, query))
    for (const question of faq) {
      const element = accordion.querySelector<HTMLElement>(
        `ui-accordion-item[value="${question.value}"]`
      )!
      element.hidden = !results.includes(question)
      element.querySelector("button > span")!.innerHTML = highlighted(
        question.question,
        query
      )
      element.querySelector("ui-accordion-panel")!.innerHTML = highlighted(
        question.answer,
        query
      )
    }
    accordion.value = query.trim()
      ? results.map((question) => question.value)
      : []
    status.textContent = results.length ? "" : `No questions match “${query}”.`
  })
}

export { mount }
