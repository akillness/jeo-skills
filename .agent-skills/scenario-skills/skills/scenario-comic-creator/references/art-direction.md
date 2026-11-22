# Art direction: a comic that feels made

A comic can pass every check in this skill and still be stock. Stock means slop: work that nothing
ties to this story or this hand, so a stranger could not tell it from ten thousand others. Image
models drift toward the average of everything they have seen.

Some image makers bring a strong house taste to every prompt. The models on Scenario follow
instructions literally and bring none. The prompt has to supply the opinions: who this looks like,
what it is made of, and what it may never do.

## Three levels of prompt

| Prompt level | What comes back                                                        |
| ------------ | ---------------------------------------------------------------------- |
| Plain        | Stock: shiny-eyed cozy illustration, centered figures, even glow       |
| Mood         | A second stock: the dark cinematic painting every moody prompt ends in |
| Directed     | A page with a hand and a point of view                                 |

- **Plain** means story facts plus "watercolor, warm, cute".
- **Mood** means style adjectives, or an artist name alone.
- **Directed** means two named influences, a material, hard rules, a FORBIDDEN list and one choice
  only this story could make.

In a test of eleven directions on one page script, four kept an identity with no extra rules. Four
more came back as the same dark cinematic painting. Adding hard rules and a FORBIDDEN list to those
four gave three of them a clear identity. See [transformations.md](transformations.md).

## The direction formula

1. **Two named influences.** Name the artists in the prompt, such as "in the manner of Hugo Pratt
   and José Muñoz". The names set the family. A blend avoids a pastiche of one hand.
2. **A material and a tool.** Dip pen, dry brush, gouache, screentone, Ben-Day dots, cut paper, flat
   printing inks.
3. **Three hard rules,** written as facts about the page: "One uniform line weight." "Color is four
   flat inks." "Tone exists only as visible dots."
4. **A FORBIDDEN list.** Gradients, glow, cinematic lighting, photographic depth, shiny eyes, smooth
   shading, texture filters. Without it the model slides back to the default.
5. **One choice only this story could make.** A single lamp that is the only light. A floor plan
   seen from above. One orange spot color used only for what the lesson is about.

Restraint carries identity. A page that does one thing hard beats a page that does ten things well.
Ready-made directions are in [style-library.md](style-library.md).

## Names, traits and limits

- Traits do the work and names set the family. Always pair a name with its traits and its hard rule.
- If a model refuses a name, or the team has IP detection on artist styles, keep the traits and the
  rules and drop the name (`scenario-moderation`). Check `ipDetectionEnforcement` on the team row.
- For a commercial deliverable, the buyer decides whether to name living artists. Movements and
  long-published masters give the same families.
- The goal is a family resemblance and a new page. Never ask for a copy of a specific artwork.

## Color or black and white, detailed or minimal

| Quadrant                  | Lean on                                                         |
| ------------------------- | --------------------------------------------------------------- |
| Black and white, minimal  | Pure black masses, white as light, few strokes                  |
| Black and white, detailed | Precise line, screentone or hatching, real faces                |
| Color, minimal            | Flat fills, big paper, one spot color                           |
| Color, detailed           | Fine ink under flat color plates, rich objects and architecture |

Quiet stories suit minimal, and stories about a world suit detailed. Pick the quadrant first, then
the influences.

## Find the specific

- Reject the first logline. Write five, then cut every one the average would write: a talking pet, a
  magic place, a hero who learns to believe in themselves. Keep the one with a specific want, a
  concrete obstacle and a place that has its own rules.
- A user's premise is a starting point. Keep every fact they gave (names, ages, pets, places,
  occasion) and find the angle nobody else would take on those facts.
- Look for the camera idea inside the story. A missing cake becomes a crime-scene floor plan seen
  from above.
- Personalized comics live on one true detail from the supplied facts: a habit, an object, a phrase,
  a street. Use it where it counts. Never invent it.
- Write each line in the speaker's voice. In showpiece mode, cut any line that states a moral. In
  clear-first mode, state the lesson once per page in plain words
  ([clear-first.md](clear-first.md)).
- End on an image the reader keeps.

## The look bible

Write one page before the style round. Every later prompt reads it.

