import copy
import importlib.util
import json
import os
from html.parser import HTMLParser
import shutil
import subprocess
from pathlib import Path
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("analytics", ROOT / "skills/scenario-admin-analytics/scripts/analytics.py")
A = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(A)
NOW = datetime(2026, 9, 17, 12, tzinfo=timezone.utc)


def envelope():
    q = {"team_id": "team_example", "project_id": "project_example", "scope": "team", "start_date": "2026-08-01T00:00:00Z", "end_date": "2026-08-31T23:59:59.999Z", "include": ["modelUsages.daily", "entities"]}
    models = [{"modelId": "model_a", "modelName": "Example A", "totalCU": 30.5, "totalJobs": 3, "totalApiKeyCU": 4}, {"modelId": "model_b", "modelName": "Example B", "totalCU": 0, "totalJobs": 1, "totalApiKeyCU": 0}]
    return {"query": q, "fetched_at": NOW.isoformat(), "response": {
        "scope": {"mode": "team", "teamId": "team_example", "contextProjectId": "project_example", "projectIds": None, "userIds": None},
        "totals": {"totalCU": 29, "totalDiscountCU": 12, "totalBeforeDiscountCU": 41, "startDate": q["start_date"], "endDate": q["end_date"]},
        "consumption": [{"userId": "user_a", "value": 20, "discount": 2, "total": 22}, {"userId": "user_b", "value": 9, "discount": 10, "total": 19}],
        "modelUsages": models, "assetUsages": [],
        "modelUsages.daily": [{"modelId": m["modelId"], "points": [{"time": "2026-08-31T00:00:00Z", "cost": m["totalCU"], "jobs": m["totalJobs"], "discount": d, "apiKeyCost": m["totalApiKeyCU"], "apiKeyDiscount": 1}]} for m, d in zip(models, [2, 10])],
        "entities": {"users": [{"id": "user_a", "fullName": "Example Person", "isApiKey": False, "email": "private@example.invalid"}, {"id": "user_b", "fullName": "Example Key", "isApiKey": True}]}
    }}


def user_envelopes():
    out = []
    for uid, cu, jobs in [("user_a", 20, 2), ("user_b", 10.5, 1)]:
        e = envelope()
        e["query"]["user_ids"] = [uid]
        r = e["response"]
        r["scope"]["userIds"] = [uid]
        r["consumption"] = [u for u in r["consumption"] if u["userId"] == uid]
        u = r["consumption"][0]
        r["totals"].update(totalCU=u["value"], totalDiscountCU=u["discount"], totalBeforeDiscountCU=u["total"])
        r["modelUsages"][0].update(totalCU=cu, totalJobs=jobs, totalApiKeyCU=4 if uid == "user_a" else 0)
        r["modelUsages.daily"][0]["points"][0].update(cost=cu, jobs=jobs, apiKeyCost=4 if uid == "user_a" else 0)
        if uid == "user_a":
            r["modelUsages"] = r["modelUsages"][:1]
            r["modelUsages.daily"] = r["modelUsages.daily"][:1]
        out.append(e)
    return out


