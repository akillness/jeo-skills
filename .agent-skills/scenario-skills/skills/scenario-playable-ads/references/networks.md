# Networks: specs and CTA calls

`build.py` writes nine network targets plus a local preview. Each fact below is either checked
against the network's own public documentation (with the page) or marked **not confirmed against the
network's documentation; verify in the network's preview tool before sending**. Pages were read in
November 2026; networks change their specs, so re-read the page before a first delivery.

What was tested: every target was exercised against fake containers in headless Chromium (`qa.py`).
On 2 November 2026 the template's placeholder game was also run in AppLovin's playable preview and
in Google's HTML5 validator (see those two sections), and in Meta's playable preview, where the spec
checks passed and the CTA tap registered. No other network's own tool was run. Say which tools were
run when you hand a build over, and run the network's own preview or validator before the first
upload.

## What each network gets (`build.py --networks all`)

`dist/<network>/index.html` is always written. The deliverable is the HTML or the ZIP, as below.
`--bundle` (implied by `all`) also writes `dist/<project>-networks.zip` with one file per network.

| Target      | Deliverable                                                 | Cap in `build.py`   | CTA call                                | Extras                                                                       | Lifecycle                                                               |
| ----------- | ----------------------------------------------------------- | ------------------- | --------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `meta`      | ZIP with `index.html` at the root; the HTML is also written | HTML 2 MB, ZIP 5 MB | `FbPlayableAd.onCTAClick()`             | none                                                                         | none                                                                    |
| `google`    | ZIP with `index.html` at the root                           | ZIP 5 MB            | `ExitApi.exit()`                        | `<meta name="ad.orientation" content="portrait">`, `exitapi.js`              | none                                                                    |
| `applovin`  | single HTML                                                 | 5 MB                | `mraid.open(store)`                     | none                                                                         | wait for MRAID `ready`, then viewable                                   |
| `unity`     | single HTML                                                 | 5 MB                | `mraid.open(store)`                     | none                                                                         | wait for `ready` and viewable; pause on `viewableChange(false)`         |
| `mraid`     | single HTML, generic MRAID file                             | 5 MB                | `mraid.open(store)`                     | none                                                                         | same as `unity`                                                         |
| `moloco`    | single HTML                                                 | 5 MB                | `FbPlayableAd.onCTAClick()`             | none                                                                         | none                                                                    |
| `mintegral` | single HTML                                                 | 5 MB                | `install()`                             | none                                                                         | `gameReady()`, `gameStart()`, `gameEnd()`, `gameRetry()`, `gameClose()` |
| `liftoff`   | ZIP with `index.html` at the root                           | 5 MB                | `parent.postMessage('download', '*')`   | none                                                                         | `postMessage('complete')` at the end card                               |
| `pangle`    | ZIP: `index.html` and `config.json`                         | 5 MB                | `window.openAppStore()`                 | playable SDK script in `<body>`; `config.json` `{"playable_orientation": 1}` | none                                                                    |
| `web`       | single HTML, local preview                                  | none                | a tap opens the store link in a new tab | none                                                                         | none                                                                    |

## Per network: confirmed and unconfirmed

Each **Unconfirmed** item below is not confirmed against the network's documentation; verify in the
network's preview tool before sending.

### Meta

