# Expert notes: sculpting (principles and judgment, by expert)

Source notes: `notes/sculpting/` (one per video) and the three digests `_digest_sculpt_courses.md`,
`_digest_sculpt_stylized.md`, `_digest_sculpt_studio_anatomy.md`. Timestamps are
`[video_id hh:mm:ss]`. Items marked [added] are this skill's own synthesis or measurement. Full
source list: `sources.md`.

## Julien Kaspar (Blender Studio character artist: Spring, Coffee Run, Sprite Fright)

Videos: Rain f-mx-Jfx9lA, Snow BJHede3Oagw, BCON19 YaVEJTLDD3Y, BCON23 FDscc66fC90, Michel
uGde7HdmCa8.

- **Decide who the character is before geometry**: ethnicity, gender, age, period, occupation,
  attitude; aim "abstracted enough to not be uncanny but also not too detached from reality"
  [f-mx-Jfx9lA 00:00:33]. Work from a concept drawing; skipping it for Rain cost time [00:02:55];
  for Snow he drew it first [BJHede3Oagw 00:01:08].
- **Blockout of many separate primitives, kept planar and rough "until the overall shapes are set in
  stone"** [f-mx-Jfx9lA 00:03:22]; block every major volume even inaccurately because 2D-to-3D
  translation needs compromises only visible in 3D [FDscc66fC90 00:06:21].
- **Voxel remesh replaced Dyntopo** except for Snake Hook pulls and local detail with the Density
  brush [YaVEJTLDD3Y 00:18:32]. Voxel-only (Snow) forces adding detail step by step and refining
  "equally throughout the entire character" [BJHede3Oagw 00:02:55]. A 5M-poly voxel remesh takes
  about 10 s where a Dyntopo flood fill takes minutes [YaVEJTLDD3Y 00:30:36].
- **After remeshing finer, run a global Smooth filter** to remove voxel jaggies instead of hunting
  with the brush [FDscc66fC90 00:11:55; YaVEJTLDD3Y 00:27:17]. Headless: `remesh_stage(relax=n)`.
- **Draw Sharp over Crease for most lines**: Crease pinches and stretches topology; Draw Sharp "just
  adds a sharp curvature ... saves you some time"; thicken the upper side of the line with Inflate
  [YaVEJTLDD3Y 00:22:23, 00:22:55].
- **At low resolution a strong Smooth works as a flatten** [YaVEJTLDD3Y 00:45:14]. Normal Radius
  sets the plane orientation sample; about 4 % of the radius snaps to the local surface for hard
  forms [00:28:43].
- **Hide, do not only mask, geometry near the brush**: masked geometry is still sampled for brush
  direction [FDscc66fC90 00:20:19-00:20:52].
- **Face sets by loose parts "95% of the time"** right after joining, by UV seams for two-sided thin
  parts [FDscc66fC90 00:14:41, 00:21:57]. Pose brush with Rotation Origins = Face Sets is exact;
  topology origins are loose [00:29:01; uGde7HdmCa8 00:11:04].
- **Grab with topology auto-masking "all the time"**; Grab Silhouette widens one finger without
  neighbors; Grab 2D moves through the full depth [FDscc66fC90 00:26:04-00:28:16]. On screen: Grab
  strength 0.4, Pose 0.5 with IK segments 1, smooth iterations 5.
- **Linked-data symmetric parts** allow asymmetric posing while sculpting symmetrically; make single
  user before Apply Scale; negative scale flips normals, and sculpting the negative copy inverts
  brushes [FDscc66fC90 00:04:06, 00:09:50; YaVEJTLDD3Y 01:01:02].
- **Apply scale and rotation before sculpting**; Snake Hook direction is corrupted by object
  rotation [YaVEJTLDD3Y 00:03:59, 00:42:04; f-mx-Jfx9lA 00:06:40].
- **Keep symmetry alive as long as possible**: "the longer i can keep the symmetry alive the more
  work i will save myself" [uGde7HdmCa8 00:47:08]; save the symmetric rest state as a shape key
  before posing [01:28:08]. "Go in more drastically and then clean up" [00:35:08].
- **Test the design, not just the sculpt**: expression shape keys (on the base level only, never
  multires levels; eyelids need 3 to 4 loops; 30 frames between expressions) and a full-pose test
  reveal proportion errors (brows too high, teeth too small) [f-mx-Jfx9lA 00:09:11-00:10:49;
  BJHede3Oagw 00:06:42].