class AnalyticsTests(unittest.TestCase):
    def test_after_discount_metrics_and_zero_cost_jobs(self):
        r = A.analyze(A.ingest(envelope(), "account", NOW))
        self.assertEqual((r["total_cu"], r["model_cu"], r["jobs"]), (29, 30.5, 4))
        self.assertEqual(r["users"][0]["cu"], 20)
        self.assertEqual(r["models"][0]["api_cu"], 4)
        self.assertEqual(r["model_gap"], 1.5)
        self.assertEqual(r["models"][1]["jobs"], 1)
        self.assertNotIn("unverified", " ".join(r["notes"]))

    def test_scope_cache_isolation_and_filter_order(self):
        q = envelope()["query"]
        key = A.cache_id("account", q)
        for changed in [dict(q, scope="project"), dict(q, user_ids=["user_a"]), dict(q, project_id="other"), dict(q, include=[]), dict(q, end_date="2026-08-30T23:59:59.999Z")]:
            self.assertNotEqual(key, A.cache_id("account", changed))
        self.assertNotEqual(key, A.cache_id("other-account", q))
        self.assertEqual(A.cache_id("a", dict(q, user_ids=["b", "a", "b"])), A.cache_id("a", dict(q, user_ids=["a", "b"])))
        with self.assertRaises(ValueError):
            A.query_key(dict(q, project_ids=["other"]))
        with self.assertRaises(ValueError):
            A.query_key(dict(q, activity_offset=1))

    def test_ttl_preserves_source_age_and_invalidates_v1(self):
        e = envelope()
        s = A.ingest(e, "account", NOW + timedelta(days=1), users=user_envelopes())
        self.assertEqual(s["fetched_at"], NOW.isoformat())
        self.assertTrue(A.fresh(s, "account", e["query"], now=NOW, require_users=True))
        self.assertFalse(A.fresh(s, "account", e["query"], now=NOW + timedelta(hours=2)))
        self.assertFalse(A.fresh(s, "account", e["query"], ttl=0, now=NOW))
        self.assertFalse(A.fresh(dict(s, version=1), "account", e["query"], now=NOW))
        s["user_snapshots"][0]["fetched_at"] = (NOW - timedelta(hours=2)).isoformat()
        self.assertFalse(A.fresh(s, "account", e["query"], now=NOW))
        plain = A.ingest(e, "account", NOW)
        self.assertFalse(A.fresh(plain, "account", e["query"], now=NOW, require_users=True))

    def test_scope_dates_and_identity_leaks_fail(self):
        for edit in [lambda r: r["scope"].update(projectIds=["wrong"]), lambda r: r["totals"].update(endDate="2026-09-01T00:00:00Z"), lambda r: r.pop("scope"), lambda r: r["totals"].update(totalCU=41)]:
            e = envelope(); edit(e["response"])
            with self.assertRaises((ValueError, KeyError)):
                A.ingest(e, "account", NOW)
        e = user_envelopes()[0]; e["response"]["consumption"][0]["userId"] = "someone_else"
        with self.assertRaises(ValueError):
            A.ingest(e, "account", NOW)

    def test_time_buckets_same_day_and_inclusive_end(self):
        e = envelope(); points = e["response"]["modelUsages.daily"][0]["points"]
        points[0].update(cost=20, jobs=2, apiKeyCost=4)
        points.append(dict(points[0], time="2026-08-31T23:00:00Z", cost=10.5, jobs=1, apiKeyCost=0))
        r = A.analyze(A.ingest(e, "a", NOW))
        self.assertEqual(len(r["daily"]), 2)
        self.assertEqual(r["daily"][0]["cu"], 30.5)
        points.append(copy.deepcopy(points[0]))
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            A.ingest(e, "a", NOW)

    def test_outside_period_and_missing_daily_rejected(self):
        e = envelope(); e["response"]["modelUsages.daily"][0]["points"][0]["time"] = "2026-09-01T00:00:00Z"
        with self.assertRaises(ValueError):
            A.ingest(e, "a", NOW)
        e = envelope(); e["response"].pop("modelUsages.daily")
        with self.assertRaises(ValueError):
            A.ingest(e, "a", NOW)
        e["query"]["include"].remove("modelUsages.daily")
        self.assertFalse(A.analyze(A.ingest(e, "a", NOW))["has_daily"])

    def test_negative_values_are_preserved(self):
        e = envelope(); r = e["response"]
        r["consumption"][1].update(value=-1, total=9)
        r["totals"].update(totalCU=19, totalBeforeDiscountCU=31)
        r["modelUsages"][0]["totalCU"] = -3
        r["modelUsages.daily"][0]["points"][0]["cost"] = -3
        report = A.analyze(A.ingest(e, "a", NOW))
        self.assertEqual(report["model_cu"], -3)
        self.assertEqual(report["users"][1]["cu"], -1)

    def test_bad_numbers_duplicates_and_daily_mismatch(self):
        for value in [float("nan"), float("inf"), True, "30.5"]:
            e = envelope(); e["response"]["modelUsages"][0]["totalCU"] = value
            with self.assertRaises(ValueError):
                A.ingest(e, "a", NOW)
        e = envelope(); e["response"]["modelUsages"].append(copy.deepcopy(e["response"]["modelUsages"][0]))
        with self.assertRaises(ValueError):
            A.ingest(e, "a", NOW)
        e = envelope(); e["response"]["modelUsages.daily"][0]["points"][0]["cost"] = 32.5
        with self.assertRaisesRegex(ValueError, "reconcile"):
            A.ingest(e, "a", NOW)

    def test_joint_cu_and_jobs_and_identity_types(self):
        r = A.analyze(A.ingest(envelope(), "a", NOW, users=user_envelopes()))
        self.assertTrue(r["joint_available"])
        self.assertEqual(len(r["joint"]), 3)
        self.assertEqual(sum(j["jobs"] for j in r["joint"]), 4)
        self.assertEqual(r["users"][1]["kind"], "API identity")
        for metric in ("cu", "jobs"):
            r.update(rank_by=metric, top_models_per_user=1)
            per_user, per_model = A.joint_rankings(r)
            self.assertEqual(len(per_user), 2)
            self.assertEqual(per_user[0][-2:], [20, 2])
            self.assertEqual(per_model[0][-2:], [20, 2])

    def test_incomplete_duplicate_or_mismatched_user_snapshots_fail(self):
        children = user_envelopes()
        for bad in [children[:1], children + children[:1]]:
            with self.assertRaises(ValueError):
                A.ingest(envelope(), "a", NOW, users=bad)
        children[0]["query"]["project_id"] = "other"
        children[0]["response"]["scope"]["contextProjectId"] = "other"
        with self.assertRaises(ValueError):
            A.ingest(envelope(), "a", NOW, users=children)
        children = user_envelopes()
        children[0]["response"]["modelUsages"][0]["totalCU"] += 1
        children[0]["response"]["modelUsages.daily"][0]["points"][0]["cost"] += 1
        with self.assertRaisesRegex(ValueError, "user/model"):
            A.ingest(envelope(), "a", NOW, users=children)

    def test_activity_offsets_and_scope_checks(self):
        e = envelope(); e["query"].update(scope="project", include=["activity"], activity_offset=100)
        r = e["response"]; r["scope"].update(mode="project", projectIds=["project_example"])
        r["activity"] = [{"projectId": "project_example", "userId": "user_a", "secretPrompt": "omit me"}]
        r["activityPagination"] = {"offset": 100, "count": 1, "nextOffset": None}
        s = A.ingest(e, "a", NOW)
        self.assertNotIn("secretPrompt", json.dumps(s))
        r["activity"][0]["projectId"] = "wrong"
        with self.assertRaises(ValueError):
            A.ingest(e, "a", NOW)

    def test_wrappers_privacy_and_failed_responses(self):
        e = envelope(); raw = e["response"]
        e["response"] = {"content": [{"type": "text", "text": json.dumps(raw)}, {"type": "text", "text": "Routing note"}]}
        s = A.ingest(e, "a", NOW)
        self.assertNotIn("private@example.invalid", json.dumps(s))
        for failed in [{"isError": True, "structuredContent": raw}, {"truncated": True, **raw}]:
            e["response"] = failed
            with self.assertRaises(ValueError):
                A.ingest(e, "a", NOW)

    def test_optional_member_labels_require_scope_and_keep_source_time(self):
        e = envelope(); e["response"]["entities"]["users"][0].pop("fullName")
        members = {"query": {"team_id": "team_example", "project_id": "project_example"}, "fetched_at": NOW.isoformat(), "response": {"members": [{"id": "user_a", "email": "person@example.invalid"}, {"id": "unrelated", "email": "omit@example.invalid"}]}}
        members["response"] = {"content": [{"type": "text", "text": json.dumps(members["response"])}, {"type": "text", "text": "Routing note"}]}
        s = A.ingest(e, "a", NOW, members=members)
        self.assertEqual(A.analyze(s, names=True)["users"][0]["name"], "person@example.invalid")
        self.assertEqual(A.analyze(s)["users"][0]["name"], "Identity 01")
        self.assertNotIn("omit@example.invalid", json.dumps(s))
        s["labels_fetched_at"] = (NOW - timedelta(hours=2)).isoformat()
        self.assertFalse(A.fresh(s, "a", e["query"], now=NOW))
        members["query"]["team_id"] = "other"
        with self.assertRaises(ValueError):
            A.ingest(e, "a", NOW, members=members)

    def test_exports_escaping_and_stale_file_removal(self):
        e = envelope(); e["response"]["modelUsages"][0]["modelName"] = '=SUM(1,2)</script><script>alert(1)</script>'
        s = A.ingest(e, "a", NOW, users=user_envelopes())
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            A.render(s, out, "Example report")
            data = (out / "dashboard.html").read_text()
            self.assertNotIn("user_a", data)
            self.assertNotIn("team_example", data)
            self.assertNotIn("</script><script>alert", data)
            self.assertIn("'=SUM", (out / "models.csv").read_text())
            self.assertTrue((out / "user-models.csv").exists())
            self.assertIn("end_inclusive", (out / "models.csv").read_text())
            if os.name == "posix":
                self.assertEqual((out / "models.csv").stat().st_mode & 0o777, 0o600)
            A.render(A.ingest(envelope(), "a", NOW), out, "Summary")
            self.assertFalse((out / "top-models-per-user.csv").exists())
            self.assertFalse((out / "user-models.csv").exists())

    @unittest.skipUnless(importlib.util.find_spec("reportlab"), "PDF dependency unavailable")
    def test_pdf_and_empty_report(self):
        with tempfile.TemporaryDirectory() as directory:
            A.render(A.ingest(envelope(), "a", NOW, users=user_envelopes()), directory, "Example report", pdf=True)
            self.assertTrue((Path(directory) / "report.pdf").read_bytes().startswith(b"%PDF"))
            e = envelope(); r = e["response"]
            r["totals"].update(totalCU=0, totalDiscountCU=0, totalBeforeDiscountCU=0)
            for k in ("consumption", "modelUsages", "modelUsages.daily"):
                r[k] = []
            A.render(A.ingest(e, "a", NOW, users=[]), directory, "Empty report", pdf=True)

    @unittest.skipUnless(shutil.which("node"), "Node unavailable")
    def test_dashboard_filters_change_generation_not_overall_consumption(self):
        with tempfile.TemporaryDirectory() as directory:
            A.render(A.ingest(envelope(), "a", NOW, users=user_envelopes()), directory, "Example report")
            page = (Path(directory) / "dashboard.html").read_text()
            class Scripts(HTMLParser):
                def __init__(self):
                    super().__init__()
                    self.blocks = []
                    self.current = None
                def handle_starttag(self, tag, attrs):
                    if tag == "script":
                        self.current = {"attrs": dict(attrs), "text": ""}
                def handle_data(self, data):
                    if self.current is not None:
                        self.current["text"] += data
                def handle_endtag(self, tag):
                    if tag == "script" and self.current is not None:
                        self.blocks.append(self.current)
                        self.current = None
            parsed = Scripts()
            parsed.feed(page)
            data = next(b["text"] for b in parsed.blocks if b["attrs"].get("id") == "report-data")
            script = next(b["text"] for b in parsed.blocks if not b["attrs"])
            harness = r'''
const vm = require("node:vm"), assert = require("node:assert/strict");
function element() { return {textContent:"",value:"",style:{},children:[],handlers:{},append(...x){this.children.push(...x)},replaceChildren(){this.children=[];this.textContent=""},addEventListener(n,f){this.handlers[n]=f}}; }
const elements = new Map(), get = (id) => {if(!elements.has(id)) elements.set(id,element()); return elements.get(id)};
get("report-data").textContent = DATA;
const context = {document:{getElementById:get,createElement:element}, window:{print(){}}, console};
vm.runInNewContext(SCRIPT,context);
assert.equal(get("jobs").textContent,"4"); assert.equal(get("cu").textContent,"30.5");
get("identity").value="identity-0";get("identity").handlers.change();
assert.equal(get("jobs").textContent,"2"); assert.equal(get("cu").textContent,"20");
assert.equal(get("total").textContent,"29");
get("end").value="2026-08-30";get("end").handlers.change();
assert.equal(get("jobs").textContent,"0");
get("reset").handlers.click();assert.equal(get("jobs").textContent,"4");
get("model").value="model_b";get("model").handlers.change();
assert.equal(get("jobs").textContent,"1"); assert.equal(get("cu").textContent,"0");
get("start").value="2026-09-01";get("start").handlers.change();
assert.equal(get("download").disabled,true); assert.equal(get("jobs").textContent,"Unavailable");
'''.replace("DATA", json.dumps(data)).replace("SCRIPT", json.dumps(script))
            result = subprocess.run(["node", "-e", harness], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
