# Placement specs

Authoring-time values (2026). Platform UI and store requirements churn: treat every row as the
default, confirm contractual deliverables against the platform's current published spec, and read
safe zones as approximate. The workflow around these numbers is SKILL.md's ladder and order of
operations: aim generative work at the row's ratio, land exact pixels with a resize, then verify by
measurement.

## Social

| Placement                 | Ratio  | Pixels          | Notes                                                                    |
| ------------------------- | ------ | --------------- | ------------------------------------------------------------------------ |
| Instagram feed, square    | 1:1    | 1080x1080       | Portrait 4:5 earns more feed screen                                      |
| Instagram feed, portrait  | 4:5    | 1080x1350       | Grid preview crops toward square: keep the subject centered              |
| Instagram story or reel   | 9:16   | 1080x1920       | 9:16 safe zone below                                                     |
| TikTok                    | 9:16   | 1080x1920       | 9:16 safe zone below; the right rail holds action buttons                |
| YouTube thumbnail         | 16:9   | 1280x720        | Judge it at a tenth of its size; bottom right carries the duration badge |
| YouTube channel banner    | 16:9   | 2560x1440       | Only a centered band near 1546x423 is visible on every device            |
| X (Twitter) in-feed       | 16:9   | 1200x675        | 1:1 also renders clean in feed                                           |
| X (Twitter) header        | 3:1    | 1500x500        | The avatar overlaps the lower left                                       |
| LinkedIn feed / link card | 1.91:1 | 1200x627        |                                                                          |
| Facebook feed             | 4:5    | 1080x1350       | Link cards follow the Open Graph row                                     |
| Facebook page cover       | ~2.6:1 | 820x312         | Mobile crops the sides: keep content central                             |
| Pinterest pin             | 2:3    | 1000x1500       | Taller pins get cut in feed                                              |
| Profile picture / avatar  | 1:1    | 400x400 or more | Displayed as a circle: keep the mark inside the inscribed circle         |
| Link preview (Open Graph) | 1.91:1 | 1200x630        | One og:image serves most share targets; keep text large, feeds downscale |

## The 9:16 safe zone

Platform UI eats the edges of stories, reels, and TikTok. Keep the subject, all text, and any mark
inside the central band: clear roughly the top 14 percent, the bottom 35 percent, and 6 to 13
percent per side (as of 2026, the same band `scenario-video-ads` composes video masters to). One
composition inside that band passes every 9:16 placement.

## Screen, cinema, and hero

| Placement          | Ratio         | Pixels                              | Notes                                                                                 |
| ------------------ | ------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| HD frame / cover   | 16:9          | 1920x1080                           |                                                                                       |
| UHD frame          | 16:9          | 3840x2160                           |                                                                                       |
| Cinema flat still  | 1.85:1        | 1998x1080 (DCI 2K), 3996x2160 (4K)  |                                                                                       |
| Cinema scope still | 2.39:1        | 2048x858 (DCI 2K), 4096x1716 (4K)   |                                                                                       |
| Ultrawide monitor  | 21:9          | 3440x1440                           | Also 2560x1080                                                                        |
| Website hero       | site-specific | commonly 1920 wide, 500 to 800 tall | Measure the live slot; heroes crop responsively, keep the subject in the center third |

## Phone, tablet, desktop

| Placement         | Ratio   | Pixels          | Notes                                                                                                  |
| ----------------- | ------- | --------------- | ------------------------------------------------------------------------------------------------------ |
| Phone wallpaper   | ~9:19.5 | 1290x2796 class | Devices vary and parallax crops: subject centered, clock up top, dock at the bottom                    |
| Tablet wallpaper  | ~3:4    | 2048x2732 class |                                                                                                        |
| Desktop wallpaper | 16:9    | 3840x2160       |                                                                                                        |
| App icon          | 1:1     | 1024x1024       | The OS applies the rounded mask: keep the mark inside the central 80 percent; iOS forbids transparency |

## Storefront and app stores

