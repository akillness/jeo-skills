# QA checks, build refusals and the game contract

`qa.py` drives the built files in headless Chromium through Playwright, inside a fake container per
network. A fake container proves the wiring, not the network's own validator: test in each network's
preview tool (see [networks.md](networks.md)).

## Base checks (19)

| Check                                        | Rule                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `hook_moves_without_input`                   | at least 3% of pixels change between 0 s and 1.5 s with no input              |
| `audio_off_before_first_touch`               | no `AudioContext` before the first tap                                        |
| `mute_button_toggles_without_starting`       | the mute button toggles all sound and is not the first touch                  |
| `idle_reaches_endcard`                       | an untouched viewer reaches the end card                                      |
| `idle_never_autoplays`                       | untouched, `qa().progress` exists and stays 0 until the end card              |
| `idle_timeout_endcard_by_15s`                | untouched, the end card shows within 15 s                                     |
| `touch_once_then_idle_reaches_endcard`       | one tap at 0.8 s, then nothing: the idle timeout or the cap ends it           |
| `replay_restarts_game`                       | Replay changes at least 15% of the screen, and no end card returns within 3 s |
| `active_wins`, `active_length_33_52s`        | `qa_bot.active` wins, end card at 33 to 52 s                                  |
| `fail_path_loses`                            | `qa_bot.fail` plays badly and does not win                                    |
| `cta_{meta,google}_{endcard,pill}_calls_...` | 4 checks: both buttons call the network's CTA                                 |
| `zero_network_requests`, `no_console_errors` | across every run                                                              |
| `meta_size_ok`, `google_size_ok`             | 2 MB HTML for Meta, 5 MB ZIP for Google                                       |

## Per-network checks

Run for every network built into `dist/`, on top of the base 19:

| Check                                     | Rule                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `cta_{net}_{endcard,pill}_calls_{api}`    | the exact CTA call of that network, from both buttons                   |
| `cta_{net}_first_tap_never_opens_store`   | applovin, unity, mraid: the first tap on PLAY FREE opens nothing        |
| `cta_mintegral_load_calls_gameReady`      | plus `..._endcard_signals_gameEnd` and `..._replay_signals_gameRetry`   |
| `cta_liftoff_endcard_posts_complete`      | Liftoff gets `complete` at the end card                                 |
| `gate_{net}_nothing_runs_before_viewable` | applovin, unity, mraid, mintegral: no clock, no audio, no tap before go |
| `gate_{net}_runs_after_viewable`          | plus `..._pauses_when_hidden` (clock and sound) and `..._resumes`       |
| `{net}_size_ok`                           | the deliverable is under that network's cap                             |
| `package_ok_{net}`                        | ZIP targets hold `index.html` at the root; pangle also `config.json`    |

## The QA bot (`qa_bot.py`)

- `active(snap, t)` plays well; `fail(snap, t)` plays badly. A fail bot that returns `None` is the
  idle run again, so the losing path stays untested.
- Bots make the first touch themselves and may read any field of the `qa()` snapshot.
- `STORYBOARD` names frames of the active run; `STORYBOARD_IDLE` frames of the untouched run. Sample
  the hook at 0.6 s or later: the template tweens it in after 0.1 s.
- Triggers filter on event data: `{"event": "bench", "data": {"count": {">=": 4}}}`.
- `COMPARE` maps storyboard frames to recording frames for `storyboard_vs_real.jpg`.
- A level a good player clears faster can declare `ACTIVE_LENGTH = (lo, hi)`; the check is then
  named `active_length_<lo>_<hi>s`. Keep the ad itself 35 to 45 s, and never pad the level.
- `qa.py --only ...` writes `qa/report_<only>.json` and leaves `report.json` alone. A 3D game's full
  run takes about 2.5 minutes (WebGL in software).

## What `build.py` refuses

- External `src` or `href`, except `exitapi.js` on `google` and the playable SDK on `pangle`.
- `fetch`, `XMLHttpRequest`, `localStorage` and `sessionStorage` in the game's own code.
- Emoji code points in the source.
- A deliverable over its network's size cap (exit code 1, `OVER LIMIT` in the log).
- An unknown network name.

Files the studio supplied get the same refusals, caps and checks as generated ones: `qa.py` cannot
tell them apart. Read the size estimate in `analysis/assets_inventory.md` before the first build,
and check by eye that compression did not damage the supplied art
([existing-assets.md](existing-assets.md), section 6).

## What the game must do

- Emit `result` with `{result: 'win' | 'close'}` when play ends, then `endcard`.
- Emit `replay` on Replay. The runtime calls `PA.net.gameEnd()` and `PA.net.gameRetry()` by itself.
- Expose `qa()` with `phase`, `scale`, `progress`, client-coordinate targets and `cta`.
- Call `PA.net.cta()` for every store exit, and nothing else.

## After 19 of 19

All checks passing is the floor. Open these and fix anything unreadable, overlapping, too small or
off-model:

- `qa/hook_*.png`;
- every `qa/story_*.png`;
- the three `qa/view_*.png`;
- `qa/storyboard_vs_real.jpg`.

Each archetype build found 5 or 6 such bugs this way.
