# Spiders

Scrapling spiders are a Scrapy-inspired async crawling framework built on top of Scrapling's fetchers and parser.

## When to switch from fetchers to spiders

Use a spider when the job needs:

- multiple pages and link following
- concurrent request scheduling
- retry and blocked-response handling
- checkpoint pause or resume
- different session types in one crawl

For one or two isolated pages, plain fetchers are simpler.

## Minimal spider

```python
from scrapling.spiders import Spider, Response

class QuotesSpider(Spider):
    name = "quotes"
    start_urls = ["https://quotes.toscrape.com/"]
    concurrent_requests = 10

    async def parse(self, response: Response):
        for quote in response.css(".quote"):
            yield {
                "text": quote.css(".text::text").get(),
                "author": quote.css(".author::text").get(),
            }

        next_page = response.css(".next a::attr(href)").get()
        if next_page:
            yield response.follow(next_page)

result = QuotesSpider().start()
result.items.to_json("quotes.json")
```

## Mental model

The spider system is composed of:

- `Spider`: your crawl definition
- `Scheduler`: queued request storage with deduplication
- `Crawler Engine`: concurrency and callback orchestration
- `Session Manager`: routes requests to the correct fetcher session
- checkpoint storage: saves pending requests and seen fingerprints to disk

## Sessions inside spiders

Spiders can use multiple named sessions, including:

- `FetcherSession`
- `AsyncDynamicSession`
- `AsyncStealthySession`

Requests choose the session by `sid`, which lets the same spider mix cheap HTTP paths with heavier browser paths only where needed.

## Pause and resume

Use `crawldir` when the crawl must resume after interruption.

- Pending requests and seen fingerprints are checkpointed
- Graceful shutdown writes a final checkpoint
- Restarting with the same `crawldir` resumes instead of rebuilding `start_requests()`

This is the Scrapling equivalent of job-directory style crawling.

## Hooks and control points

Useful spider customization areas include:

- `start_requests()`
- `parse()` and additional callbacks
- blocked-response detection or retry logic
- item export through `result.items.to_json()` or `.to_jsonl()`
- streaming flows via `async for item in spider.stream()`

## Practical recommendations

- Keep concurrency modest until the target site proves stable
- Route only the hard pages through stealth sessions
- Use `allowed_domains` and explicit follow logic to keep scope clean
- Turn on checkpointing for long-running crawls or unstable networks
