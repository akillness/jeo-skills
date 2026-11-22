#!/usr/bin/env python3
"""Draw wildcard cards: far-domain lenses for widening a creative brief.

An agent asked to "pick something random" does not sample, it averages: the
same handful of domains, palettes, and techniques come back every session.
This script draws instead. It samples from a curated corpus with a real RNG,
and it enforces spread, so no two cards in one draw share a facet value and no
two cards come from the same domain cluster.

Run by the agent during the widen step of the scenario-inspiration skill.
Standard library only, no network, no credits.

    python3 wildcard.py --count 4
    python3 wildcard.py --count 4 --seed 20260816 --json
    python3 wildcard.py --count 3 --facets domain,strategy,constraint
    python3 wildcard.py --list
"""

from __future__ import annotations

import argparse
import json
import random
import sys

# Domains are grouped into clusters so a draw cannot return four flavors of the
# same idea. One cluster contributes at most one card per draw.
DOMAIN_CLUSTERS: dict[str, list[str]] = {
    "deep-nature": [
        "hydrothermal vent chimneys",
        "slime mold growth fronts",
        "lichen colonies on granite",
        "cephalopod chromatophores",
        "moth wing scales at magnification",
        "salt flat crystallization",
        "mangrove root systems",
        "termite mound ventilation shafts",
    ],
    "built": [
        "brutalist parking structures",
        "roadside bus stop pavilions",
        "stepwells cut into rock",
        "timber stave churches",
        "rooftop accretion in dense housing",
        "cooling tower interiors",
        "capsule tower apartments",
        "irrigation terraces on a hillside",
    ],
    "craft": [
        "patched and re-patched work textiles",
        "carved and painted folk figures",
        "strip-woven cloth sewn into panels",
        "tin-glazed blue and white pottery",
        "weaving workshop color samplers",
        "gold-seam ceramic repair",
        "carved horn and antler tools",
        "hand-drawn carpet cartoons",
    ],
    "industry": [
        "shipbreaking beaches",
        "textile mill bobbin walls",
        "foundry pour on night shift",
        "container port gantry cranes",
        "printing press make-ready sheets",
        "fish cannery lines",
        "quarry cutting faces",
        "grain elevator interiors",
    ],
    "science": [
        "cloud chamber particle tracks",
        "schlieren airflow photography",
        "anatomical teaching plates",
        "radio telescope dish arrays",
        "diffraction patterns from crystals",
        "bathymetric survey charts",
        "electron micrographs of alloys",
        "weather balloon instrument packs",
    ],
    "vernacular": [
        "hand-painted truck decoration",
        "laundromat signage lettering",
        "roadside shrine assemblages",
        "skate park concrete patina",
        "market stall tarpaulin colors",
        "barbershop wall diagrams",
        "pigeon loft architecture",
        "allotment shed improvisation",
    ],
    "stage": [
        "carved theatrical masks",
        "carnival float construction",
        "rod and string puppet mechanisms",
        "ceremonial firefighter coats",
        "circus rigging and guy lines",
        "liturgical vestment embroidery",
        "cut leather shadow puppets",
        "pageant lighting rigs",
    ],
    "archive": [
        "botanical lithograph plates",
        "portolan navigation charts",
        "seed catalogue covers",
        "fire insurance maps",
        "silent film title cards",
        "naval signal flag manuals",
        "mail order catalogue plates",
        "typographic specimen books",
    ],
    "frontier": [
        "polar research station interiors",
        "deep mine cage descents",
        "high altitude balloon gondolas",
        "desert seismic survey camps",
        "submarine control rooms",
        "glacier ice core libraries",
        "volcano monitoring huts",
        "orbital debris tracking screens",
    ],
    "market": [
        "night market lighting",
        "fishmonger ice displays",
        "apothecary drawer walls",
        "vending machine banks",
        "flower auction halls",
        "spice sack geometry",
        "hardware store bin walls",
        "bakery window staging",
    ],
}

