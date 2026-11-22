import base64
import contextlib
import importlib.util
import io
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import zlib
from datetime import datetime, timezone
from pathlib import Path
import unittest.mock as mock

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "skills/scenario-admin-analytics/scripts/analytics.py"
SPEC = importlib.util.spec_from_file_location("analytics_edges_module", SCRIPT)
A = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(A)
NOW = datetime(2026, 9, 17, 12, tzinfo=timezone.utc)
HAS_REPORTLAB = importlib.util.find_spec("reportlab") is not None


def make_envelope(models=None, consumption=None, start="2026-08-01T00:00:00Z", end="2026-08-31T23:59:59.999Z", daily=True, fetched_at=None, user_ids=None):
    """A usage envelope whose totals reconcile. Each model: (id, name, [(time, cu, jobs, api_cu)])."""
    if models is None:
        models = [("model_a", "Example A", [("2026-08-10T00:00:00Z", 12, 2, 1)])]
    if consumption is None:
        consumption = [("user_a", 10, 2)]
    include = ["entities"] + (["modelUsages.daily"] if daily else [])
    query = {"team_id": "team_example", "project_id": "project_example", "scope": "team", "start_date": start, "end_date": end, "include": include}
    if user_ids:
        query["user_ids"] = user_ids
    summary = [
        {"modelId": mid, "modelName": name, "totalCU": sum(p[1] for p in points), "totalJobs": sum(p[2] for p in points), "totalApiKeyCU": sum(p[3] for p in points)}
        for mid, name, points in models
    ]
    response = {
        "scope": {"mode": "team", "teamId": "team_example", "contextProjectId": "project_example", "projectIds": None, "userIds": user_ids},
        "totals": {
            "totalCU": sum(c[1] for c in consumption),
            "totalDiscountCU": sum(c[2] for c in consumption),
            "totalBeforeDiscountCU": sum(c[1] + c[2] for c in consumption),
            "startDate": start,
            "endDate": end,
        },
        "consumption": [{"userId": uid, "value": v, "discount": d, "total": v + d} for uid, v, d in consumption],
        "modelUsages": summary,
        "assetUsages": [],
        "entities": {"users": [{"id": uid, "fullName": f"Person {uid}", "isApiKey": False} for uid, _, _ in consumption]},
    }
    if daily:
        response["modelUsages.daily"] = [
            {"modelId": mid, "points": [{"time": t, "cost": cu, "jobs": jobs, "discount": 0, "apiKeyCost": api, "apiKeyDiscount": 0} for t, cu, jobs, api in points]}
            for mid, _, points in models
        ]
    return {"query": query, "fetched_at": fetched_at or NOW.isoformat(), "response": response}


def pdf_streams(path):
    """Decoded content streams of a ReportLab PDF (ASCII85 then zlib, the library default)."""
    out = []
    for raw in re.findall(rb"stream\r?\n(.*?)endstream", Path(path).read_bytes(), re.S):
        data = raw.strip()
        try:
            data = zlib.decompress(base64.a85decode(data, adobe=True))
        except ValueError:
            with contextlib.suppress(zlib.error):
                data = zlib.decompress(data)
        out.append(data)
    return b"\n".join(out)