- **Eyes**: sculpted eyes are never round, insert real spheres; "It's always going to look better
  with eyelids"; paint the iris early to find appeal [YaVEJTLDD3Y 00:38:25, 01:00:04, 00:51:02].
- **Progress the whole body evenly**, do not finish the head while the body is spheres [YaVEJTLDD3Y
  00:15:13]. "It always looks hideous until it doesn't" [00:31:12].
- **Uneven density by region at the production step** (face and hands denser), retopology starts
  from minimal loops [BJHede3Oagw 00:04:34, 00:08:19]. Clothing: solid volumes first, extract thin
  cloth last; folds only where fabric compresses or stretches [BJHede3Oagw 00:04:01; f-mx-Jfx9lA
  00:07:14].
- **Review**: black silhouette viewport permanently beside the working view [YaVEJTLDD3Y 00:06:46];
  turn vertex colors off regularly because color hides form [f-mx-Jfx9lA 00:04:59]; 90 mm lens to
  compare with the concept [uGde7HdmCa8 00:46:31]; Studio "paint" light for color, not a matcap
  [FDscc66fC90 00:36:27].
- Numbers on screen: voxel 0.008 m (leg) and 0.004225 m (torso) on a real-scale base mesh, parts 3k
  to 8k verts, merged figure about 39k verts, paint-ready about 2M verts [FDscc66fC90 00:11:39,
  00:16:09, 00:33:58]; Rain head polish 190k to 250k verts, body sculpt 1.1M to 2M; Rain retopo body
  16.6k faces, Snow about half [f-mx-Jfx9lA 00:15:51; BJHede3Oagw 00:10:00].

## Damiaan Thelen (lead character artist, Egosoft)

Video: gC3FG8-4lsU (BCON23, realistic male head from a sphere in 50 minutes).

- **Plane-first**: sketch the face as sharp simplified planes with Draw Sharp, soften toward realism
  as resolution grows; **re-cut the primary planes whenever a face "looks off"**, that alone often
  fixes it [00:05:43, 00:15:08, 00:36:42-00:37:15].
- **Features exist only in context**: judge proportions after several features are blocked, and
  suspect neighbors when one area looks wrong [00:09:00, 00:43:29].
- **Lock proportions while coarse**: every later adjustment moves more polygons [00:12:52]. "Always
  use as small a poly count as you can get away with" [00:22:34].
- **Smooth one form at a time, never across forms** [00:24:17].
- **Neck first**: cylinder rotated about 15 degrees forward, shoulders leave at an angle;
  sternomastoid, trapezius, mass under the jaw [00:01:44-00:06:49].
- **Eyelid mass trick**: a UV sphere with a pulled cornea is joined and remeshed into the face as
  the lid volume; a copy becomes the real eyeball [00:15:43-00:18:33]. Headless version:
  `Sculptor.open_eyelids` [added].
- Ratios: head height about 1.5 x width [00:00:35]; top view tapers forward, widest right behind the
  ear [00:01:11]; ear bottom at nose base, top on eye line [00:04:04]; eye line at the vertical
  center [00:07:22]; one eye width between the eyes, eyeballs slightly smaller [00:17:24]; equal
  thirds hairline-brow-nose base-chin [00:20:46]; male jaw 90 to 100 % of cheekbone width
  [00:20:46]; outer-canthus span about equal to brow-to-mouth [00:21:22]; nose-bottom angle about 90
  degrees [00:25:23]; lip corners line up with the eyeballs in profile [00:27:40]; canthal tilt
  about 8 degrees [00:46:10]; scleral show below the iris ideally none [00:46:42].
- **Appeal**: averageness is pleasing but forgettable; diverge through sexual dimorphism at brow,
  jaw and nose [00:21:22-00:22:34]; harmony beats single ideals (wide jaw needs matching cheekbones,
  a longer face carries bigger eyes) [00:44:02]; nasolabial folds defined little because they age
  the face [00:26:31]; a beak mouth means missing tissue at the corners [00:27:40]; break symmetry
  with a resting expression (smirk corner), not noise [00:38:27]; eyebrows are needed to read a face
  [00:45:38]. Beauty standards are culture dependent; state the target [00:30:29].

## Uldis Zarins (author of "Anatomy for Sculptors")

Video: -3b7hDQUfIg (BCON23, construction of the head).

- **Blockouts are guidelines to navigate organic chaos, "not the topology"** [00:05:45]; start from
  Loomis (sphere with chopped sides) or Bammes (egg) [00:07:00-00:09:31]; "if there is no border you
  have to draw it" (temporal line) [00:33:38].