POOLS: dict[str, list[str]] = {
    "strategy": [
        "swap the figure and the ground",
        "make the background the subject",
        "age it two hundred years, then repair it",
        "build it for someone half the size",
        "remove the most expensive element",
        "state the opposite and mean it",
        "keep only the silhouette, rebuild the rest",
        "borrow the joinery, discard the shape",
        "design the packaging before the thing",
        "take the second-most-obvious answer",
        "make the repair the most visible part",
        "let the process leave its marks",
        "do it in the wrong material",
        "honor the error instead of hiding it",
        "reduce until one thing remains, then add back one",
        "move the light, not the camera",
        "treat it as evidence, not as illustration",
        "shift it one climate over",
        "shift it one century over",
        "give it a smell, then draw that",
        "show it mid-repair rather than finished",
        "ask what the night shift sees",
        "make the cheap version, then the sacred version",
        "keep the rhythm, change everything else",
    ],
    "constraint": [
        "readable as a silhouette in solid black",
        "no more than three values",
        "every element on a strict grid",
        "nothing perfectly straight",
        "the subject occupies under fifteen percent of frame",
        "symmetry broken exactly once",
        "no faces visible",
        "all edges soft, no hard boundary",
        "must survive being scaled to 32 pixels",
        "negative space carries the read",
        "no text anywhere",
        "a single light source, no fill",
        "the horizon never appears",
        "repetition with one deliberate error",
        "nothing machined, everything hand-made",
        "one material throughout",
        "square frame, and it stays square",
        "the subject is partly occluded",
        "no pure black and no pure white",
        "one continuous unbroken contour",
    ],
    "light": [
        "single hard key with black falloff",
        "overcast north light, no shadows",
        "sodium vapor street orange",
        "underwater caustics",
        "candlelight at eye level",
        "backlit fog with visible beams",
        "fluorescent tube ceiling wash",
        "moonlight with practical windows",
        "rim light against a dark field",
        "bounce off a strongly colored wall",
        "firelight from below",
        "sunrise raking across texture",
        "overhead noon with short shadows",
        "even studio softbox, flat",
        "neon spill on wet ground",
        "projector beam through dust",
        "screen glow on faces",
        "stage followspot with a hard edge",
        "clerestory shafts across a floor",
        "headlamp beam in darkness",
        "refrigerated case cold white",
        "golden hour long shadows",
        "silhouette against a bright sky",
        "lightning flash frozen mid-frame",
    ],
    "palette": [
        "two colors only, plus paper white",
        "near-monochrome with one accent",
        "complementary split at low saturation",
        "warm neutrals against cold shadow",
        "full desaturation except skin tones",
        "high-key pastels, no true black",
        "black, bone, and oxide red",
        "analogous greens climbing to yellow",
        "duotone, ink over a tinted ground",
        "fluorescent accent over a muted base",
        "earth pigments only",
        "metallic on matte black",
        "washed denim and rust",
        "cyan shadows, amber highlights",
        "one hue, rotated through value only",
        "print misregistration as color",
        "sun-bleached plastics",
        "jewel tones on velvet black",
        "chalk and charcoal on grey",
        "the obvious palette, inverted",
    ],
    "material": [
        "worn enamel over steel",
        "unfired clay",
        "oiled hardwood",
        "brushed aluminium",
        "waxed canvas",
        "blown glass with bubbles",
        "cast concrete with form marks",
        "felted wool",
        "lacquered paper",
        "corroded bronze",
        "extruded plastic with visible seams",
        "pressed tin",
        "woven cane",
        "resin with suspended particles",
        "raw silk",
        "galvanized mesh",
        "burnished leather",
        "terrazzo aggregate",
        "salt-crusted rope",
        "crackle-glazed ceramic",
    ],
    "technique": [
        "risograph two-pass print",
        "gouache on toned paper",
        "silverpoint drawing",
        "cel animation over painted backgrounds",
        "cyanotype contact print",
        "linocut with visible tool marks",
        "airbrushed pulp cover art",
        "technical isometric line drawing",
        "collaged cut paper",
        "wet plate photography",
        "flat vector with hard shadows",
        "oil impasto on board",
        "pixel art on a fixed palette",
        "stop motion photographed under lights",
        "screen print with halftone dots",
        "ink wash with reserved whites",
        "graphite rendering with sheen",
        "photogrammetry with mesh artifacts",
        "stained glass leading",
        "tapestry weave with visible warp",
        "scratchboard, white on black",
        "marbled paper floated on water",
        "blueprint reversal",
        "embroidery on canvas",
    ],
    "camera": [
        "worm's-eye at ankle height",
        "top-down flat lay",
        "wide angle with edge distortion",
        "long lens compressed portrait",
        "macro at material scale",
        "long lens through foreground clutter",
        "isometric three-quarter",
        "dead-center symmetrical",
        "over-the-shoulder into depth",
        "extreme close on one detail",
        "wide establishing with a tiny figure",
        "handheld and tilted off-axis",
        "reflected in a curved surface",
        "framed through a doorway",
        "high corner, surveillance angle",
        "flatbed scan, no perspective",
    ],
    "mood": [
        "patient and unhurried",
        "brittle tension",
        "ceremonial gravity",
        "offhand and unposed",
        "exhausted after effort",
        "reverent",
        "gleeful and unruly",
        "clinical detachment",
        "nostalgic without sentiment",
        "ominous but still",
        "convivial and crowded",
        "solitary and self-sufficient",
        "newly abandoned",
        "freshly built and unused",
        "weathered but maintained",
        "improvised under pressure",
        "festive at closing time",
        "watchful",
        "quietly triumphant",
        "bureaucratically dull",
    ],
}

