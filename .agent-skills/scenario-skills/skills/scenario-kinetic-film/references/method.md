# From a brief to a beat sheet

## 1. Decide the length and the tempo

| Film                 | Length     | Tempo                                            | Beats      |
| -------------------- | ---------- | ------------------------------------------------ | ---------- |
| Teaser or social cut | 15 to 25 s | 160 to 175 BPM (drum and bass, phonk, breakbeat) | 45 to 70   |
| Launch film          | 40 to 55 s | 165 to 175 BPM                                   | 115 to 160 |
| Calmer brand film    | 30 to 45 s | 120 to 128 BPM                                   | 60 to 95   |

Fast tempos give more cuts per second for free: at 172 BPM a beat is 0.35 s, exactly the shot length
the high-energy references run at. `spec.beats` is the film's length in beats; the HUD and the logo
end card are timed from it.

## 2. Write the words first

Write the film as a short spoken script, then cut it into one or two words per beat. A phrase of 4
to 8 words fills 4 to 9 beats. Rules that kept the copy strong:

- One claim per phrase, and true. On-screen numbers come from the film (`{lines}`, `{frames}`,
  `{seconds}`) or from the user; an invented statistic is the first thing a reader checks.
- Concrete nouns and verbs, not adjectives: THEY STOMP. beats AMAZING VISUALS.
- A turn every 3 to 4 phrases: a denial (NO GUESSWORK.), a gag (KNOCK. KNOCK. WHO'S THERE?), a
  number, a reveal.
- End on the name, then hold: the logo card is the only place the film may rest.

## 3. Map phrases to blocks

| Phrase type                                  | Block                                             |
| -------------------------------------------- | ------------------------------------------------- |
| Opening hook, any punchy statement           | `Words` (punch3d, slam, stack, split, pair)       |
| "No X. No Y." denials                        | `Strike`                                          |
| A number that kills an old way of working    | `Graph`                                           |
| Who made it, what it is called               | `Hero`                                            |
| The input that produces the result (a brief) | `Prompt` (ends in the push that becomes the drop) |
| A capability shown full screen               | `Stretch`, `Fly`, `Words` cuts, or a custom block |
| Iteration or feedback                        | `Notes`                                           |
| Scale (a count of pages, lines, frames)      | `Counters`, then `Progress`                       |
| Input to output                              | `Chain`                                           |
| Everything you just saw                      | `Rewind`                                          |
| Key art, product, screenshot                 | `Picture`                                         |
| The end                                      | `Logo`                                            |

## 4. Place the drop

The music's drop is the film's turn: put the biggest visual change on it (a ground flip to the
accent, the first picture, the Prompt block's push into Enter). Measure where the generated track
drops with `beat_grid.py`, then choose `music.offset` so that drop lands on the beat you planned.
The beat sheet shows, for every block: start beat, end beat, words, ground color, the hit on its
first beat.

## 5. Energy targets (measured on the references this style comes from)

Measured with `dyn.py` on the screen content only, every frame at 320x180, read at 60 fps:

| Measure                                    | The fastest reference | A calmer reference | Kaiju Postal        |
| ------------------------------------------ | --------------------- | ------------------ | ------------------- |
| Frames essentially still (under 1.5% move) | 16%                   | 23 to 53%          | 24% before the card |
| Longest still stretch                      | 0.37 s                | 0.7 s              | under 0.6 s         |
| Median motion                              | 5.3 px/frame          | 1.3 to 3.5         | 4.2                 |
| Hard cuts per 10 s                         | 9.1                   | 1.4 to 3.7         | 12.5                |

- `finish.py` passes a film at 40% still frames or less, no still stretch over 0.6 s before the end
  card, and a median motion of 2.5 px/frame or more.
- Motion is in px per 1/60 s at 1920 px wide. A clip below 60 fps is read with each frame repeated,
  and its repeats count as still: a 30 fps phone recording reads more still than it looks.

## 6. Matching a specific reference

When the user brings a reference video:

1. Download it. If it is a phone filming a screen, flatten the screen first with
   `rectify.py <video> <out.mp4> <end_s> <ref_t> '<quad>' '<caption band>'`. The quad is the
   screen's corners at `ref_t`, `[[x,y],...]` top-left, top-right, bottom-right, bottom-left; the
   band `[y0,y1]` is a burnt-in caption to ignore. It tracks the camera on the static surroundings
   and warps the screen flat.
2. Measure it: `dyn.py <video>` and `holds.py <video> 0.35 <bpm>`.
3. Make contact sheets at 10 fps of its busiest and calmest seconds (`ffmpeg -vf fps=10` stills,
   then `montage.py`).
4. List its devices: what moves between the hits, how it transitions, how big the type is.

Match its register with your own words and brand; never copy its script, its logo or its frames.
