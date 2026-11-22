# Making them want to install

A playable converts when it gives a taste and holds back the meal. The viewer should finish the ad
feeling three things:

- "I'm good at this";
- "I'm one step from something big";
- "there's more I haven't seen".

Each lever below says how to build it with the runtime.

Length and difficulty move conversion, and an ad whose mechanics differ from the game loses players
after install. The levers below are studio practice, not published benchmarks: A/B test them per
game.

## 1. Reward the very first touch (time to fun under 3 s)

- The first tap does something big at once: a burst, a sound, a number, a piece that moves.
- Never make the first touch wait for an animation or open a menu.

## 2. Make the viewer feel strong fast

- Start weak and visibly grow: one gun to a storm, a crowd of 5 to 110, an egg to a dragon.
- Show the growth on screen with a counter, a level pill or a squad bubble. Progress you can see is
  progress you own.

## 3. Give one real choice

- One decision that changes what happens: a card, a gate, a tower spot, which shooter goes next.
- A choice turns "an ad" into "my run", and the end card can name it: "Your Drone Ring build".

## 4. Show more than you give (the tease)

This is the strongest install lever, and the one most ads skip.

- **Find the tease in the recording.** In analysis, list what the recording shows that the ad
  doesn't let the player reach: a bigger boss, a new area, the next tier, a second weapon, a
  level-select map. Example: a recording shows a boss that the ad never reaches. From an idea, tease
  only what the brief names. If it names none, end without a tease and say so in `notes.md`.
- **Put a glimpse of it in the ad:**
  - a locked silhouette with a "?";
  - a "NEXT:" banner as the result fades;
  - the map scrolling past one more locked island;
  - the chain's last tier shown as a shadow.
- **Only tease what the real game has.** A tease the game can't keep is the expectation mismatch
  that drives day-1 uninstalls.

## 5. End on a cliffhanger, not a full stop

- **A near-fail** ("SO CLOSE! 1 piece left!") makes the viewer want one more try. Keep it honest:
  the number comes from the real state.
- **A win** ends on what's next, not "THE END": "WAVE 2: THE BOSS AWAKENS", "LEVEL 25 UNLOCKED".
- **The end card continues the player's own state:**
  - their stats (kills, army, coins);
  - their build;
  - a progress bar that shows how little of the game they've seen ("Level 1 of 300");
  - the teased content behind the PLAY FREE button.

## 6. Keep the end card alive

- Light rays, a bobbing hero and a pulsing PLAY FREE button (`PA.drawEndCard` does this).
- PLAY FREE is the biggest thing on the card; Replay stays small.
- The logo and hero are tappable too.

## 7. Juice every action, never annoy

- Every touch gets sound, motion, a little shake and a number.
- Duck the music under the payoff.
- **Never** loop a sound faster than about 3 times a second (rapid ticks become unbearable within
  seconds): thin it with `minGap`, or play one sound at the end of the action.
- There is always a mute button (shared, `cfg.mute`).

## 8. Easy to start, close to lose, possible to win

- Tune so a player who engages wins, and a careless one ends one step short.
- An ad that is too hard frustrates the viewer; one that is too easy gives them no reason to
  install.

## 9. Make variants, not one ad

Build two hooks, or two end-card teases, from the same game and A/B them on the network. Playables
fatigue more slowly than video, but they still fatigue.

## Checklist before shipping

- [ ] The first touch pays off within 1 s.
- [ ] The viewer's growth is visible on screen.
- [ ] There is one real choice.
- [ ] One tease, taken from the recording (or the brief), of content the game really has. From an
      idea whose brief names none, no tease, noted in `notes.md`.
- [ ] The ending is a cliffhanger (an honest near-fail, or a "next" banner on a win).
- [ ] The end card shows the player's own stats, the tease and a dominant PLAY FREE.
- [ ] No sound repeats faster than 3 times a second, and the mute button works.
