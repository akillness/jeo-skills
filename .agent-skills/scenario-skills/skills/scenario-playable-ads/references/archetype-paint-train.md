# Archetype: conveyor color puzzle (paint train)

Tap a paint frog, it hops on a toy train that loops a round dot picture of a parrot, and squirts its
color on every unpainted dot of that color it passes. Frogs with paint left wait on 5 stools; a full
station loses. Finish the picture and the parrot comes alive and flies off. Hook "Hop the frogs on
the paint train and bring the parrot to life". One build of this pattern passed the skill's QA (18
of 18 checks at the time, fake ad containers in headless Chromium) before the no-blocking rule below
was added. Active run: win, end card at 37.6 s. Untouched viewer: end card at 10.0 s by the idle
timeout (touch once, then idle: 10.9 s). Meta 738 KB. Re-run the full QA after that rule change.

## Original-IP rules (read first)

The genre's best-known game has a very recognizable screen. Do not reproduce its signature layout,
shapes or name words; change each of them. Check each row below against the studio's screenshot
before the build and again on the QA frames.

| Element                  | What this pattern does instead                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shooters                 | the studio's own characters: frogs on lily pads                                                                                                  |
| Picture                  | round glossy dots, honeycomb-packed in a round paper disc (122 dots, 26 px)                                                                      |
| Track                    | rails drawn in code along a curvy closed loop: a bulge to the left, a round top, a wavy right side, no straight runs; it does not hug the canvas |
| Shooter layout and paint | 6 frogs scattered on pads, each showing a belly paint level, no numbers                                                                          |
| Holding slots            | 5 stools on a curved deck inside the loop                                                                                                        |
| Name                     | No words from the leader's title in the name                                                                                                     |

A picture with a loop carrying shooters past it is the genre's core; make everything else differ
(canvas shape, track, how paint is shown, where the slots sit). A first layout that kept the genre's
most common shapes read too close to the leader and had to be redone after the build (see Mistakes
seen). Still open: a human side-by-side check against the leader's store screenshots.

## Controls