class QueryAndTimestampTests(unittest.TestCase):
    def base_query(self, **changes):
        q = {"team_id": "t", "project_id": "p", "start_date": "2026-08-01", "end_date": "2026-08-31"}
        q.update(changes)
        return q

    def test_rejected_queries_name_the_problem(self):
        cases = [
            (dict(self.base_query(), limit=5), "Unsupported usage query fields"),
            (self.base_query(team_id=""), "Explicit scope and dates required: team_id"),
            ({k: v for k, v in self.base_query().items() if k != "end_date"}, "end_date"),
            (self.base_query(start_date="2026-09-01"), "Inclusive end precedes start"),
            (self.base_query(scope="org"), "Invalid project/team filter"),
            (self.base_query(user_ids=[]), "Invalid ID filter: user_ids"),
            (self.base_query(project_ids=["a,b"]), "Invalid ID filter: project_ids"),
            (self.base_query(include=["secrets"]), "Unsupported section"),
            (self.base_query(response_format="markdown"), "non-JSON"),
            (self.base_query(include=["activity"], activity_offset=-1), "nonnegative integer"),
            (self.base_query(include=["activity"], activity_offset=True), "nonnegative integer"),
        ]
        for query, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                A.query_key(query)

    def test_defaults_are_filled_in(self):
        q = A.query_key(self.base_query(include=["activity", "entities", "activity"], user_ids=["b", "a"]))
        self.assertEqual(q["scope"], "project")
        self.assertEqual(q["include"], ["activity", "entities"])
        self.assertEqual(q["activity_offset"], 0)
        self.assertEqual(q["user_ids"], ["a", "b"])
        self.assertEqual(q["response_format"], "json")

    def test_timestamps_need_a_timezone_and_dates_mean_midnight_utc(self):
        with self.assertRaisesRegex(ValueError, "timezone"):
            A.stamp("2026-08-01T00:00:00")
        self.assertEqual(A.boundary("2026-08-01"), datetime(2026, 8, 1, tzinfo=timezone.utc))
        self.assertEqual(A.stamp("2026-08-01T02:00:00+02:00"), datetime(2026, 8, 1, tzinfo=timezone.utc))

    def test_cache_id_needs_an_account(self):
        with self.assertRaisesRegex(ValueError, "namespace"):
            A.cache_id("  ", self.base_query())

    def test_number_accepts_only_finite_numbers(self):
        self.assertEqual(A.number(2.5), 2.5)
        for bad in (None, "1", False, float("-inf")):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                A.number(bad)


class ResponseShapeTests(unittest.TestCase):
    def test_structured_content_wrapper_is_unwrapped(self):
        e = make_envelope()
        e["response"] = {"structuredContent": e["response"]}
        report = A.analyze(A.ingest(e, "a", NOW))
        self.assertEqual((report["total_cu"], report["model_cu"], report["jobs"]), (10, 12, 2))

    def test_text_blocks_without_exactly_one_payload_fail(self):
        raw = make_envelope()["response"]
        for blocks in (
            [{"type": "text", "text": "Routing note"}],
            [{"type": "text", "text": json.dumps(raw)}, {"type": "text", "text": json.dumps(raw)}],
            [{"type": "image", "data": "..."}],
        ):
            e = make_envelope()
            e["response"] = {"content": blocks}
            with self.subTest(blocks=len(blocks)), self.assertRaisesRegex(ValueError, "complete structured"):
                A.ingest(e, "a", NOW)

    def test_non_dict_response_fails(self):
        e = make_envelope()
        e["response"] = ["not", "a", "dict"]
        with self.assertRaisesRegex(ValueError, "Incomplete or failed"):
            A.ingest(e, "a", NOW)

    def test_missing_top_level_section(self):
        e = make_envelope()
        del e["response"]["assetUsages"]
        with self.assertRaisesRegex(ValueError, "Incomplete usage response: assetUsages"):
            A.ingest(e, "a", NOW)

    def test_requested_section_missing(self):
        e = make_envelope()
        del e["response"]["entities"]
        with self.assertRaisesRegex(ValueError, "Requested section missing: entities"):
            A.ingest(e, "a", NOW)

    def test_before_discount_identity_must_add_up(self):
        e = make_envelope()
        e["response"]["consumption"][0]["total"] = 99
        e["response"]["totals"]["totalBeforeDiscountCU"] = 99
        with self.assertRaisesRegex(ValueError, "before-discount identity CU"):
            A.ingest(e, "a", NOW)


