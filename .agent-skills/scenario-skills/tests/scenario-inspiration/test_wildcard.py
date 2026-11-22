"""Tests for the wildcard card sampler shipped with scenario-inspiration."""

from __future__ import annotations

import io
import json
import os
import random
import sys
import unittest
from contextlib import redirect_stdout
from importlib import util

SCRIPT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "skills",
    "scenario-inspiration",
    "scripts",
    "wildcard.py",
)


def load_module():
    spec = util.spec_from_file_location("wildcard", SCRIPT)
    module = util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


wildcard = load_module()


class CorpusTest(unittest.TestCase):
    def test_every_facet_in_order_has_a_pool(self):
        for facet in wildcard.FACET_ORDER:
            if facet == "domain":
                self.assertTrue(wildcard.DOMAIN_CLUSTERS)
            else:
                self.assertIn(facet, wildcard.POOLS)

    def test_pools_cover_facet_order_exactly(self):
        self.assertEqual(
            sorted([*wildcard.POOLS, "domain"]),
            sorted(wildcard.FACET_ORDER),
        )

    def test_default_facets_are_known(self):
        for facet in wildcard.DEFAULT_FACETS:
            self.assertIn(facet, wildcard.FACET_ORDER)

    def test_no_duplicate_values_inside_a_pool(self):
        for facet, pool in wildcard.POOLS.items():
            self.assertEqual(len(pool), len(set(pool)), f"{facet} has duplicates")

    def test_no_duplicate_domains_across_clusters(self):
        seen = [d for domains in wildcard.DOMAIN_CLUSTERS.values() for d in domains]
        self.assertEqual(len(seen), len(set(seen)))

    def test_pools_are_large_enough_to_beat_a_four_way_draw(self):
        # The point of the script is spread; a pool below the usual draw size
        # would make spread impossible.
        for facet, pool in wildcard.POOLS.items():
            self.assertGreaterEqual(len(pool), 8, facet)
        self.assertGreaterEqual(len(wildcard.DOMAIN_CLUSTERS), 4)

    def test_every_cluster_carries_several_domains(self):
        for cluster, domains in wildcard.DOMAIN_CLUSTERS.items():
            self.assertGreaterEqual(len(domains), 2, cluster)


class DrawTest(unittest.TestCase):
    def test_seed_makes_the_draw_reproducible(self):
        a = wildcard.draw(4, wildcard.DEFAULT_FACETS, random.Random(99))
        b = wildcard.draw(4, wildcard.DEFAULT_FACETS, random.Random(99))
        self.assertEqual(a, b)

    def test_different_seeds_give_different_draws(self):
        a = wildcard.draw(4, wildcard.DEFAULT_FACETS, random.Random(1))
        b = wildcard.draw(4, wildcard.DEFAULT_FACETS, random.Random(2))
        self.assertNotEqual(a, b)

    def test_count_controls_card_count(self):
        for count in (1, 3, 7):
            cards = wildcard.draw(count, wildcard.DEFAULT_FACETS, random.Random(5))
            self.assertEqual(len(cards), count)

    def test_labels_are_sequential_letters(self):
        cards = wildcard.draw(4, ["strategy"], random.Random(5))
        self.assertEqual([c["label"] for c in cards], ["A", "B", "C", "D"])

    def test_no_facet_value_repeats_within_a_draw(self):
        cards = wildcard.draw(8, wildcard.FACET_ORDER, random.Random(11))
        for facet in wildcard.FACET_ORDER:
            values = [c[facet] for c in cards]
            self.assertEqual(len(values), len(set(values)), facet)

    def test_clusters_are_distinct_within_a_draw(self):
        for seed in range(25):
            cards = wildcard.draw(6, ["domain"], random.Random(seed))
            clusters = [c["cluster"] for c in cards]
            self.assertEqual(len(clusters), len(set(clusters)))

    def test_domain_belongs_to_its_reported_cluster(self):
        cards = wildcard.draw(10, ["domain"], random.Random(3))
        for card in cards:
            self.assertIn(card["domain"], wildcard.DOMAIN_CLUSTERS[card["cluster"]])

    def test_only_requested_facets_appear(self):
        cards = wildcard.draw(2, ["light", "mood"], random.Random(4))
        for card in cards:
            self.assertEqual(set(card), {"label", "light", "mood"})

    def test_cluster_rides_along_with_domain_only(self):
        cards = wildcard.draw(2, ["strategy"], random.Random(4))
        for card in cards:
            self.assertNotIn("cluster", card)

    def test_facets_are_emitted_in_canonical_order(self):
        cards = wildcard.draw(1, ["mood", "light", "strategy"], random.Random(4))
        keys = [k for k in cards[0] if k != "label"]
        self.assertEqual(keys, ["strategy", "light", "mood"])

    def test_draw_covers_the_whole_pool_over_many_seeds(self):
        # A sampler that quietly favors the head of a list would defeat the
        # purpose, so check every strategy can actually come up.
        seen = set()
        for seed in range(400):
            for card in wildcard.draw(4, ["strategy"], random.Random(seed)):
                seen.add(card["strategy"])
        self.assertEqual(seen, set(wildcard.POOLS["strategy"]))