| Placement                   | Ratio   | Pixels          | Notes                                                                          |
| --------------------------- | ------- | --------------- | ------------------------------------------------------------------------------ |
| Steam header capsule        | ~2.14:1 | 920x430         | The logo must read at half size                                                |
| Steam main capsule          | ~1.75:1 | 1232x706        |                                                                                |
| Steam small capsule         | ~2.65:1 | 462x174         | Displayed as small as 231x87: logo nearly full-frame                           |
| Steam vertical capsule      | ~5:6    | 748x896         |                                                                                |
| Steam library capsule       | 2:3     | 600x900         |                                                                                |
| Steam library hero          | ~3.1:1  | 3840x1240       | The logo ships as a separate transparent PNG layer                             |
| iOS App Store screenshot    | ~9:19.5 | 1290x2796 class | Exact sizes track current device classes: take them from the store's spec page |
| Google Play feature graphic | ~2:1    | 1024x500        |                                                                                |
| Epic Games Store offer      | 3:4     | 1200x1600       | Landscape variant 2560x1440                                                    |
| itch.io cover               | ~5:4    | 630x500         |                                                                                |

## Shops and marketplaces

| Placement            | Ratio | Pixels          | Notes                                                               |
| -------------------- | ----- | --------------- | ------------------------------------------------------------------- |
| Amazon listing       | 1:1   | 1600x1600 class | Zoom needs 1000 or more on the longest side                         |
| eBay listing         | 1:1   | 1600x1600 class | Minimum 500 on the longest side                                     |
| Etsy listing         | 4:3   | 2700x2025       | Feed thumbnail crops to 4:3; keep 2000 or more on the shortest side |
| Shopify product      | 1:1   | 2048x2048       |                                                                     |
| Google Shopping feed | 1:1   | 800x800 or more | Apparel minimum 250x250                                             |

Marketplace main images are policy surfaces, not creative ones: Amazon wants the product on pure
white (RGB 255, 255, 255) filling about 85 percent of the frame with no text, logos, or watermarks,
and the other marketplaces run close variants. The text-free master doctrine pays off here: the
master is the main image, and lettered or lifestyle derivatives fill the secondary slots and social
placements.

## Streaming and community

| Placement             | Ratio    | Pixels    | Notes                                     |
| --------------------- | -------- | --------- | ----------------------------------------- |
| Twitch profile banner | 2.5:1    | 1200x480  |                                           |
| Twitch offline screen | 16:9     | 1920x1080 |                                           |
| Twitch panel          | flexible | 320 wide  |                                           |
| Twitch emote          | 1:1      | 112x112   | Auto-scaled to 56 and 28: must read at 28 |
| Discord server icon   | 1:1      | 512x512   | Displayed as a circle                     |
| Discord server banner | 16:9     | 960x540   |                                           |

## Covers

| Placement          | Ratio | Pixels    | Notes                                       |
| ------------------ | ----- | --------- | ------------------------------------------- |
| Podcast cover      | 1:1   | 3000x3000 | Minimum 1400x1400                           |
| Music cover art    | 1:1   | 3000x3000 | Distributors commonly require the full 3000 |
| Kindle ebook cover | 5:8   | 1600x2560 | The title must survive thumbnail size       |

## Display banners and email

| Placement        | Pixels         | Notes                                                            |
| ---------------- | -------------- | ---------------------------------------------------------------- |
| Medium rectangle | 300x250        | The workhorse IAB size                                           |
| Leaderboard      | 728x90         |                                                                  |
| Half page        | 300x600        |                                                                  |
| Wide skyscraper  | 160x600        |                                                                  |
| Mobile banner    | 320x50         | Also 320x100                                                     |
| Billboard        | 970x250        |                                                                  |
| Email header     | 1200x400 class | Emails render near 600 wide; deliver 2x for high-density screens |

Banners are far ratios on tiny canvases: recompose natively (the ladder's last rung) rather than
reframing, and letter at final size with `scenario-text-overlay`.

## Print

| Placement              | Trim       | Pixels at 300 dpi | Notes |
| ---------------------- | ---------- | ----------------- | ----- |
| A4                     | 210x297 mm | 2480x3508         |       |
| A3                     | 297x420 mm | 3508x4961         |       |
| A2                     | 420x594 mm | 4961x7016         |       |
| US letter              | 8.5x11 in  | 2550x3300         |       |
| Movie one-sheet poster | 27x40 in   | 8100x12000        |       |

Add 3 mm of bleed per edge (0.125 in on US trims) and keep text 5 mm inside the trim. 300 dpi
targets exceed native generation sizes: generate the master at the largest clean size, upscale to
the print target (find the upscaler with `recommend`, the need in the user's own words), and only
then letter.