Confirmed on [Playable ad format](https://developers.facebook.com/docs/app-ads/formats/playable-ad):

- the CTA is `FbPlayableAd.onCTAClick()`;
- a single HTML file up to 2 MB, or a ZIP up to 5 MB with at most 100 files;
- inside the ZIP, `index.html` is up to 2 MB;
- App Installs objective only, and a lead-in video plays before the playable;
- JS redirects are rejected.

**Unconfirmed:** that `index.html` must sit at the ZIP root (the page names the file, not its
place).

Preview: the [Playable Preview tool](https://developers.facebook.com/tools/playable-preview/) needs
a Meta business login. On 2 November 2026 the `meta` ZIP of the template's placeholder game was
uploaded to it. The preview showed the game, and the specification panel passed all six checks: the
asset is HTML5, the file size is within 5 MB, the bundle has at most 100 files, the size of
`index.html` is within 5 MB, no JavaScript redirects were found, and no viruses were found. The
panel states 5 MB for `index.html`, where the docs page above states 2 MB; `build.py` keeps the
stricter 2 MB. A seventh line reads that `FbPlayableAd.onCTAClick()` is "not yet activated" until
the CTA is tapped. After a tap on the end card's CTA it read "FbPlayableAd.onCTAClick() activated
successfully".

### Google

Confirmed on
[About HTML5 ads for App campaigns](https://support.google.com/google-ads/answer/9981650):

- a ZIP up to 5 MB and 512 files, with relative paths only;
- `<meta name="ad.orientation" content="portrait">` declares the orientation;
- the exit goes through `ExitApi.exit()` with `exitapi.js` from `tpc.googlesyndication.com`;
- `exitapi.js` is optional: without it Google adds its own install button;
- no local storage, and outside files only from Google-hosted libraries;
- no sound before the user interacts.

**Unconfirmed:** a ban on iframes.

Preview: the [HTML5 validator](https://h5validator.appspot.com/adwords/asset), linked from
[this help page](https://support.google.com/google-ads/answer/6335679). It was run on 2 November
2026 with the template's placeholder game. Anyone with the URL can open an upload, so test with a
neutral file, never a client build.

- The page has no file input until UPLOAD is pressed, which opens a file chooser.
- "Select for App Campaigns" is ticked by default. Ticked, the `google` ZIP passed every check
  except one optional recommendation (lazy loading of assets).
- In validation mode the game ran to the end card, and tapping the CTA opened the validator's dialog
  "Your click was successful and should track correctly. This creative is using the ExitApi."
- `ad.orientation` set to `portrait`, `landscape` or `portrait,landscape`, and `ad.size` set to
  320x480 or 480x320, all passed.
- With the box unticked (the standard display profile) the ZIP failed "Ad Dimensions" for all of
  those variants. That profile is not the target of a mobile game playable.
- The validator's `/dcm` (Campaign Manager) and `/dbm` (Display & Video 360) policies reject the
  ZIP: "Missing click tag check" (they require a `clickTag`), and `exitapi.js` is flagged as a
  third-party call. The `google` target is for Google Ads and App campaigns only.

### AppLovin

Confirmed on
[best practices and guidelines](https://support.applovin.com/en/growth/promoting-your-apps/creatives/best-practices-and-guidelines)
and the creative specs page linked from it:

- a single HTML file up to 5 MB;
- MRAID 2.0, with `mraid.open()` for the store;
- wait until MRAID is ready (state not `loading`);
- audio stays muted until the first interaction and stops when the ad is hidden;
- any timer starts only after the first interaction;
- the first tap must not open the store.

**Unconfirmed:**

- whether a `<script src="mraid.js">` tag is wanted (the build adds none and uses the injected
  `window.mraid`);
- waiting for viewable on top of ready (the runtime does, to be safe);
- the 10 s idle timeout that shows the end card to a viewer who never touches. No gameplay timer
  runs, but check how the preview treats it.

Preview: AppLovin's [playable preview](https://p.applov.in/playablePreview?create=1), linked from
that page; it needs no login. It was run on 2 November 2026 with the template's placeholder game
(the `applovin` file, portrait):

- the preview exposed MRAID 2.0, state `default`, viewable, and the game read `NETWORK=applovin`;
- the game stayed on its start screen for 3 s without a tap, then played through to the end card
  when tapped;
- tapping PLAY FREE on the end card showed the tool's banner "You have successfully clicked", which
  was absent before the tap;
- no console errors came from the game. That run tapped the pieces many times before the CTA, so the
  first-tap hold was not exercised there (only in the fake container).

Not run in this tool: landscape (the Rotate button), the `unity` and `mraid` files, and the 10 s
idle timeout beyond the first 3 s.

### Unity

Confirmed on
[playable specifications](https://docs.unity.com/en-us/grow/acquire/creatives/playable/specifications)
and
[playable best practices](https://docs.unity.com/en-us/user-acquisition/creatives/best-practices/playable):

- a single `index.html` under 5 MB, every asset inlined as base64;
- MRAID 3.0, injected by the webview (no script tag);
- start only after MRAID is ready and the ad is viewable;
- pause and mute on `viewableChange`;
- no XHR;
- the store opens through `mraid.open()` only after gameplay interaction, never on the first tap;
- Web Audio, so the iOS mute switch is respected.

**Unconfirmed:** the runtime also listens to `exposureChange`, which these pages do not mention.

### Generic MRAID file and ironSource

- The `mraid` file is for MRAID buyers without a dedicated target. It behaves like `unity`,
  including the first-tap rule.
- ironSource has no target here. Its DAPI page now redirects, so `dapi.openStoreUrl()` is
  unconfirmed.
- [ironSource Exchange's MRAID guidelines](https://docs.unity.com/en-us/grow/programmatic/ironsource-exchange/mraid-specifications-guidelines)
  state MRAID 2.0 and 4 MB for assets plus code. Keep a build for that exchange under 4 MB, below
  this file's 5 MB cap.

### Moloco

**Unconfirmed:** everything. The
[playable and interactive end card guide](https://help.moloco.com/hc/en-us/articles/24124525963799-Playable-and-Interactive-End-Card-IEC-creative-guide)
refused automated reading. The build follows search excerpts of that page:

- a single HTML file under 5 MB;
- `FbPlayableAd.onCTAClick()` for the store;
- no `mraid.js` and no XHR.

Read the page yourself before the first delivery.

### Mintegral

Confirmed on [asset specs](https://helpcenter.mintegral.com/en/docs/asset-specs): a single HTML file
up to 5 MB.

**Unconfirmed:** the `install()` CTA and the `gameReady`, `gameStart`, `gameEnd`, `gameRetry` and
`gameClose` lifecycle, which that page does not describe. The runtime calls `gameReady()` at load
and waits for the container's `gameStart()`.

### Liftoff

**Unconfirmed:** everything. Liftoff's help pages refused automated reading; these come from search
excerpts:

- [interactive ad integration](https://support.accelerate.liftoff.io/hc/en-us/articles/52724569196699-Interactive-Ad-Integration):
  a ZIP whose entry is `index.html`, and a 50 x 50 px area in the top corners may sit under the
  close button;
- [the creative verifier](https://support.vungle.com/hc/en-us/articles/4908908675355) checks for
  `parent.postMessage('download','*')`;
- [Adaptive Creative](https://support.vungle.com/hc/en-us/articles/360061060131): 5 MB.

Two Liftoff pages disagree on `complete`:

- Adaptive Creative says a CTA-based playable should not send it;
- [Dos and Don'ts](https://support.vungle.com/hc/en-us/articles/360056663752) says always send it.

The build sends it at the end card; settle it in the verifier. The PLAY FREE pill sits top right:
move it down about 60 px if the close button covers it. Liftoff's MRAID buyers take the `mraid`
file.

### Pangle (TikTok)

Confirmed on
[how to create TikTok Pangle playable ads](https://ads.tiktok.com/help/article/how-to-create-tiktok-pangle-playable-ads)
and
[Pangle asset specifications](https://ads.tiktok.com/help/article/specifications-for-pangle-ad-assets):

- a ZIP under 5 MB after compression;
- `config.json` with `playable_orientation`: 0 either, 1 portrait only, 2 landscape only;
- the playable SDK script at the bottom of `<body>`, before the developer's own JS (the build puts
  it right before the first script in `<body>`);
- `window.openAppStore()` for the store;
- no HTTP requests and no JS redirects, and not the `mraid.js` format.

Sound after a click and moving on after about 10 s idle are recommendations there.

## How the game talks to a network

The game never names a network. It calls `PA.net.cta()` (the only exit), and the runtime does the
rest:

- `PA.net.whenViewable(go)` (called by `PA.boot`): MRAID targets wait for
  `getState() !== 'loading'`, then `isViewable()`, `viewableChange(true)` or `exposureChange > 0`;
  Mintegral defines `gameStart`, calls `gameReady()` and waits. Until then nothing moves: no hook
  tween, no music clock (`PA.realTime` stays 0). Other targets start at once.
- **First tap.** On `applovin`, `unity` and `mraid`, `PA.net.cta()` does nothing until the viewer
  has touched the ad at least once before (the mute button never counts); it emits `ctaHeld`
  instead. `qa.py` checks that the first tap on PLAY FREE opens nothing on those targets.
- Pause and resume: `viewableChange(false)`, `exposureChange(0)` or `gameClose()` hold the loop and
  suspend audio; the matching show event resumes. `visibilitychange` pauses too.
- `PA.emit('endcard')` calls `PA.net.gameEnd()` once per round (Mintegral `gameEnd()`, Liftoff
  `complete`); `PA.emit('replay')` calls `PA.net.gameRetry()` (Mintegral `gameRetry()`). A game
  needs no call of its own.
- Outside a container (local preview) a tap opens the store link in a new tab.

## Rules for every target

These are the skill's rules. Where a network states the same rule, its section above says so.

- **No network requests after load.** Everything is inlined as data URIs. `build.py` refuses any
  external `src` or `href` (except `exitapi.js` for `google` and the playable SDK for `pangle`) and
  any `fetch`, `XMLHttpRequest`, `localStorage` or `sessionStorage` in the game's own code. `qa.py`
  serves stand-ins for the two allowed files, so the test stays offline, and counts requests.
- **No JS redirects.** Navigate only through the network's CTA call, on a user tap.
- **Sound only after the first touch.** The runtime creates the `AudioContext` on the first
  `pointerdown`. `qa.py` checks `PA.audio.ctx === null` before any input.
- **Pause when hidden**, on `visibilitychange` and on the container's hide events.
- **Mute button.** The runtime always draws one, and it never counts as the first touch.
- **Never autoplay.** This is the skill's own rule: the game waits for the first touch, and 10 s
  without input goes to the end card.
- **No emoji.** `build.py` refuses emoji code points in the source.

## Orientation

Portrait first. Screens wider than 3:4 letterbox the play area to 9:16. The side panels show the
blurred plate (`cfg.sideBg`, tinted by `cfg.sideTint`), the logo and a PLAY FREE button. `qa.py`
saves `view_portrait.png`, `view_tablet.png` (768 x 1024) and `view_landscape.png` (844 x 390); look
at all three. Pangle's `config.json` declares portrait only; Google's head declares portrait.