class DrawErrorTest(unittest.TestCase):
    def test_count_below_one_is_rejected(self):
        with self.assertRaises(ValueError):
            wildcard.draw(0, ["strategy"], random.Random(1))

    def test_empty_facet_list_is_rejected(self):
        with self.assertRaises(ValueError):
            wildcard.draw(2, [], random.Random(1))

    def test_unknown_facet_is_rejected_by_name(self):
        with self.assertRaises(ValueError) as ctx:
            wildcard.draw(2, ["strategy", "vibes"], random.Random(1))
        self.assertIn("vibes", str(ctx.exception))

    def test_count_beyond_cluster_count_is_rejected(self):
        too_many = len(wildcard.DOMAIN_CLUSTERS) + 1
        with self.assertRaises(ValueError) as ctx:
            wildcard.draw(too_many, ["domain"], random.Random(1))
        self.assertIn("domain", str(ctx.exception))

    def test_count_beyond_a_small_pool_is_rejected(self):
        smallest = min(wildcard.POOLS, key=lambda f: len(wildcard.POOLS[f]))
        with self.assertRaises(ValueError):
            wildcard.draw(
                len(wildcard.POOLS[smallest]) + 1, [smallest], random.Random(1)
            )


class FacetCapacityTest(unittest.TestCase):
    def test_domain_capacity_is_cluster_count_not_domain_count(self):
        self.assertEqual(wildcard.facet_capacity("domain"), len(wildcard.DOMAIN_CLUSTERS))
        total_domains = sum(len(v) for v in wildcard.DOMAIN_CLUSTERS.values())
        self.assertLess(wildcard.facet_capacity("domain"), total_domains)

    def test_other_capacities_are_pool_sizes(self):
        self.assertEqual(wildcard.facet_capacity("mood"), len(wildcard.POOLS["mood"]))