- **Build the skull first**: "if you build wrong skull you probably will build the wrong soft
  tissue" [00:14:41]; rely on bony landmarks because they do not move [00:19:31].
- Widest head point: parietal eminence a little behind the ear; widest face point: top of the
  zygomatic arch [00:21:25, 00:25:18]. Restore the temporalis volume where Loomis chopped the sides
  [00:27:45].
- Face : brain case about 1 : 1.5 adult, 1 : 3 newborn [00:11:11]. The gonial angle is the age and
  sex dial: steep in adult males, open in infants and the elderly [00:28:46, 00:32:08].
- Dimorphism: brow ridge with glabella, steep ramus, sharp gonial angle and wide chin read
  masculine; frontal eminences, rounded jaw angles and narrow chin read feminine; sculptors project
  their own sex onto characters [00:29:51-00:31:00, 00:35:05].
- Neck attaches where the line from orbit floor through ear canal meets the back of the skull
  [00:40:24]. The average face is the zero point you push from [00:24:45].

## Nikolay Naydenov (SpeedChar; character artist at Gameloft, 15 years)

Videos: proportions oY9XybQRxzQ (ZBrush, transfers directly), game character episodes 01
a05leXFSf-0, 20 DZ0T4bcchcs, 21 PkQ2wD8t_f0, 22 LFjXmRvQpxs.

- **Proportion rules as placement errors**: nose bottom halfway between brow line and chin, not
  between eye line and chin [oY9XybQRxzQ 00:05:49]; lip parting one third down from the nose, not
  the midpoint [00:09:06]; eye line at half height, slightly higher for a strong big-chinned male
  [00:03:23]; head five eyes wide, one eye between [00:07:28]; mouth corners below the middle of the
  eyes [00:08:33]; ears between nose line and brow line [00:10:37], mid head depth in profile with
  only about 1.5 ear widths behind [00:17:26], pulled away from the head, never glued flat
  [00:19:35]; from the front the ear's start is hidden because the skull widens behind it
  [00:23:59]; front of the neck starts at mid-jaw in profile [00:16:53].
- **"Don't leave the head like a balloon ... it looks more like a square"** [00:15:26]; simplify
  hard areas into planes, then smooth [00:32:25].
- Mouth last: dig the corners, raise the upper lip rather than pushing it forward, reduce the lower
  lip to a central trapezoid, upper lip emerges from inside out [00:41:35-00:44:39]. Features too
  small for the head: mask the face and scale up [00:48:35]. Skull fit test with transparency
  [00:55:50].
- **Production context**: a game character starts from a brief and a concept sheet; head and body
  are separate meshes from day one [a05leXFSf-0 00:02:13, 00:03:33]; "don't go with too much
  resolution too fast" [00:06:48]; about 20+ hours per character [00:41:52].
- **Detail size is set by the game camera**: "we cannot have this kind of very tiny little details"
  [DZ0T4bcchcs 00:03:17]; big holes "because it will be viewed from around here" [00:20:39]; "too
  sharp is always a problem" for the bake [00:15:43]; main forms beat details [00:30:56]; know when
  to stop [00:29:50].
- **High poly for the bake**: every item that gets its own flat color is its own object [PkQ2wD8t_f0
  00:02:13]; vertex colors become an ID map in Substance Painter [LFjXmRvQpxs 00:08:43]; high-poly
  objects closed [00:11:38]; normal-map-only details stay shallow, inside the silhouette [00:46:38];
  sign-off by lead and art director before low poly [00:03:46]. Head reprojection: Quad Remesher
  about 8,000 tris, Multires to about 2M, Shrinkwrap Project with Negative, apply one level down
  [DZ0T4bcchcs 00:32:35-00:35:21]. Real-scale heads need proportional voxel sizes: a large voxel
  destroyed a sub-2 m head [00:31:28].

## Jim Morren (CG Boost; realistic head)

Video: BPAvvF8py1M.

- **Spend a long time at low resolution**: all landmarks and the skull silhouette before any detail
  pass [00:17:03]. Landmarks first, "fast and loose", then correct against reference; the head is
  "basically just a skull with skin on it" [00:05:48, 00:16:28].
- **Landmark pencil**: Crease with pinch reduced, strength raised, Ctrl to raise [00:05:16].
- **Voxel 0.05 on a 2 m head (about H/40) for blocking, 0.0085 (about H/235) for detail** [00:04:45,
  00:20:56].
