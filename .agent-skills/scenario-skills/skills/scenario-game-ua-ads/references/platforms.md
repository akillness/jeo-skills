# Platforms and placements

Specs move. These are authoring-time values from each platform's own ad specs and help centers.
Check the current spec and its safe-zone template before a paid campaign.

## Lookup

| Placement           | Canvas              | Length                          | Sound         |
| ------------------- | ------------------- | ------------------------------- | ------------- |
| TikTok In-Feed      | 9:16, 1080x1920     | hook in the first 3 s           | on            |
| Instagram Reels     | 9:16, 1080x1920     | no recommended length published | on by default |
| Instagram Stories   | 9:16, 1080x1920     | under 16 s plays as one card    | recommended   |
| Facebook Feed       | 4:5, 1080x1350      | no recommended length published | often off     |
| YouTube Shorts      | 9:16, 1080x1920     | 10 to 30 s for app installs     | on            |
| YouTube in-stream   | 16:9, 1920x1080     | at least 10 s, skippable at 5 s | mixed         |
| Snapchat            | 9:16, 1080x1920     | message landed in 3 to 5 s      | mostly on     |
| In-app ad networks  | 9:16 and 16:9, both | 15 and 30 s (6 and 60 s used)   | often off     |
| Google App campaign | 16:9, 9:16, and 1:1 | 10 to 60 s each                 | mixed         |

Without a length from the user, make 15 s, and 15 plus 30 s for ad networks.

## Safe zones

- **Reels and Stories**: keep text, logos, and key elements out of the top 14%, the bottom 35%, and
  6% on each side. On 1080x1920 that is y 270 to y 1248 and x 65 to x 1015.
- **TikTok In-Feed**: TikTok publishes a downloadable safe-zone file, not numbers. Until checked,
  use the Reels zone and also keep text out of the right-side button rail (about 140 px).
- **YouTube Shorts and in-stream**: Google publishes universal safe-zone templates. The Shorts call
  to action button appears at 3 s.
- **Feeds, Snapchat, ad networks**: no numeric zone published. Keep 6% margins and check the ads
  manager preview.

## How the placement changes the build

- **Bands on 9:16 social.** The top unsafe band holds only background. The HUD and hook sit just
  below it. The play area and every key action sit in the middle band. The bottom unsafe band holds
  background or the board's base, never a key action, the hook, or a burst word. Plan the board
  still in these bands before generating it.
- **4:5 and 1:1.** Recompose the board for the shorter canvas: fewer, larger pieces. Never crop the
  9:16 master.
- **16:9.** The board spreads sideways. Put the HUD in the top corners and the action in the center
  two thirds.
- **Sound off.** Feeds and ad networks often play muted. Burst words carry the beats and the counter
  tells the score, so the ad reads without sound.
- **Skippable at 5 s.** The hook, the stakes, and the game name land before the skip button.
- **End card call to action.** Social placements show their own call to action button, and TikTok,
  Google, and in-app network policies ban non-working button-like elements and fake play buttons.
  - On social placements, the call to action is a label (a ribbon, a bold line, a sign in the
    scene), never a pressable button shape, and the hand never taps it.
  - Ad-network end cards are clickable, so a button works there. Networks also take a separate
    end-card image: check its size in the network's spec.
- **Music.** Reels ads may not use licensed music. Generate the bed.
- **Real games.** Platform policies and regulators reject ads whose gameplay misrepresents the game,
  and the UK ASA has upheld such complaints against puzzle-style ads for games built around
  something else. For a real game, build from its own material ([inputs](inputs.md)).