class RenderTest(unittest.TestCase):
    def test_render_reports_the_seed_for_replay(self):
        cards = wildcard.draw(2, ["strategy"], random.Random(77))
        out = wildcard.render(cards, 77)
        self.assertIn("--seed 77", out)

    def test_render_shows_cluster_beside_the_domain(self):
        cards = wildcard.draw(1, ["domain"], random.Random(8))
        out = wildcard.render(cards, 8)
        self.assertIn(cards[0]["domain"], out)
        self.assertIn(f"[{cards[0]['cluster']}]", out)

    def test_render_lists_every_non_domain_facet(self):
        cards = wildcard.draw(1, ["light", "mood"], random.Random(8))
        out = wildcard.render(cards, 8)
        self.assertIn("light", out)
        self.assertIn(cards[0]["mood"], out)

    def test_render_list_names_facets_and_clusters(self):
        out = wildcard.render_list()
        for facet in wildcard.FACET_ORDER:
            self.assertIn(facet, out)
        for cluster in wildcard.DOMAIN_CLUSTERS:
            self.assertIn(cluster, out)

    def test_render_list_counts_domains_rather_than_assuming_cluster_size(self):
        # Guards against a hardcoded domains-per-cluster factor, which would
        # print a wrong total the moment one cluster gains or loses an entry.
        total = sum(len(v) for v in wildcard.DOMAIN_CLUSTERS.values())
        domain_line = next(
            line for line in wildcard.render_list().splitlines() if "clusters," in line
        )
        self.assertIn(str(total), domain_line)

    def test_render_list_totals_survive_an_uneven_cluster(self):
        original = wildcard.DOMAIN_CLUSTERS
        uneven = {k: list(v) for k, v in original.items()}
        uneven[sorted(uneven)[0]].append("a freshly added domain")
        wildcard.DOMAIN_CLUSTERS = uneven
        try:
            domain_line = next(
                line
                for line in wildcard.render_list().splitlines()
                if "clusters," in line
            )
            self.assertIn(str(sum(len(v) for v in uneven.values())), domain_line)
        finally:
            wildcard.DOMAIN_CLUSTERS = original


class CliTest(unittest.TestCase):
    def run_cli(self, argv):
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            code = wildcard.main(argv)
        return code, buffer.getvalue()

    def test_json_output_is_parseable_and_carries_the_seed(self):
        code, out = self.run_cli(["--count", "3", "--seed", "12", "--json"])
        self.assertEqual(code, 0)
        payload = json.loads(out)
        self.assertEqual(payload["seed"], 12)
        self.assertEqual(len(payload["cards"]), 3)

    def test_json_matches_the_library_draw_for_the_same_seed(self):
        _, out = self.run_cli(["--count", "2", "--seed", "31", "--json"])
        expected = wildcard.draw(2, wildcard.DEFAULT_FACETS, random.Random(31))
        self.assertEqual(json.loads(out)["cards"], expected)

    def test_all_selects_every_facet(self):
        _, out = self.run_cli(["--count", "2", "--seed", "5", "--facets", "all", "--json"])
        card = json.loads(out)["cards"][0]
        for facet in wildcard.FACET_ORDER:
            self.assertIn(facet, card)

    def test_facets_flag_tolerates_spacing(self):
        _, out = self.run_cli(
            ["--count", "1", "--seed", "5", "--facets", " mood , light ", "--json"]
        )
        card = json.loads(out)["cards"][0]
        self.assertEqual(set(card), {"label", "light", "mood"})

    def test_list_flag_short_circuits_the_draw(self):
        code, out = self.run_cli(["--list"])
        self.assertEqual(code, 0)
        self.assertIn("default facets", out)

    def test_missing_seed_still_reports_one(self):
        _, out = self.run_cli(["--count", "2", "--json"])
        payload = json.loads(out)
        self.assertIsInstance(payload["seed"], int)
        replay = wildcard.draw(2, wildcard.DEFAULT_FACETS, random.Random(payload["seed"]))
        self.assertEqual(payload["cards"], replay)

    def test_text_output_is_the_default(self):
        _, out = self.run_cli(["--count", "2", "--seed", "5"])
        self.assertIn("seed: 5", out)
        self.assertNotIn("{", out)

    def test_impossible_count_exits_with_an_error(self):
        with self.assertRaises(SystemExit) as ctx:
            with redirect_stdout(io.StringIO()):
                stderr = io.StringIO()
                old, sys.stderr = sys.stderr, stderr
                try:
                    wildcard.main(["--count", "99"])
                finally:
                    sys.stderr = old
        self.assertEqual(ctx.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