class ActivityTests(unittest.TestCase):
    def envelope(self, events, pagination=None, user_ids=None):
        e = make_envelope(user_ids=user_ids)
        e["query"].update(include=["activity", "entities", "modelUsages.daily"])
        e["response"]["activity"] = events
        e["response"]["activityPagination"] = pagination or {"offset": 0, "count": len(events), "nextOffset": None}
        return e

    def test_activity_keeps_only_the_listed_fields(self):
        event = {"time": "2026-08-02T00:00:00Z", "userId": "user_a", "projectId": "p9", "action": "generate", "creativeUnitsCost": 3, "prompt": "omit"}
        s = A.ingest(self.envelope([event]), "a", NOW)
        self.assertEqual(s["response"]["activity"], [{k: v for k, v in event.items() if k != "prompt"}])

    def test_pagination_must_match_the_page(self):
        events = [{"userId": "user_a"}] * 2
        for pagination in ({"offset": 0, "count": 1, "nextOffset": None}, {"offset": 0, "count": 2, "nextOffset": 100}, {"offset": 5, "count": 2, "nextOffset": None}):
            with self.subTest(pagination=pagination), self.assertRaisesRegex(ValueError, "Invalid activity pagination"):
                A.ingest(self.envelope(events, pagination), "a", NOW)

    def test_a_full_page_points_to_the_next_offset(self):
        events = [{"userId": "user_a"}] * 100
        s = A.ingest(self.envelope(events, {"offset": 0, "count": 100, "nextOffset": 100}), "a", NOW)
        self.assertEqual(len(s["response"]["activity"]), 100)

    def test_activity_outside_the_user_filter_fails(self):
        with self.assertRaisesRegex(ValueError, "Activity outside requested users"):
            A.ingest(self.envelope([{"userId": "user_z"}], user_ids=["user_a"]), "a", NOW)


class AnalyzeEdgeTests(unittest.TestCase):
    def test_old_snapshot_versions_are_refused(self):
        s = A.ingest(make_envelope(), "a", NOW)
        s["version"] = 1
        with self.assertRaisesRegex(ValueError, "Unsupported snapshot version"):
            A.analyze(s)

    def test_model_job_counts_must_be_whole_and_nonnegative(self):
        for jobs in (1.5, -1):
            e = make_envelope(daily=False)
            e["response"]["modelUsages"][0]["totalJobs"] = jobs
            with self.subTest(jobs=jobs), self.assertRaisesRegex(ValueError, "Invalid job count"):
                A.ingest(e, "a", NOW)

    def test_missing_model_id(self):
        e = make_envelope(daily=False)
        del e["response"]["modelUsages"][0]["modelId"]
        with self.assertRaisesRegex(ValueError, "Missing or duplicate model ID"):
            A.ingest(e, "a", NOW)

    def test_daily_job_counts_must_be_whole(self):
        e = make_envelope(models=[("model_a", "A", [("2026-08-10T00:00:00Z", 12, 0.5, 0)])])
        e["response"]["modelUsages"][0]["totalJobs"] = 1
        with self.assertRaisesRegex(ValueError, "Invalid daily job count"):
            A.ingest(e, "a", NOW)

    def test_duplicate_consumption_identity(self):
        e = make_envelope(consumption=[("user_a", 6, 1), ("user_a", 4, 1)])
        with self.assertRaisesRegex(ValueError, "Duplicate consumption identity"):
            A.ingest(e, "a", NOW)

    def test_zero_points_outside_the_period_or_summary_are_ignored(self):
        e = make_envelope()
        daily = e["response"]["modelUsages.daily"]
        daily[0]["points"].append({"time": "2026-09-01T00:00:00Z", "cost": 0, "jobs": 0, "apiKeyCost": 0})
        daily.append({"modelId": "model_unlisted", "points": [{"time": "2026-08-05T00:00:00Z", "cost": 0, "jobs": 0, "apiKeyCost": 0}]})
        report = A.analyze(A.ingest(e, "a", NOW))
        self.assertEqual([(d["date"], d["model"]) for d in report["daily"]], [("2026-08-10", "model_a")])

    def test_unknown_identity_type_and_name_fallbacks(self):
        e = make_envelope(consumption=[("user_a", 6, 0), ("user_b", 4, 0)])
        e["response"]["entities"]["users"] = [{"id": "user_a"}]
        report = A.analyze(A.ingest(e, "a", NOW), names=True)
        by_id = {u["id"]: u for u in report["users"]}
        self.assertEqual(by_id["user_a"]["kind"], "Unknown identity type")
        self.assertEqual(by_id["user_b"]["name"], "user_b")

    def test_no_daily_section_adds_a_coverage_note(self):
        report = A.analyze(A.ingest(make_envelope(daily=False), "a", NOW))
        self.assertFalse(report["has_daily"])
        self.assertIn("Time buckets were not included", " ".join(report["notes"]))
        self.assertIn("one usage query per consumption identity", " ".join(report["notes"]))