| Item        | Decide                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------- |
| Influences  | Two named artists or movements, and what to take from each                                  |
| Hard rules  | Three facts about line, color and tone                                                      |
| Forbidden   | What this book never does                                                                   |
| Faces       | One trait taken from each influence (nose, eyes, jaw, hair) and the generic face you refuse |
| Light logic | One motivated source per scene and where its shadows fall                                   |
| Value plan  | Where the darkest dark and the brightest light go                                           |
| Palette     | At most four named colors plus the paper, and a spot color if any                           |
| Ground      | Clear-first only: paper or a light flat is the largest area, text sits on it                |

Ask the user for one comic, film or painting they love and one they dislike. Both are style
information. Unattended with none given, take both from the story's own place, period and audience,
and write them into the brief as assumptions.

## Camera and rhythm

These rules serve a reader who chose a comic. Clear-first mode keeps the dominant panel and trades
variety for clarity ([clear-first.md](clear-first.md)).

- Each page has one dominant panel that holds the beat. Equal-size grids read as filler.
- Each page mixes an insert (a hand, an object, an eye), a wide shot that fixes geography, and a
  close shot that carries the feeling. Change camera height on purpose.
- Two consecutive pages never share the same grid or camera setup.
- Add silent beats: a panel with no words per page, and one silent page in a book of six pages or
  more.
- Place figures off-axis with an eyeline and a foreground overlap. Use scale once: a small figure in
  a large space, or a face that fills the page.

## Acting

- Name a specific feeling with a cause. "Wants to laugh and is annoyed that she does" beats "happy".
  Carry it in posture, hands and gaze.
- Faces have an asymmetry, a tell, an age. A hero who is only cute reads as a mascot.
- Every panel changes a state: someone wants more, knows more or has lost something.

## The taste review

This gate decides whether a page is worth publishing. Run it on the style round, on the first
finished page, and on the assembled book. A vision model reads with the look bible, and the user
sees the same sheet. In clear-first mode run it on the style anchor and on the finished book's
contact sheet, and render the stock twin for page 1 only.

**The stock twin.** Render the same page from a plain prompt (story facts and the genre label only),
with the same model and quality. Put it beside the directed page. The directed page must differ at a
glance in at least four of six: line, palette, value structure, composition, surface, acting. If it
does not, the direction did not take. Rewrite the hard rules and redraw.

**The trend check.** The twin catches the model's default. Each genre also has a look of the moment,
such as grainy flat-color print for a picture-book night or dark cinematic paint for fantasy. Write
that look in one line, then name one visible choice on the page a trend-follower would not make. If
there is none, rewrite the direction.

**Fresh eyes.** The agent that wrote the prompt does not grade the page. A separate pass sees the
page, the look bible and the questions below, never the prompt, and writes the verdict.

**Seven questions,** each answered yes or no with a crop as evidence:

1. Hand: can you name two influences visible on the page, faces included?
2. Rules: does every hard rule hold, and is anything from the FORBIDDEN list present?
3. Only here: is there one choice that comes from this story and could not move to another book?
4. Value plan: is there a true dark and a true light, placed on purpose?
5. Restraint: what was left out on purpose?
6. Thumbnail: at 200 pixels wide, do the shapes and the mood survive?
7. Memory: can the reviewer describe the page in one sentence of images?

**Verdicts.** Three labels, worded neutrally because a client may read them:

- **Distinctive**: the page has a hand, and one choice that could not move to another book. It
  ships.
- **Competent**: well made, with no choice of its own. In showpiece mode it gets one rewrite of the
  direction paragraph and a redraw. In clear-first mode it ships when it reads.
- **Generic**: nothing ties the page to this story, so it is stock. It is redrawn once from a
  rewritten paragraph that names the failing rule.

In showpiece mode the style anchor and the first finished page should reach Distinctive before any
other page runs. When their attempt cap runs out first, follow the cap rules in
[review-and-fix.md](review-and-fix.md). Unattended, the separate reviewer writes the verdict for
every page and the stock twin of page 1 stays in the deliverables folder.

## Strongest settings

- Use the top-ranked model and set the highest quality value its schema offers for the style round,
  sheets and final pages. The suggested input from `recommend` can be a lower tier, so read the
  schema and raise it. Page proofs run at a middle value ([page-production.md](page-production.md)).
- Size for the deliverable and write prompts of 600 to 1,000 words once a book has a template.
  Length carries light, camera and acting.
- Draw on the top-ranked model. Add a second model to the style round only when the user asks or the
  top model fails the stock twin twice. Drop a model after one failure on its output limit. Log the
  choice and the runner-up.