- **Move whole features**: mask, remove the mask where it touches neighbors, smooth it, invert, Set
  Pivot to Unmasked, Scale or Move [00:23:38, 00:33:29].
- **Eyeball spheres late** for realism: they anchor the lids to a size you may not want [00:23:06].
- **95 mm lens** to match photo reference and remove distortion [00:13:14]. Typical skull errors:
  egg-shaped or too square; forehead that turns into the side "straight and then BAM" [00:15:56,
  00:16:28].
- Build then polish instead of smoothing: Clay Strips "fatty tissue" into crevices, then Flatten
  with Normal Radius 1 as "a polishing brush" [00:28:35, 00:29:39]. Lower the Smooth strength so
  blending keeps forms [00:14:21].
- Mouth corners roughly line up with the eyes; "the face from the side should have a very slight
  triangular shape" [00:35:07]. Nose sits deep in the face [00:10:19]. Not every muscle shows: fat
  and skin cover them [00:52:07]. Zoom out to fight tunnel vision [00:37:48]. Dotted crease strokes:
  spacing 5 %, Adjust Strength for Spacing off [00:47:04].

## Zach Reinhardt (CG Boost; Moai course, 20+ years in 3D)

Video: KURuPAVJ6hM.

- **Primitives matching the concept's big volumes**, crude; resolution from remesh [00:20:45,
  00:24:29]. "Never ever go too high with the resolution when you're just starting" [00:30:32].
- **Unapplied scale is the first suspect** whenever sculpting misbehaves [00:27:17].
- **Protrusions by mask + Move, not strokes**: lasso outline from the side, Smooth Mask 3
  iterations, Sharpen, clean with the Mask brush at 1, invert, Move tool, remesh to heal
  [00:44:15-00:46:29, 00:52:28].
- **Scrape for clean planes**, Flatten "not really giving us what we want" here [00:40:53]; many
  scrape strokes make carved stone facets [01:32:03].
- **Sharpen pass after every remesh**: Draw Sharp into creases, Scrape to shave the peaks, tiny
  smooth, Pinch [01:08:49-01:12:40]. "Don't worry if we are losing some sharp details, we will
  sharpen the whole thing later" [00:55:12].
- **Grab falloff changes the shape**: Sharp for a folded smile corner, Smooth for masses [01:25:31].
  Asymmetry pass last, after a ground object shows what the camera sees [01:23:56, 01:28:17].
- **Surface breakup varies in scale and spacing**: pits with Draw, Sphere falloff, spacing 300 %,
  high jitter, Subtract, Radius Unit Scene, two size passes; damage "not too tiny and not uniformly
  spread" [01:36:32-01:43:05]. Restore spacing 10 % and jitter 0 afterwards [02:37:29].
- **Cavity auto-masking left on silently disables filters** on the next object [02:20:18, 02:34:08].
  Same voxel size on every object seen together [02:23:37]. Angled key light, not frontal, to show
  surface detail [03:12:14].

## Grant Abbitt (long-time Blender educator)

Videos: 9N87-yRR5aE (3.6), K7AJVx0H3Ec (4.4).

- **"Keep as low detail as possible for as long as possible"**: Smooth equalizes vertex spacing, so
  it moves big polygons a lot (useful early) and fine ones barely (useful late) [9N87-yRR5aE
  00:08:26, 00:08:58; K7AJVx0H3Ec 00:09:04]. Distiller measurement: 34 % of a bump removed at voxel
  0.08 vs 3 % at 0.02.
- **Gate at about 100k faces**: shape correct before, detail at about 500k [K7AJVx0H3Ec 00:28:11,
  00:29:49]; about 0.5M ceiling on older machines, 3M on a strong one [9N87-yRR5aE 00:06:46]. Voxel
  ladder on a 1 m radius sphere: 0.08, 0.07, 0.06, 0.03, about 0.01, 0.006.
- Remesh whenever Grab stretches polygons [9N87-yRR5aE 00:07:52]; pull forms from the side, not
  head-on [00:07:20]; crease, smooth, crease, smooth [K7AJVx0H3Ec 00:35:47]; remesh loses detail,
  restate after [00:22:13].
- Landmarks: eyes at half height [K7AJVx0H3Ec 00:11:45]; jaw line to about halfway [00:13:15]; ear
  from nose base to middle of the eye [00:25:28]; half an eyeball between eye and nose bridge
  [9N87-yRR5aE 00:13:51]; top lip ahead of the bottom lip [00:21:35]; upper lid overlaps the iris,
  lower lid less [00:26:25]; brows must match the mouth expression [00:28:57]; face wraps like a
  cylinder [K7AJVx0H3Ec 00:12:17]. Eyeballs early for stylized heads, UV sphere rotated 90 on X so
  the pole reads as a pupil [9N87-yRR5aE 00:13:19].

