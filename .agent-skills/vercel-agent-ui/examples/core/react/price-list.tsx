import * as React from "react"
import { definePrimitive, pageLocale, userLocale } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

const priceList = definePrimitive({
  name: "price-list",
  state: () => ({}),
  api: () => ({}),
  slots: (slot) => ({
    root: slot({}),
    language: slot({
      bind: (el) => {
        el.textContent = `Page: ${pageLocale(el)}, you: ${userLocale()}`
      },
    }),
    price: slot<{ amount: number }>({
      props: { amount: "number" },
      bind: (el, part) => {
        const format = new Intl.NumberFormat(pageLocale(el), {
          style: "currency",
          currency: "EUR",
        })
        el.textContent = format.format(part.props.amount)
      },
    }),
    names: slot<{ names: string[] }>({
      props: { names: "list" },
      bind: (el, part) => {
        const locale = pageLocale(el)
        const sorted = [...part.props.names].sort(
          new Intl.Collator(locale).compare
        )
        el.textContent = new Intl.ListFormat(locale).format(sorted)
      },
    }),
  }),
})

const parts = createParts(priceList, {
  root: "div",
  language: "p",
  price: "p",
  names: "p",
})

const PriceList = parts.Root

const PriceListLanguage = parts.Language

const PriceListPrice = parts.Price

const PriceListNames = parts.Names

const languages = {
  "en-US": "English",
  "de-DE": "Deutsch",
  "sv-SE": "Svenska",
  "ar-EG": "العربية",
}

function Example() {
  const [lang, setLang] = React.useState("en-US")
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <select
          aria-label="Language"
          value={lang}
          onChange={(event) => setLang(event.target.value)}
        >
          {Object.entries(languages).map(([tag, name]) => (
            <option key={tag} value={tag}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div lang={lang}>
        <PriceList key={lang}>
          <PriceListPrice amount={1234.5} data-price />
          <PriceListNames names={["Örjan", "Zoë", "Åsa", "Anna"]} data-names />
          <PriceListLanguage data-language />
        </PriceList>
      </div>
    </div>
  )
}

export {
  Example,
  priceList,
  PriceList,
  PriceListLanguage,
  PriceListNames,
  PriceListPrice,
}
