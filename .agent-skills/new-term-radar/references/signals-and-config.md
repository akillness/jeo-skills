# New Term Radar Signals, Keyword Table, Config, and MCP Reference

## Signals Overview

| Signal | Source | Key Required | Cadence |
|---|---|---|---|
| ① X & Hugging Face | X accounts + HF top 50 Models/Spaces | AIsa (X only); HF free | Hourly / daily (`sources`) |
| ② GitHub Breakout | Repos <14d old with 200+/day or +400/day stars | Free (`GITHUB_TOKEN` optional) | Daily |
| ③ Sitemaps & New Sites | Configured tool/MCP sitemaps; <90d domains ranking 20+ kw | Sitemaps free; New Sites AIsa | Daily / weekly |
| ④ Search Console | Queries with first-time impressions | Google OAuth (`gsc_token.json`) | Daily |
| ⑤ Review | 14-day DataForSEO Trends check vs baseline | AIsa | Daily |
| ⑥ Revenue | TrustMRR fastest growing ($500+/30d) & newest | `TRUSTMRR_API_KEY` | Weekly |
| ⑦ Asks | Reddit/X/SE/Freelancer tool requests + optional AI answers | AIsa | Weekly |
| ⑧ Sellers & ⑧b Builders | First payment links (Stripe/Polar/Gumroad/Lemon Squeezy/Paddle/etc.) & Lovable/v0/beehiiv | AIsa (+ GoAnyAPI optional) | Weekly |
| ⑨ Just Listed | Product Hunt, Show HN, OpenRouter, Civitai, App Store, awesome lists | Free (paid dirs use AIsa/GoAnyAPI) | Daily / weekly |
| ⑩ Money & Sidelights | Ads.txt AdSense IDs, Ads Transparency, whois/crt.sh, Wikipedia, Discord | AIsa / GoAnyAPI | Weekly / daily |

## Keyword Priority Table Decisions
- **Decisions:** `prioritize` (rose in last 30d, still up, >= `min_daily`), `watch` (smaller/early/flat steady demand), `skip` (fading or small), `watch ↓` (`prioritize` downgraded because page one is `crowded`).
- **Actions (with `yours` / `gsc`):** `→ update yours` (on page 1), `→ improve yours` (avg pos 11–30), `→ new page` (not ranking top 30).
- **KGR (`pages built / monthly searches`):** `< 0.25` strong, `<= 1.0` watch, `> 1.0` skip.
- **SERP Shape:** `platform-held` (>=50% on GitHub/Medium/Reddit/YouTube/Wikipedia), `beatable` (mostly inner pages, no exact-match homepage), `contested`.
- **Media & Opportunity Marks:** `🎬` video, `🎙` voice, `🖼` image, `⚡` 1,000+ like manual workflow walkthrough, `🔎` Trends related query, `🆕` first searched within 180 days, `⚠` incumbent-brand phrase.

## Key `config.json` Sections
`lang`, `x_accounts` (`labs`, `bloggers`), `sitemaps` (`index`, `shards`, `pause`, `strip_locale`), `topics`, `known_terms`, `stop_words`, `judge`, `breakout`, `new_sites`, `review`, `usecases`, `word_age`, `markets`, `serp_shape`, `yours`, `year_curve`, `dot_com`, `ai_answers`, `gsc`.

## MCP Server Configuration
- **Command:** `uvx --with mcp new-term-radar==0.6.1 mcp` (or `new-term-radar-mcp` after `pip install "new-term-radar[mcp]"`)
- **Tools:** `recent_leads` (free, instant), `keyword_table` (40–90s/name), `run_radar` (5–15m).
- **Codex (`~/.codex/config.toml`):** set `startup_timeout_sec = 120` and `tool_timeout_sec = 900`.
- **DeepSeek Harness (`cordis.patch.yml`):** set `toolCallTimeoutMs: 900000` and `!!js process.env.KEY ?? ''` fallback.