## Henning Sanden (FlippedNormals co-founder, film and games sculptor)

Video: Cmi0KoFtc-4.

- **Three or four brushes do the vast majority**: Draw, Clay Strips, Grab, Draw Sharp, plus Smooth
  on Shift [00:03:33]. Clay Strips "90% of the time" with tip roundness about 0.5 and no radius
  pressure [00:05:44].
- **Default Smooth "nukes the entire shape"**: about 0.2 [00:07:20] (5.2 default 0.7).
- **Resolution by phase**: Dyntopo and remesh for concepting (Dyntopo with Snake Hook for new
  appendages; remesh gives "nice and proper" polygons, Dyntopo "nasty and triangulated"), Multires
  only on a settled base [00:13:01-00:16:04]; keep Multires viewport level equal to sculpt level
  [00:17:43].
- **Balanced matcap, cavity off by default**: cavity makes forms look more voluminous than they are
  [00:25:17, 00:25:50].

## Ryan King (Blender tutorial author; stylized heads)

Videos: Km9JSdWTjVY, CbZChQoi46k, Lxem4yMs5Dg, mgHsZZiyd54 (Blender 5.0).

- **Hard stylized male = sharp and angular**: flat skull sides, sharp jaw, thick square chin,
  straight hard nose built as a triangle from below, slightly pointed skull top; his own verdict:
  "more sharp, not quite as round" [Km9JSdWTjVY 00:05:50, 00:09:35, 00:27:24; CbZChQoi46k 00:27:40].
- **Profile rhythm**: nose out, in, mouth out, in, chin out; flat faces are the beginner error
  [Km9JSdWTjVY 00:10:42, 00:16:33]. The mouth wraps around the head.
- **Eyeball in first, lids built around it**; move the eyeball, not the skin, when it sits wrong;
  upper lid three planes (up, across, down), lower lid flatter, both thin; inverted crease sharpens
  the lid edge [Km9JSdWTjVY 00:18:11-00:24:11]. A deep brow crease reads angry [00:25:47].
- Crease semantics: plain crease cuts a V, Ctrl-crease pinches a knife ridge (lid rim, lip border,
  ear rim) [Km9JSdWTjVY 00:23:06]. Accumulate and Front Faces Only on, per brush [00:03:01].
- **Cute**: lumpy egg body, stubby masked-and-pulled limbs, big smile, round sockets, bigger pupils;
  Crease Polish because Crease Sharp is "a little bit too sharp"; crease sharpness is capped by
  local density, remesh finer first; mask, invert, Elastic Snake Hook for limbs [mgHsZZiyd54
  00:10:44, 00:15:28, 00:16:00, 00:21:13, 00:43:11]. "It's better to work with less topology,
  especially at the starting" [00:14:55].
- Remesh for forming and fusing, Dyntopo only for local detail (freckles, gills) [Lxem4yMs5Dg
  00:22:08; mgHsZZiyd54 00:27:29]. Front Faces Only matters on thin fins [Lxem4yMs5Dg 00:29:48].
- **Finish without retopology for stills**: vertex colors on the dense mesh, Decimate 0.4 applied
  last, expression on a duplicate with symmetry off, fake a head turn by moving the shoulders,
  catchlight disk light [CbZChQoi46k 00:04:45, 00:18:32, 00:19:04, 00:24:10].

## Keelan Jon (character artist and teacher; the most scriptable method)

Video: amVAlpxHp8k.

- **One subdivided primitive per part** (cube + Subdivision 2 applied), apply scale on every part,
  duplicates moved only along the symmetry plane [00:04:34-00:06:47]. "Force ourselves to not go
  into too much detail yet" [00:05:07].
- **Join only where a seam would show** (head, jaw, nose); keep neck and ears separate [00:24:19].
- **Remesh in steps and symmetrize after every remesh**: "remeshing can sometimes create
  inconsistencies between the left and the right" [00:26:35]. Measured [added]: raw voxel remesh
  mirror error about 0.6 voxel.
- Budgets: about 29k faces while defining a head, about 101k for the smooth finish; hair 4k then
  22k; clothing 10k to 22k [00:32:40, 00:44:57, 00:52:56, 01:29:50].
