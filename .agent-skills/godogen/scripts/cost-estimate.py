#!/usr/bin/env python3
"""Offline Godogen asset cost estimate at a pinned upstream rate table.

This script performs no network requests and calls no provider. Rates were verified
against htdt/godogen commit 05cebffc8b10c5817e8a3db495b82e7b6004ab84.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass

PINNED_COMMIT = "05cebffc8b10c5817e8a3db495b82e7b6004ab84"


@dataclass(frozen=True)
class LineItem:
    operation: str
    quantity: int
    unit_cents: int

    @property
    def subtotal_cents(self) -> int:
        return self.quantity * self.unit_cents

    def to_dict(self) -> dict[str, int | str]:
        item = asdict(self)
        item["subtotal_cents"] = self.subtotal_cents
        return item


def nonnegative_int(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be zero or greater")
    return parsed


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Estimate Godogen asset API costs offline. Provider prices can change; "
            "recheck current upstream before a real spend."
        )
    )
    p.add_argument("--grok-images", type=nonnegative_int, default=0, help="2 cents each")
    p.add_argument("--gemini-512", type=nonnegative_int, default=0, help="5 cents each")
    p.add_argument("--gemini-1k", type=nonnegative_int, default=0, help="7 cents each")
    p.add_argument("--gemini-2k", type=nonnegative_int, default=0, help="10 cents each")
    p.add_argument("--gemini-4k", type=nonnegative_int, default=0, help="15 cents each")
    p.add_argument("--video-seconds", type=nonnegative_int, default=0, help="Grok video, 5 cents per second")
    p.add_argument("--glb", type=nonnegative_int, default=0, help="default Tripo GLB, 30 cents each")
    p.add_argument("--glb-hd", type=nonnegative_int, default=0, help="HD Tripo GLB, 60 cents each")
    p.add_argument("--rig", type=nonnegative_int, default=0, help="default GLB plus biped rig, 55 cents each")
    p.add_argument("--rig-hd", type=nonnegative_int, default=0, help="HD GLB plus biped rig, 85 cents each")
    p.add_argument("--retarget", type=nonnegative_int, default=0, help="Tripo retarget clip, 10 cents each")
    p.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    return p


def build_items(args: argparse.Namespace) -> list[LineItem]:
    raw = [
        ("Grok image", args.grok_images, 2),
        ("Gemini image 512", args.gemini_512, 5),
        ("Gemini image 1K", args.gemini_1k, 7),
        ("Gemini image 2K", args.gemini_2k, 10),
        ("Gemini image 4K", args.gemini_4k, 15),
        ("Grok video second", args.video_seconds, 5),
        ("Tripo GLB default", args.glb, 30),
        ("Tripo GLB HD", args.glb_hd, 60),
        ("Tripo biped rig default", args.rig, 55),
        ("Tripo biped rig HD", args.rig_hd, 85),
        ("Tripo retarget clip", args.retarget, 10),
    ]
    return [LineItem(name, quantity, unit) for name, quantity, unit in raw if quantity]


def main() -> int:
    args = parser().parse_args()
    items = build_items(args)
    total = sum(item.subtotal_cents for item in items)

    if args.json:
        print(
            json.dumps(
                {
                    "ok": True,
                    "network_requests": 0,
                    "pinned_commit": PINNED_COMMIT,
                    "currency": "USD",
                    "items": [item.to_dict() for item in items],
                    "total_cents": total,
                    "total_dollars": f"{total / 100:.2f}",
                    "warning": "Recheck current upstream and provider pricing before spending.",
                },
                indent=2,
            )
        )
        return 0

    print("== Godogen asset cost estimate (offline) ==")
    print(f"Pinned upstream: {PINNED_COMMIT}")
    if not items:
        print("No paid operations selected.")
    else:
        print(f"{'Operation':30} {'Qty':>5} {'Unit':>8} {'Subtotal':>10}")
        for item in items:
            print(
                f"{item.operation:30} {item.quantity:5d} "
                f"{item.unit_cents:7d}c {item.subtotal_cents:9d}c"
            )
    print(f"Total: {total} cents (${total / 100:.2f})")
    print("No provider was contacted. Recheck current prices before approval and spend.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