class UserSnapshotTests(unittest.TestCase):
    def parent(self):
        return make_envelope(consumption=[("user_a", 10, 2)])

    def test_child_without_daily_series_fails_when_the_parent_has_one(self):
        child = make_envelope(user_ids=["user_a"], daily=False)
        with self.assertRaisesRegex(ValueError, "matching daily coverage"):
            A.ingest(self.parent(), "a", NOW, users=[child])

    def test_child_model_missing_from_the_parent_fails(self):
        points = [("2026-08-10T00:00:00Z", 12, 2, 1)]
        child = make_envelope(models=[("model_a", "A", points), ("model_c", "C", [("2026-08-11T00:00:00Z", 0, 0, 0)])], user_ids=["user_a"])
        with self.assertRaisesRegex(ValueError, "User model absent from parent summary"):
            A.ingest(self.parent(), "a", NOW, users=[child])

    def test_child_from_another_account_fails(self):
        child = A.ingest(make_envelope(user_ids=["user_a"]), "other", NOW)
        snapshot = A.ingest(self.parent(), "a", NOW)
        snapshot["user_snapshots"] = [child]
        with self.assertRaisesRegex(ValueError, "scope differs from parent"):
            A.analyze(snapshot)

    def test_child_time_buckets_must_match_the_parent(self):
        parent = make_envelope(models=[("model_a", "A", [("2026-08-10T00:00:00Z", 12, 2, 1)])])
        child = make_envelope(models=[("model_a", "A", [("2026-08-11T00:00:00Z", 12, 2, 1)])], user_ids=["user_a"])
        with self.assertRaisesRegex(ValueError, "user/model time buckets"):
            A.ingest(parent, "a", NOW, users=[child])


class MarkdownAndCsvTests(unittest.TestCase):
    def test_safe_cell_neutralizes_formula_prefixes_only(self):
        for value in ("=1+1", "+1", "-1", "@x", "  =x", "\t=x"):
            self.assertTrue(A.safe_cell(value).startswith("'"), value)
        self.assertEqual(A.safe_cell("Model 1"), "Model 1")
        self.assertEqual(A.safe_cell(-1), -1)

    def test_safe_cell_prefixes_a_leading_tab_or_carriage_return(self):
        for value in ("\tx", "\rx"):
            self.assertTrue(A.safe_cell(value).startswith("'"), repr(value))

    def test_markdown_escapes_table_breakers(self):
        e = make_envelope(models=[("model_a", "A|B\n<b>", [("2026-08-10T00:00:00Z", 12, 2, 1)])])
        text = A.markdown(A.analyze(A.ingest(e, "a", NOW)), "Title | x")
        self.assertIn("# Title \\| x", text)
        self.assertIn("| A\\|B &lt;b&gt; | 12.00 | 2 | 1.00 |", text)