- Draw Sharp 0.65 with Sharper falloff for one-stroke cuts, Crease 0.15 to refine, Inflate to close
  and plump a seam [00:31:34, 00:34:18, 00:35:25]. Smooth then redefine [00:44:57].
- Eyelids as a shell from the eyeball (half sphere duplicated, filled, inset 3 times, tilted)
  [00:37:05]. Brows and lids must emerge from the skin: Inflate so they stick out [01:00:48].
- Line Project for a flat bust base and cloak hem [00:17:27]; never voxel-remesh an open thin sheet,
  subdivide it [01:23:40]; Mask Extract for clothing, Mesh Filter smooth in small increments
  [01:17:26, 01:18:37]; Scrape for flat sharp edges [01:30:23].
- Sculpt under matcap with cavity (ridge 0.5, valley 1.2); paint under the white studio light
  [01:44:48, 01:45:22]. Camera 90 mm [02:08:33].

## YanSculpts (character sculptor and educator; stylization judgment)

Videos: vB7kPWjBgQI, IG1IEpU5VAw, N4D6F7mhi4I, uoYtqlm6dfY, jZbFYD8JivI.

- **Stylization is controlled exaggeration of real anatomy**; appeal is "very very important"
  [vB7kPWjBgQI 00:07:26].
- **Pick the defining exaggeration in the first minute** and apply it to the whole mass (pull the
  sphere down for a long face) [00:01:09].
- **Never stylize by stretching**: a long face needs a smaller skull, or it "will just look
  stretched" [00:35:38]. **Stylize neighbors together**: a stylized face on an unstylized neck
  fails; a long chin made the neck read short, fixed by masking the face and pulling the neck down;
  a squished face was fixed by moving ears and jaw back, not by widening [01:13:23, 01:14:34,
  01:23:25].
- **Indicate small landmark features early** (nostrils, brows, eyes, ears): nostrils revealed a
  too-wide nose [00:05:11, 00:19:18]. Brows close to the eyes on a neutral male [00:19:18].
- Ratios: nose base about midway eye line to chin; mouth line one third nose base to chin; ear from
  eye line to nose base on the widest skull point; neck starts behind the ears; shoulders line up
  with the ears in profile [00:02:53, 00:08:35, 00:17:29, 01:27:06].
- **Weakest-link loop under a time limit, with breaks**: "find the weakest link, work on that,
  improve it and then go for the next" [00:54:04]; "if you're working on anything for too long ...
  you don't really see the mistakes anymore" [01:29:16]. A form "hanging out ... like hey look at
  me" without a reason gets smoothed back [00:50:35]. Hair frames the face and must not compete;
  three strands [01:08:06, 01:10:27].
- Brush roles: Draw for big chunks, Clay Strips "the magic brush" for anatomical masses, Crease for
  separations, Scrape with a flat curve for refinement (most of his last 1.5 h), Pinch after
  smoothing for clean edges [IG1IEpU5VAw 00:15:47-00:22:29]. Long lens 80 to 100 [00:04:51];
  perspective, not ortho, while sculpting [vB7kPWjBgQI 00:16:53]; viewport shadows off while judging
  [N4D6F7mhi4I 00:08:42].

---

## Stylization playbook (cross-expert)

- **Shape language by type**: hard male = sharp planes, square chin, flat skull sides (Ryan King);
  cartoony undead = big round nose, wide smile, deep bony sockets, big forehead, flat upper lip
  (Keelan Jon); cute = egg masses, stubby limbs, big pupils, softer creases (Ryan King); long-faced
  male = long face, small skull, thick mouth volume at the corners, big ears pushed out, wide neck
  against a thin face (Yan). Sources: `_digest_sculpt_stylized.md` playbook.
- **Exaggeration rules**: one or two defining exaggerations chosen first (Yan 00:01:09); applied to
  every neighbor (Yan 01:13:23); never uniform stretching (Yan 00:35:38); face-to-brain-case ratio
  as the age and cuteness lever, 1 : 3 newborn vs 1 : 1.5 adult (Zarins 00:11:11) [added: use it to
  stylize young or cute characters]; dimorphism as the lever for striking realistic characters
  (Thelen 00:21:57).
- **Appeal cues**: mouth corners slightly up; brow crease too deep reads angry; bigger pupils cuter;
  catchlights; relaxed tilted lids read "doesn't care" (Ryan King, Keelan Jon); eyelids always
  (Kaspar); intentional asymmetry at the end (Thelen, Kaspar, Reinhardt).