FACET_ORDER = [
    "domain",
    "strategy",
    "constraint",
    "light",
    "palette",
    "material",
    "technique",
    "camera",
    "mood",
]

DEFAULT_FACETS = ["domain", "strategy", "constraint", "light", "palette", "technique"]


def facet_capacity(facet: str) -> int:
    """How many distinct cards a facet can supply in one draw.

    Domain is capped by cluster count, not by domain count: one cluster
    contributes at most one card, which is what keeps a draw from returning
    four variations on the same idea.
    """
    if facet == "domain":
        return len(DOMAIN_CLUSTERS)
    return len(POOLS[facet])


def draw(count: int, facets: list[str], rng: random.Random) -> list[dict[str, str]]:
    """Draw `count` cards, spread across every requested facet.

    No facet value repeats within a draw, and each card's domain comes from a
    different cluster. Raises ValueError when a facet cannot supply `count`
    distinct values.
    """
    if count < 1:
        raise ValueError("count must be at least 1")

    unknown = [f for f in facets if f != "domain" and f not in POOLS]
    if unknown:
        raise ValueError(f"unknown facet(s): {', '.join(sorted(unknown))}")
    if not facets:
        raise ValueError("at least one facet is required")

    for facet in facets:
        capacity = facet_capacity(facet)
        if count > capacity:
            raise ValueError(
                f"count {count} exceeds what facet '{facet}' can spread over "
                f"({capacity} distinct values)"
            )

    columns: dict[str, list[str]] = {}
    for facet in facets:
        if facet == "domain":
            clusters = rng.sample(sorted(DOMAIN_CLUSTERS), count)
            columns["domain"] = [rng.choice(DOMAIN_CLUSTERS[c]) for c in clusters]
            columns["cluster"] = clusters
        else:
            columns[facet] = rng.sample(POOLS[facet], count)

    ordered = [f for f in FACET_ORDER if f in facets]
    cards = []
    for i in range(count):
        card: dict[str, str] = {"label": chr(ord("A") + i) if i < 26 else str(i + 1)}
        for facet in ordered:
            card[facet] = columns[facet][i]
            if facet == "domain":
                card["cluster"] = columns["cluster"][i]
        cards.append(card)
    return cards


def render(cards: list[dict[str, str]], seed: int) -> str:
    lines = [f"seed: {seed}  (re-draw this exact set with --seed {seed})", ""]
    for card in cards:
        header = card["label"]
        if "domain" in card:
            header = f"{header}. {card['domain']}  [{card['cluster']}]"
        lines.append(header)
        for facet in FACET_ORDER:
            if facet == "domain" or facet not in card:
                continue
            lines.append(f"   {facet:<10} {card[facet]}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_list() -> str:
    lines = ["facet       pool  notes"]
    domains = sum(len(v) for v in DOMAIN_CLUSTERS.values())
    lines.append(
        f"{'domain':<11} {domains:>4}  "
        f"{len(DOMAIN_CLUSTERS)} clusters, one card each per draw"
    )
    for facet in FACET_ORDER:
        if facet == "domain":
            continue
        lines.append(f"{facet:<11} {len(POOLS[facet]):>4}")
    lines.append("")
    lines.append("clusters: " + ", ".join(sorted(DOMAIN_CLUSTERS)))
    lines.append("default facets: " + ",".join(DEFAULT_FACETS))
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Draw far-domain wildcard cards for a creative brief."
    )
    parser.add_argument(
        "--count", type=int, default=4, help="how many cards to draw (default 4)"
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="RNG seed; omitted means a fresh random seed, printed so the draw repeats",
    )
    parser.add_argument(
        "--facets",
        default=",".join(DEFAULT_FACETS),
        help=f"comma-separated facets, or 'all'. Default: {','.join(DEFAULT_FACETS)}",
    )
    parser.add_argument("--json", action="store_true", help="emit JSON")
    parser.add_argument(
        "--list", action="store_true", help="show facets, pool sizes, and clusters"
    )
    args = parser.parse_args(argv)

    if args.list:
        sys.stdout.write(render_list())
        return 0

    raw = args.facets.strip()
    facets = list(FACET_ORDER) if raw == "all" else [f.strip() for f in raw.split(",")]
    facets = [f for f in facets if f]

    seed = args.seed if args.seed is not None else random.SystemRandom().randrange(2**31)

    try:
        cards = draw(args.count, facets, random.Random(seed))
    except ValueError as exc:
        # parser.error() prints usage and exits 2; it never returns.
        parser.error(str(exc))

    if args.json:
        sys.stdout.write(json.dumps({"seed": seed, "cards": cards}, indent=2) + "\n")
    else:
        sys.stdout.write(render(cards, seed))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
