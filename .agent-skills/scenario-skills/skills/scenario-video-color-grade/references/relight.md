# Relighting (spatial light ops)

`"relight"` is a list applied in linear light, in order, before the look's color ops. Coordinates
are fractions of the frame (0-1, origin top-left); strengths are in stops.

## light_gradient: directional light

```json
{
  "op": "light_gradient",
  "angle": 0,
  "strength": 0.8,
  "color": [1.0, 0.72, 0.45],
  "falloff": 1.3,
  "ambient": -0.3
}
```

- `angle`: where the light comes FROM (0 left, 90 top, 180 right, 270 bottom; e.g. 20 = from the
  left, slightly from below).
- `strength`: stops added at the lit edge; negative shades it. `falloff`: >1 concentrates the light
  near the edge.
- `color`: tint of the light (normalized, so brightness comes from strength). Warm sun ≈ [1, 0.72,
  0.45]; cool sky / moon ≈ [0.7, 0.85, 1.1].
- `ambient`: stops applied to the whole frame. Dropping ambient a little (−0.2 to −0.5) makes the
  added light read as the key light.

## spotlight: soft elliptical light (moving subjects supported)

```json
{
  "op": "spotlight",
  "center": [0.3, 0.45],
  "radius": [0.2, 0.5],
  "strength": 0.9,
  "color": [1.0, 0.8, 0.6],
  "feather": 0.6,
  "outside": -0.6,
  "keys": [
    [0, 0.3, 0.45],
    [3.5, 0.18, 0.45],
    [7.9, 0.3, 0.45]
  ]
}
```

- `outside`: stops for everything outside the spot (negative = darker surroundings, theatrical).
- `keys`: `[time_seconds, cx, cy]` keyframes, linearly interpolated, so the light follows a subject.
  Get positions by pulling frames at those times (`inspect_frame.py grid --frame N`).

## graduated_filter: glass grad filter

```json
{
  "op": "graduated_filter",
  "angle": 90,
  "position": 0.35,
  "softness": 0.25,
  "strength": -0.4,
  "color": [1.0, 0.75, 0.55]
}
```

- `angle`: the edge it starts from (90 top = sky). `position`: center of the transition (0-1 from
  that edge). Negative strength darkens (ND); `color` tints (warm sunset sky, cool storm).

## Recipes

| Goal                      | Relight                                                                             | Color ops after                                                        |
| ------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Golden sun from the left  | light_gradient angle 0, +0.8, warm, ambient −0.3; graduated_filter top, −0.35, warm | white_balance +0.1, contrast 0.2, warm split-tone highlights, rolloff  |
| Day-for-night with a lamp | spotlight on the subject, +0.9 warm, outside −0.6                                   | exposure −1.3, white_balance −0.3, saturation 0.75, contrast 0.35      |
| Theatrical spotlight      | spotlight +0.4 neutral, outside −0.9                                                | contrast 0.25, rolloff                                                 |
| Overcast / soften         | graduated_filter top +0.25 cool                                                     | white_balance −0.06, contrast −0.25, saturation 0.8, levels black 0.03 |
| Stormy sky                | graduated_filter top −0.8 slightly cyan                                             | contrast 0.4, saturation 0.7                                           |

## Making it believable

- Match the light direction to the existing highlights and shadows; a gradient that contradicts the
  shadows looks like a filter.
- Prefer several moderate ops over one strong one. Check skin: warm light over skin quickly turns
  orange.
- A full time-of-day change is often easiest as a `match` to an image of the same kind of scene at
  the target time, plus a gentle light_gradient.
- It cannot create new cast shadows or change the shapes of shadows.