- **Simplify**: flatten the upper lip, keep ears simple, smooth away forms that draw attention for
  no reason (Keelan Jon 00:36:31, Ryan King 00:44:16, Yan 00:50:35).

## Where experts disagree, and the deciding condition

| Topic              | Positions                                                                                                                                         | Decide by                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Start geometry     | sphere morphed (Thelen, Naydenov, Morren, Abbitt); one primitive per part (Keelan Jon, Kaspar, Reinhardt); existing base mesh (Kaspar 2023, Snow) | single head study: sphere; character with distinct parts or an agent needing deterministic placement: primitives; lineup or time pressure: reuse |
| Eyeball timing     | early, lids built around it (Ryan King, Keelan Jon, Abbitt, Kaspar); late, size the socket first (Morren)                                         | stylized with a fixed eye size: early; realistic proportion search: late                                                                         |
| Line tool          | Crease among the starters (Kaspar Rain, Abbitt); Draw Sharp for most lines, Crease only for late polish (Kaspar 2019, Thelen)                     | Draw Sharp while topology still changes; pinching crease for final crisp folds                                                                   |
| Clean planes       | Scrape (Reinhardt, Yan, Keelan Jon); Flatten with normal radius 1 as polish (Morren)                                                              | hard carved planes: Scrape; soft blends between organic masses: wide-normal Flatten                                                              |
| Smoothing          | strong smooth as a flatten at low res (Kaspar); one form at a time (Thelen); strength 0.2 (Henning)                                               | blocky low-res stage: aggressive; once features sit side by side: local and light                                                                |
| Resolution tool    | Dyntopo relative detail (Ryan King heads, Yan, Rain); voxel only (Keelan Jon, Snow, all course videos)                                            | headless: voxel only (Dyntopo needs strokes); GUI: Dyntopo only for Snake Hook pulls or a local detail burst                                     |
| Ear top            | brow line (Naydenov); eye line (Thelen, Yan); mid-eye (Abbitt)                                                                                    | all agree on the bottom at the nose base; treat the top as a band from eye line to brow line                                                     |
| Sharpness          | sharper is better on a hard male (Ryan King); "too sharp is always a problem" for a game bake (Naydenov); Yan makes neck junctions too sharp      | sharp on bony defining edges, soft into soft tissue; a game bake target caps sharpness at what the texel density resolves                        |
| Matcap cavity      | off, it inflates volume (Henning); on, it reads creases (Yan, Keelan Jon, Ryan King)                                                              | judge big forms without cavity, read lines and creases with it                                                                                   |
| Symmetry mechanism | Mirror modifier with a center object (Rain); linked duplicates (Kaspar 2019/2023); mesh symmetry + Symmetrize (Michel, Keelan Jon)                | separate posed parts: linked data; one merged mesh: symmetric kernels + `S.symmetrize` after remeshes                                            |

## Planes, jaw and cheek, hair, expressions (cross-expert, added v2 after the E2 evaluation)

**Planes.** Thelen sketches the face as sharp simplified planes with Draw Sharp, then softens as
resolution grows, and re-cuts the primary planes whenever they get lost: if re-cutting fixes the
look the problem was lost form, if not it is proportion (gC3FG8-4lsU 00:05:43, 00:15:08, 00:36:42 to
00:37:15). Naydenov: simplifying a difficult area into planes then smoothing is a good way to start
a face; front view reads flat front, angled sides, flat sides (oY9XybQRxzQ 00:32:25, 00:13:26).
Reinhardt: Scrape, not Flatten, for clean planes; Lasso Trim for chin and eye recesses; Line Project
for perfectly flat ear sides (KURuPAVJ6hM 00:40:53, 00:28:21, 00:47:01). Kaspar draws plane borders
and lines with Draw Sharp rather than a pinching Crease (YaVEJTLDD3Y 00:22:23) and reads planes in a
flat-shaded render (f-mx-Jfx9lA 00:05:32). Ryan King flattens the jaw side with Ctrl Clay Strips and
names sharper edges as the fix for his own round result (Km9JSdWTjVY 00:07:28 to 00:08:01;
CbZChQoi46k 00:27:40).