- **One verb: tap a frog** on any lily pad (the pad's next frog pops up) or on a stool. It hops onto
  the first free wagon (4 wagons); if all 4 are taken, it wiggles.
- **Before the first touch the game waits, alive.** The round clock is held (the timer pill shows
  0:45). The train idles around the loop with no passenger. The suggested frog (the first tap of the
  winning hint line) hops every second inside a pulsing gold ring; the other frogs bob in a wave;
  the shared hand (`PA.draw.hand`) loops a tap on the suggested frog; "TAP A FROG!" sits on a plate
  clear of that frog's hop. Nothing paints.
- The first touch is the player's own move: a tap on a frog plays it, a tap elsewhere just starts
  the game.
- **Hints:** after 2.5 s without input the hand returns and points at the hint's frog. It only
  points.
- **Never autoplay.** The train runs on its own (the world), but a frog rides only after the
  player's tap. The ad ends by goal, by the 45 s round timer, or by 10 s with no input at all,
  straight to the end card.

## Rules ("no blocking"; keep them in a pure module, `src/board.js`, shared by the game and Node)

- The picture: 122 paint dots (R 46, G 32, Y 23, B 21) plus 4 printed eye dots, drawn by hand
  (`analysis/picture.txt`) and mapped to a honeycomb (`analysis/hex_picture.py`).
- **A frog paints the dots of its color it passes.** Nothing blocks: other colors never get in the
  way. It squirts once at each part of the loop that still has an unpainted dot of its color,
  hitting the nearest one, and the touching same-color dots fill with it. One paint per dot.
- **Why a reach limit:** with "paint every matching dot" a frog only had paint left once its color
  was finished, so a stool frog was useless and "1 BENCH LEFT" could only come at the very end. One
  squirt per part of the loop keeps stools filling mid-game while the frogs on them stay useful.
- **Boarding lock:** once the fifth stool is reserved and dots are still left, no more frogs can
  board; the loss shows when that frog sits down. Without it, frogs already riding could finish the
  picture and a careless run won.
- Frogs carry more paint in total than the picture needs. A frog with paint left after its loop
  takes a stool; **its stool is reserved (a ghost) from boarding**, so "1 BENCH LEFT" counts seated
  and returning frogs honestly. A stool frog can be tapped again; it paints only if its color still
  has dots.
- **The pressure:** the 5 stools and the round timer. Each pad holds a short hidden queue, so
  reaching a needed frog can mean sending (and benching) the one in front of it.
- **Commit at the tap:** the ride is computed when the frog boards, then played out lane by lane, so
  2× QA runs match real play. **Win:** every dot painted. **Fail:** the fifth stool fills ("STATION
  FULL!").

## Beat sheet (35–45 s)

Times from a QA run with the no-blocking rules (active win: "1 BENCH LEFT" 23.5 s, picture done 30.5
s, end card 35.6 s).

| Time after first touch | Beat                                                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| before                 | Waiting screen (above). 10 s untouched: end card titled "PAINT THE PARROT!" with no stats                                                                                                             |
| 0–2 s                  | The first frog boards; thick jets (13 px), 112 px splats, dot pops and a small shake as the wagon passes its lanes                                                                                    |
| 2–18 s                 | Quick fills with callouts (SPLASH!, SPLAT!, JUICY!); the progress bar climbs                                                                                                                          |
| ~19 s                  | Frogs with paint left take stools (1, 2, 3)                                                                                                                                                           |
| ~22 s                  | Near-fail for a good player: "1 BENCH LEFT!" on the deck, the free stool pulses gold, a toot, the music ducks                                                                                         |
| ~32.5 s                | **Signature:** every dot flashes, the real parrot fades in over the picture, flaps (2 frames every 0.11 s) and flies off with confetti and feathers; 12 coins fly to the counter; "PICTURE COMPLETE!" |
| 45 s                   | Timer out: "TIME'S UP!" with the real dots left                                                                                                                                                       |
| loss                   | "STATION FULL!", then "SO CLOSE! Only N dots left!" (20 or fewer) or "NICE TRY! N dots to go!"                                                                                                        |
| +2.6 s                 | End card: DOTS n/122, FROGS SENT, COINS, PLAY FREE, Replay                                                                                                                                            |

## Tuning that made win and near-fail reliable

- Pads (top frog first): G10 R10 G8 | Y4 G10 B11 | R11 R12 G7 | R8 Y8 B5 | R9 Y10 Y11 | B10 G10: 17
  frogs carrying 154 paint for 122 dots.
- Best play wins in 14 taps and never uses more than 3 stools. The hint line is 16 taps, every
  hinted frog paints something, and it reaches "1 BENCH LEFT" at tap 14 with 10 dots left before
  winning.
- Careless play: 55 of 60 random players fill the station; the careless bot (always the frog whose
  color is nearly done) fills it with 11 dots left: "SO CLOSE! Only 11 dots left!".

- The method stays: `analysis/plan.js` searches pad queues and paint amounts so that good play wins,
  even the best line fills the station to 4 ("1 BENCH LEFT") with 10 or more dots left, and careless
  play fills all 5 stools. It writes `src/level.js` (dots, pads, the hint line, the track).
- The hint follows the planned line while the player stays on it, else the solver's winning tap.
- Feel (`src/game.js`): train loop 4.8 s, 4 wagons, hop 0.36 s, paint flight 0.24 s. The toot ducks
  the music to 0.12 for 1.4 s, the win for 3.2 s.

## QA bot pattern

- `qa()` exposes:
  - `frogs`: the tappable frogs in client coordinates, each with `kind` (`q` = pad, `b` = stool),
    `c`, `p`, `gain` (dots it would paint now) and `fail` (whether it would fill the station);
  - `tap`: the hint's frog; `busy`, `painted`, `dots`, `taps`, `benches`, `result`;
  - `progress` = frogs sent + dots painted (stays 0 for an untouched viewer) and `playT` (the round
    clock).
- `active`: tap `tap` every 1.5 s. `fail`: every 1.1 s send the pad frog with the least `gain`; use
  stool frogs only when the pads are empty.
- `STORYBOARD`: hook (1 s), fourth squirt, the station at 2, "1 BENCH LEFT", picture alive, result,
  end card. Filter on event data, with comparisons if counts vary:
  `{"event": "bench", "data": {"count": {">=": 4}}}`. `STORYBOARD_IDLE`: hook at 0.1 s and 1.0 s,
  still waiting at 6 s, end card.

## Asset map

| Element                                                                                                              | Source                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Calm pond plate                                                                                                      | image from a text prompt (open water, pads and lotus only at the edges); prefer an edit of the screenshot, and check against the store art |
| Paper disc, rails and sleepers, station deck with 5 stools                                                           | code, from the train's own curve (`LV.track`, 400 points), drawn once at 2x into an offscreen canvas                                       |
| Track curve                                                                                                          | 27 hand-picked points on an earlier plate edit of the screenshot, closed Catmull-Rom spline (`analysis/track_path.py`)                     |
| Lily pad                                                                                                             | cut from an earlier plate edit of the screenshot (green mask), drawn 6 times                                                               |
| 4 frogs ("only the body color changes"), locomotive, wagon                                                           | Scenario edit of the screenshot, transparent sheet 1. The train came as side views; that works rotated along the track                     |
| Parrot perched / wings up / wings down, splat (tinted per color), coin, feather                                      | Scenario edit of the screenshot, sheet 2. Clear its opaque white cell borders before slicing                                               |
| Parrot payoff                                                                                                        | the recording's payoff moment (about 5.5 s): the dot parrot turns into the real parrot and flaps off while coins fly                       |
| LEVEL pill, progress bar with parrot badge, coin pill, gear                                                          | screenshot crops, text, number and fill painted out                                                                                        |
| Logo                                                                                                                 | intake logo, keyed                                                                                                                         |
| Dots (chalky and glossy), jets, splashes, belly paint level, banners on deck plates, timer pill, stool rings, ghosts | code; the hand is `PA.draw.hand`                                                                                                           |
| SFX and music                                                                                                        | Scenario audio: squirt, plop (pitch rises along a chain), hop, toot, win, fail; a 30 s loop                                                |

## Mistakes seen

- **A first layout that echoed the leader.** Fixing it after the build meant a new plate, a new
  track fit and new lanes. Run the IP check first.
- The image model ignored "curved all the way around" and drew a rounded square. Put the negatives
  first ("NOT a rectangle, NOT a rounded square… no straight sections"), or draw the track in code,
  as the fixed build does.
- A painted track in the plate and a crowded scene read as confusing. Draw the rails from the
  train's curve so the train sits exactly on them, and keep the background calm.
- **Thin cause and effect:** 5% hook motion with small riders and thin arcs. Riders 74 px, jets 13
  px, splats 112 px. Dots 26 px or more.
- "1 BENCH LEFT" never showed while seated frogs left before riders came back. Count reservations.
- **Squirt, plop and hop repeat every 0.03–0.05 s**, far faster than 3 a second; still in the build.
  Raise the gaps to about 0.33 s or play one sound per lane burst.
- Dead code from an earlier build (`AUTO_GAP`, `G.auto` branches) is still in `src/game.js`, forced
  off. Delete it, so no code path can tap a frog for the viewer.