class RenderEdgeTests(unittest.TestCase):
    def test_invalid_ranking_options(self):
        s = A.ingest(make_envelope(), "a", NOW)
        for options in ({"rank_by": "api_cu"}, {"top_models_per_user": 0}):
            with tempfile.TemporaryDirectory() as directory, self.subTest(options=options):
                with self.assertRaisesRegex(ValueError, "Invalid ranking options"):
                    A.render(s, directory, "T", **options)
                self.assertEqual(list(Path(directory).iterdir()), [])

    def test_monthly_csv_sums_daily_points_per_month_and_model(self):
        points = [("2026-07-30T00:00:00Z", 1, 1, 0), ("2026-07-31T00:00:00Z", 2, 1, 1), ("2026-08-02T00:00:00Z", 4, 2, 0)]
        e = make_envelope(models=[("model_a", "A", points)], consumption=[("user_a", 7, 0)], start="2026-07-01", end="2026-08-31")
        with tempfile.TemporaryDirectory() as directory:
            A.render(A.ingest(e, "a", NOW), directory, "T")
            rows = (Path(directory) / "models-monthly.csv").read_text(encoding="utf-8").splitlines()
        self.assertEqual(rows, ["month,model_id,cu,jobs,api_key_cu_subset", "2026-07,model_a,3,2,1", "2026-08,model_a,4,2,0"])

    def test_missing_reportlab_keeps_the_other_exports(self):
        s = A.ingest(make_envelope(), "a", NOW)
        blocked = {"reportlab": None, "reportlab.lib": None, "reportlab.platypus": None}
        with tempfile.TemporaryDirectory() as directory, mock.patch.dict(sys.modules, blocked):
            out = Path(directory)
            (out / "report.pdf").write_text("stale", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "PDF requires reportlab"):
                A.render(s, out, "T", pdf=True)
            self.assertFalse((out / "report.pdf").exists())
            for name in ("report.md", "models.csv", "identities.csv", "dashboard.html"):
                self.assertTrue((out / name).is_file(), name)

    def test_private_write_cleans_up_after_a_failed_replace(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "taken"
            target.mkdir()
            with self.assertRaises(OSError):
                A.private_write(target, "data")
            self.assertEqual([p.name for p in Path(directory).iterdir()], ["taken"])
            A.private_write(Path(directory) / "new" / "file.txt", "data")
            self.assertEqual((Path(directory) / "new" / "file.txt").read_text(encoding="utf-8"), "data")


@unittest.skipUnless(HAS_REPORTLAB, "PDF dependency unavailable")
class PdfEdgeTests(unittest.TestCase):
    def render_pdf(self, envelope, title="Report", **kwargs):
        directory = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, directory, True)
        A.render(A.ingest(envelope, "a", NOW), directory, title, pdf=True, **kwargs)
        return Path(directory) / "report.pdf"

    def test_symbols_are_dropped_with_a_footer_and_long_labels_truncated(self):
        long_name = "Model " + "x" * 80
        e = make_envelope(models=[(long_name.replace(" ", "_"), long_name, [("2026-08-10T00:00:00Z", 12, 2, 1)]), ("model_b", "Rocket \U0001f680", [("2026-08-11T00:00:00Z", 3, 1, 0)])], consumption=[("user_a", 15, 0)])
        text = pdf_streams(self.render_pdf(e))
        self.assertIn(b"Decorative symbols omitted in PDF", text)
        self.assertRegex(text, rb"\(Model x+\.\.\.\) Tj")

    def test_labels_the_font_cannot_draw_are_refused(self):
        e = make_envelope(models=[("model_a", "模型", [("2026-08-10T00:00:00Z", 12, 2, 1)])])
        with self.assertRaisesRegex(ValueError, "PDF font cannot render a label"):
            self.render_pdf(e)

    def test_more_than_six_months_become_a_table(self):
        points = [(f"2026-{m:02d}-15T00:00:00Z", round(1.11 * m, 2), 1, 0) for m in range(1, 8)]
        e = make_envelope(models=[("model_a", "A", points)], consumption=[("user_a", 10, 0)], start="2026-01-01", end="2026-07-31")
        text = pdf_streams(self.render_pdf(e))
        self.assertIn(b"(7.77)", text)
        self.assertIn(b"(2026-07)", text)

    def test_no_daily_series_states_the_trend_is_unavailable(self):
        text = pdf_streams(self.render_pdf(make_envelope(daily=False)))
        self.assertIn(b"daily series was not included", text)


class CliTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.cache = self.dir / "cache"

    def write(self, name, data):
        path = self.dir / name
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def cli(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(sys, "argv", ["analytics.py", *map(str, argv)]), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                code = A.main()
            except SystemExit as stop:
                code = stop.code
        return code, out.getvalue(), err.getvalue()

    def test_ingest_lookup_and_render_round_trip(self):
        now = datetime.now(timezone.utc).isoformat()
        parent = make_envelope(fetched_at=now)
        child = make_envelope(user_ids=["user_a"], fetched_at=now)
        members = {"query": {"team_id": "team_example", "project_id": "project_example"}, "fetched_at": now, "response": {"members": [{"id": "user_a", "email": "a@example.invalid"}]}}
        source = self.write("usage.json", parent)
        code, out, _ = self.cli("ingest", "--input", source, "--account", "acct", "--cache", self.cache, "--users", self.write("users.json", [child]), "--members", self.write("members.json", members))
        self.assertEqual(code, 0)
        cached = Path(out.strip())
        self.assertEqual(cached, (self.cache / (A.cache_id("acct", parent["query"]) + ".json")).resolve())
        snapshot = json.loads(cached.read_text(encoding="utf-8"))
        self.assertEqual(snapshot["identity_labels"], {"user_a": "a@example.invalid"})

        query = self.write("query.json", parent["query"])
        code, out, _ = self.cli("lookup", "--input", query, "--account", "acct", "--cache", self.cache, "--require-users")
        self.assertEqual((code, Path(out.strip())), (0, cached))
        code, out, _ = self.cli("lookup", "--input", query, "--account", "other", "--cache", self.cache)
        self.assertEqual((code, out.strip()), (1, "Cache miss or expired; fetch through MCP."))
        code, out, _ = self.cli("lookup", "--input", query, "--account", "acct", "--cache", self.cache, "--ttl", "0")
        self.assertEqual(code, 1)

        report = self.dir / "report"
        code, out, _ = self.cli("render", "--snapshot", cached, "--out", report, "--names", "--rank-by", "jobs", "--top-models-per-user", "1")
        self.assertEqual((code, Path(out.strip())), (0, report.resolve()))
        ranking = (report / "top-models-per-user.csv").read_text(encoding="utf-8").splitlines()
        self.assertEqual(ranking, ["identity,type,rank,model,cu,jobs", "Person user_a,Human,1,Example A,12,2"])

    def test_errors_exit_2_with_a_message(self):
        bad = make_envelope()
        bad["response"]["totals"]["totalCU"] = 999
        code, out, err = self.cli("ingest", "--input", self.write("bad.json", bad), "--account", "acct", "--cache", self.cache)
        self.assertEqual(code, 2)
        self.assertIn("Analytics error: Metrics do not reconcile: totalCU", err)
        self.assertFalse(self.cache.exists())
        code, _, err = self.cli("render", "--snapshot", self.dir / "missing.json", "--out", self.dir / "r")
        self.assertEqual(code, 2)
        self.assertIn("Analytics error:", err)

    def test_script_entry_point(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "lookup", "--input", str(self.write("q.json", make_envelope()["query"])), "--account", "acct", "--cache", str(self.cache)],
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(result.stdout.strip(), "Cache miss or expired; fetch through MCP.")


if __name__ == "__main__":
    unittest.main()