**Jaw and cheek.** Zarins: the mandible is placed with its gonial angle, steep in adult males, open
in infants and the elderly; the widest face point is the top of the zygomatic arch (-3b7hDQUfIg
00:28:11 to 00:29:19, 00:25:18). Naydenov: straight jaw sides with a triangle under the jaw, the
cheekbone line from the ear down and forward, only its lower edge showing, the masseter a disc of
mass smoothed except its front edge (oY9XybQRxzQ 00:20:41, 00:25:14, 00:29:30, 00:40:46). Thelen:
male jaw 90 to 100 percent of cheekbone width, the jawline bone plus tissue and not razor sharp, the
cheek ogee judged in three-quarter (gC3FG8-4lsU 00:20:46, 00:32:17, 00:36:09).

**Hair for stylized characters.** Yan: hair mimics the skull (so the skull comes first), three
strands is the magic number with a small fourth for interest, and hair is kept off the eyes and
forehead so it frames the face (vB7kPWjBgQI 00:59:15, 01:08:06, 01:10:27). Keelan Jon: a subdivided
cube grabbed into a slicked-back mass, remeshed at about 4k faces, ridges with Draw Sharp,
re-creased after each remesh (amVAlpxHp8k 00:50:44 to 00:56:54). Thelen: hairline from the facial
thirds, male square or M, and hair makes a male head read better even as clay strands (gC3FG8-4lsU
00:48:26 to 00:50:38). Kaspar keeps hair as separate objects (f-mx-Jfx9lA 00:05:32). Naydenov: bald
versus haired changes the read a lot (oY9XybQRxzQ 00:53:05).

**Expressions.** Kaspar sculpts expressions as shape keys on the base level with Grab and Smooth,
adds asymmetry to each, and uses the set to find proportion errors that he fixes in the neutral
(f-mx-Jfx9lA 00:09:44 to 00:11:22). Thelen breaks symmetry at the end with a resting smirk corner
(gC3FG8-4lsU 00:38:27 to 00:39:35). Reinhardt switches Grab to Sharp falloff for a crisp bent smile
corner, in a late asymmetry pass (KURuPAVJ6hM 01:25:31, 01:23:56). Ryan King: duplicate, symmetry
off, one eye more open, a brow up, mouth corners uneven (CbZChQoi46k 00:18:32 to 00:20:09).

**Resolution tools.** Henning: Dyntopo and voxel remesh are concepting tools, Multires is for
refining once a base with decent topology exists (Cmi0KoFtc-4 00:16:04). Kaspar smooths globally
with a filter after remeshing finer instead of hunting with the brush (FDscc66fC90 00:11:55). Yan
marks nostrils early because they expose proportion errors (vB7kPWjBgQI 00:05:11).

## Measurements made while building this skill [added]

- faces = 1.5 x area / voxel^2 within 3 % on spheres and ellipsoids (5.2.1); example bust: H/40
  6.1k, H/80 23k, H/130 60k faces.
- Raw voxel remesh is not X-symmetric: nearest-vertex mirror distance max 0.67 to 0.75 voxel, mean
  0.05 to 0.07 voxel (spheres, ellipsoid, head; voxel 0.02 to 0.08; re-measured v2, a grader using
  another measure found 0 to 0.25 voxel); `mesh.symmetrize(direction='POSITIVE_X')` keeps +X.
- `.sculpt_mask` survives voxel remesh (preserve attributes on by default).
- Subdivided-box faces sit at 0.84 x scale; primitive facets larger than the voxel survive the
  remesh.
- Headless crash matrix: `procedures.md` P12.
- In a GUI, `view3d.view_selected` in Sculpt Mode does not frame; `bx_gui.set_view` handles it
  (frames in Object Mode and restores the mode) (`procedures.md` P13).
- v2 (test_planes_sdf.py): `rounded_box` (Catmull-Clark cube) reads as a ball before smoothing
  (sphere_rms 0.027, side planarity 0.068); `sd_round_box` side planarity 0.000. Nine Taubin smooth
  passes at voxel 0.05 widened a primitive seam from R 0.195 to 0.202; a Clay blend of 0.15 gives
  0.46.
- v2: `plane_cut` on a unit sphere took planarity from 0.034 to 0.000 (a full-strength flatten or
  scrape dab: 0.005); `corner_cut` made two faces at 90.0 degrees.
- v2: `lower_face_report` sphere_rms: E2 balloon jaws 0.057 to 0.082, E2 baseline 0.18 to 0.20, v2
  example 0.23 to 0.26. Planes cut on a balloon flipped it to 0.115 while the render showed a gem
  facet.
- v2 (expression_readability.py): 2.83 px per mm with the bust filling 1080 px, 0.75 px per mm at
  270 px; an 8 mm corner move read at both, 2 mm at neither.
