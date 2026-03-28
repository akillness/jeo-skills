# Parser and Adaptive Scraping

Every fetcher returns a `Response` object, and `Response` inherits Scrapling's `Selector` parsing engine.

## Selection primitives

Supported selection patterns:

- CSS selectors: `page.css(".product")`
- XPath selectors: `page.xpath("//article")`
- Text nodes: `page.css("h1::text").get()`
- Attribute values: `page.css("a::attr(href)").getall()`
- Text search: `find_by_text(...)`
- Regex search: `find_by_regex(...)`
- Similar elements: `element.find_similar(...)`

Scrapling's docs are centered on HTML parsing. XML feeds are not the current target surface.

Useful reminders:

- `css()` and `xpath()` return selector collections
- `.get()` and `.getall()` are the most convenient for text or attribute extraction
- `find_similar()` is useful after locating one representative item by text or regex

## Adaptive scraping

Adaptive scraping lets Scrapling relocate changed elements without using an LLM.

Two phases:

1. Save an element fingerprint
2. Match a future element with similar properties

### CSS or XPath flow

```python
from scrapling.fetchers import Fetcher

Fetcher.configure(adaptive=True)
page = Fetcher.get("https://example.com")

original = page.css("#primary-cta", auto_save=True)
recovered = page.css("#primary-cta", adaptive=True)
```

Key points:

- `adaptive=True` must be enabled globally or in selector config
- `auto_save=True` stores the current matched element
- later, `adaptive=True` tells Scrapling to relocate the element if the original selector stops matching

### Manual save and relocate flow

Use this when the original element was found by text, regex, or another indirect method.

```python
element = page.find_by_text("Tipping the Velvet", first_match=True)
page.save(element, "featured-book")
saved = page.retrieve("featured-book")
matches = page.relocate(saved, selector_type=True)
```

### `adaptive_domain`

Use `adaptive_domain` when equivalent pages live on different domains or archival hosts and should share the same adaptive fingerprint store.

This is especially useful for:

- archived vs live versions of the same site
- domain migrations
- CDN or locale host changes

Adaptive scraping is not automatic magic:

- you must enable `adaptive=True`
- you must save an element first through `auto_save=True` or manual `save()`
- relocation quality still depends on the surviving similarity of the target element

## Similar-element discovery

`find_similar()` is useful when you have one known good element and need its peers.

Typical pattern:

1. find a product link by text
2. call `.find_similar()` on that element
3. iterate the sibling product cards

This is often easier than writing brittle container selectors from scratch.

## Practical recommendations

- Use CSS first; drop to XPath when CSS becomes awkward
- Save adaptive fingerprints only for selectors that repeatedly break
- Keep identifiers meaningful when using manual adaptive storage
- Prefer text or attribute extraction over raw HTML blobs unless structure inspection is required
