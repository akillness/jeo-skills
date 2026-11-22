#!/usr/bin/env python3
"""Offline reports from Scenario MCP snapshots. No network or credentials."""

import argparse
import csv
import hashlib
import html
import io
import json
import math
import os
from pathlib import Path
import tempfile
import unicodedata
from datetime import datetime, timezone
from collections import defaultdict

VERSION = 2
INCLUDES = {"usages", "usages.daily", "modelUsages.daily", "nsfwUsages", "activity", "entities"}
METRICS = ("cu", "jobs", "api_cu")


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("Expected a finite numeric metric")
    return value


def stamp(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Timestamp must carry a timezone")
    return result.astimezone(timezone.utc)


def boundary(value):
    return stamp(value + "T00:00:00Z" if len(value) == 10 else value)


def same(a, b, label):
    if not math.isclose(number(a), number(b), abs_tol=0.000001, rel_tol=1e-9):
        raise ValueError("Metrics do not reconcile: " + label)


def query_key(query):
    allowed = {"team_id", "project_id", "scope", "project_ids", "user_ids", "start_date", "end_date", "include", "activity_offset", "response_format"}
    if set(query) - allowed:
        raise ValueError("Unsupported usage query fields")
    q = dict(query)
    for field in ("team_id", "project_id", "start_date", "end_date"):
        if not isinstance(q.get(field), str) or not q[field]:
            raise ValueError("Explicit scope and dates required: " + field)
    if boundary(q["start_date"]) > boundary(q["end_date"]):
        raise ValueError("Inclusive end precedes start")
    q["scope"] = q.get("scope", "project")
    if q["scope"] not in ("project", "team") or (q["scope"] == "team" and "project_ids" in q):
        raise ValueError("Invalid project/team filter combination")
    for key in ("project_ids", "user_ids"):
        if key in q:
            values = q[key]
            if not isinstance(values, list) or not values or any(not isinstance(v, str) or not v or "," in v for v in values):
                raise ValueError("Invalid ID filter: " + key)
            q[key] = sorted(set(values))
    q["include"] = sorted(set(q.get("include", [])))
    if set(q["include"]) - INCLUDES or q.get("response_format", "json") != "json":
        raise ValueError("Unsupported section or non-JSON response")
    if "activity_offset" in q:
        offset = q["activity_offset"]
        if isinstance(offset, bool) or not isinstance(offset, int) or offset < 0 or "activity" not in q["include"]:
            raise ValueError("Activity offset requires activity and a nonnegative integer")
    if "activity" in q["include"]:
        q.setdefault("activity_offset", 0)
    q["response_format"] = "json"
    return q


def unwrap(data):
    if not isinstance(data, dict) or data.get("isError") or data.get("truncated"):
        raise ValueError("Incomplete or failed MCP response")
    if "structuredContent" in data:
        return unwrap(data["structuredContent"])
    if "content" in data:
        candidates = []
        for block in data["content"]:
            if block.get("type") == "text":
                try:
                    candidate = json.loads(block["text"])
                    if isinstance(candidate, dict) and ("totals" in candidate or "members" in candidate):
                        candidates.append(candidate)
                except json.JSONDecodeError:
                    # MCP executors can append plain-text routing notes after the JSON payload.
                    pass
        if len(candidates) != 1:
            raise ValueError("Save the complete structured MCP result")
        return unwrap(candidates[0])
    return data


def cache_id(account, query):
    if not account.strip():
        raise ValueError("A local account/connection namespace is required")
    raw = json.dumps([VERSION, account, query_key(query)], sort_keys=True).encode()
    return hashlib.sha256(raw).hexdigest()


def private_write(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temp = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as stream:
            stream.write(content)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def validate_response(q, response):
    r = unwrap(response)
    for key in ("scope", "totals", "consumption", "modelUsages", "assetUsages"):
        if key not in r:
            raise ValueError("Incomplete usage response: " + key)
    expected = {"mode": q["scope"], "teamId": q["team_id"], "contextProjectId": q["project_id"],
                "projectIds": None if q["scope"] == "team" else q.get("project_ids", [q["project_id"]]), "userIds": q.get("user_ids")}
    actual = dict(r["scope"])
    for field in ("projectIds", "userIds"):
        if isinstance(actual.get(field), list):
            actual[field] = sorted(set(actual[field]))
    if any(actual.get(k) != v for k, v in expected.items()):
        raise ValueError("Returned scope differs from requested filters")
    t = {k: r["totals"][k] for k in ("totalCU", "totalDiscountCU", "totalBeforeDiscountCU", "startDate", "endDate")}
    if boundary(t["startDate"]) != boundary(q["start_date"]) or boundary(t["endDate"]) != boundary(q["end_date"]):
        raise ValueError("Returned dates differ from the request")
    for section in q["include"]:
        if section not in r:
            raise ValueError("Requested section missing: " + section)
    out = {"scope": expected, "totals": t, "modelUsages": [], "consumption": [], "assetUsages": r["assetUsages"]}
    for row in r["modelUsages"]:
        out["modelUsages"].append({k: row[k] for k in ("modelId", "modelName", "totalCU", "totalJobs", "totalApiKeyCU", "totalDiscountCU", "totalApiKeyDiscountCU") if k in row})
    for row in r["consumption"]:
        uid = row["userId"]
        if q.get("user_ids") and uid not in q["user_ids"]:
            raise ValueError("Consumption identity outside requested user filter")
        out["consumption"].append({"userId": uid, **{k: number(row[k]) for k in ("value", "discount", "total")}})
        same(row["total"], row["value"] + row["discount"], "before-discount identity CU")
    for field, key in (("totalCU", "value"), ("totalDiscountCU", "discount"), ("totalBeforeDiscountCU", "total")):
        same(t[field], sum(u[key] for u in out["consumption"]), field)
    for key in ("modelUsages.daily", "usages.daily", "usages", "nsfwUsages"):
        if key in r:
            out[key] = r[key]
    if "activity" in r:
        pagination = r["activityPagination"]
        offset = q.get("activity_offset", 0)
        count = len(r["activity"])
        if count > 100 or pagination != {"offset": offset, "count": count, "nextOffset": offset + 100 if count == 100 else None}:
            raise ValueError("Invalid activity pagination")
        out["activityPagination"] = pagination
        out["activity"] = []
        for event in r["activity"]:
            if expected["projectIds"] and event.get("projectId") and event["projectId"] not in expected["projectIds"]:
                raise ValueError("Activity outside requested projects")
            if expected["userIds"] and event.get("userId") and event["userId"] not in expected["userIds"]:
                raise ValueError("Activity outside requested users")
            out["activity"].append({k: event[k] for k in ("time", "userId", "projectId", "action", "creativeUnitsCost") if k in event})
    if "entities" in r:
        out["entities"] = {"users": [{k: u[k] for k in ("id", "fullName", "isApiKey") if k in u} for u in r["entities"].get("users", []) if u.get("id") in {x["userId"] for x in out["consumption"]}]}
    return out


def ingest(envelope, account, now=None, users=None, members=None):
    q = query_key(envelope["query"])
    timestamp = envelope.get("fetched_at") or (now or datetime.now(timezone.utc)).isoformat()
    stamp(timestamp)
    snapshot = {"version": VERSION, "account": account, "query": q, "fetched_at": timestamp,
                "response": validate_response(q, envelope["response"])}
    if members is not None:
        if any(members["query"].get(k) != q[k] for k in ("team_id", "project_id")):
            raise ValueError("Member lookup scope differs from usage")
        ids = {u["userId"] for u in snapshot["response"]["consumption"]}
        snapshot["identity_labels"] = {u["id"]: u["email"] for u in unwrap(members["response"])["members"] if u.get("id") in ids and u.get("email")}
        snapshot["labels_fetched_at"] = members["fetched_at"]
        stamp(snapshot["labels_fetched_at"])
    if users is not None:
        snapshot["user_snapshots"] = [ingest(e, account, now) for e in users]
    analyze(snapshot)
    cache_id(account, q)
    return snapshot


def fresh(snapshot, account, query, ttl=3600, now=None, require_users=False):
    if snapshot.get("version") != VERSION or snapshot.get("account") != account:
        return False
    if query_key(snapshot["query"]) != query_key(query) or ttl <= 0:
        return False
    if require_users and "user_snapshots" not in snapshot:
        return False
    current = now or datetime.now(timezone.utc)
    if "labels_fetched_at" in snapshot and not 0 <= (current - stamp(snapshot["labels_fetched_at"])).total_seconds() <= ttl:
        return False
    age = (current - stamp(snapshot["fetched_at"])).total_seconds()
    return 0 <= age <= ttl and all(fresh(s, account, s["query"], ttl, current) for s in snapshot.get("user_snapshots", []))


def analyze(snapshot, names=False):
    if snapshot.get("version") != VERSION:
        raise ValueError("Unsupported snapshot version; refresh through MCP")
    q = query_key(snapshot["query"])
    r = validate_response(q, snapshot["response"])
    models = []
    ids = set()
    for m in r["modelUsages"]:
        mid = m.get("modelId")
        if not mid or mid in ids:
            raise ValueError("Missing or duplicate model ID")
        ids.add(mid)
        jobs = number(m["totalJobs"])
        if jobs < 0 or jobs != int(jobs):
            raise ValueError("Invalid job count")
        models.append({"id": mid, "name": m.get("modelName") or mid, "cu": number(m["totalCU"]), "jobs": int(jobs), "api_cu": number(m["totalApiKeyCU"])})
    lookup = {x["id"]: x for x in r.get("entities", {}).get("users", [])}
    users = []
    for index, u in enumerate(sorted(r["consumption"], key=lambda u: u["userId"]), 1):
        entity = lookup.get(u["userId"], {})
        kind = "API identity" if entity.get("isApiKey") is True else "Human" if entity.get("isApiKey") is False else "Unknown identity type"
        users.append({"id": u["userId"], "name": (entity.get("fullName") or snapshot.get("identity_labels", {}).get(u["userId"]) or u["userId"]) if names else f"Identity {index:02d}", "kind": kind, "cu": u["value"]})
    if len({u["id"] for u in users}) != len(users):
        raise ValueError("Duplicate consumption identity")
    daily_sums = defaultdict(lambda: dict.fromkeys(METRICS, 0))
    points_seen = set()
    has_daily = "modelUsages.daily" in r
    for series in r.get("modelUsages.daily", []):
        mid = series["modelId"]
        for point in series["points"]:
            timestamp = stamp(point["time"])
            day = timestamp.date().isoformat()
            key = (mid, timestamp)
            if key in points_seen:
                raise ValueError("Duplicate model/time point")
            points_seen.add(key)
            values = {"cu": number(point["cost"]), "jobs": number(point["jobs"]), "api_cu": number(point["apiKeyCost"])}
            if values["jobs"] < 0 or values["jobs"] != int(values["jobs"]):
                raise ValueError("Invalid daily job count")
            if not (boundary(q["start_date"]).date() <= timestamp.date() <= boundary(q["end_date"]).date()) or mid not in ids:
                if any(values.values()):
                    raise ValueError("Nonzero time bucket outside period or model summary")
                continue
            for metric in METRICS:
                daily_sums[(day, mid)][metric] += values[metric]
    daily = [{"date": day, "model": mid, **values} for (day, mid), values in sorted(daily_sums.items())]
    if has_daily:
        for m in models:
            for k in METRICS:
                same(sum(p[k] for p in daily if p["model"] == m["id"]), m[k], "model daily " + k)
    total = r["totals"]["totalCU"]
    model_cu = sum(m["cu"] for m in models)
    notes = ["Scope and dates match the MCP request; access is limited to the connected credential.",
             "Consumed CU is after discounts. Model CU measures generation activity; the difference from overall consumption is not allocated to models.",
             "CU and job counts measure usage, not productivity, ROI, seat activation, or time saved.",
             "Overall and identity consumption cover the original full period. Model filters apply to generation activity only."]
    joint, joint_daily = [], []
    joint_ok = "user_snapshots" in snapshot
    if joint_ok:
        seen = set()
        parent_users = {u["id"]: u for u in users}
        for child in snapshot["user_snapshots"]:
            cq = query_key(child["query"])
            keys = ("team_id", "project_id", "scope", "project_ids", "start_date", "end_date")
            if child["account"] != snapshot["account"] or any(cq.get(k) != q.get(k) for k in keys):
                raise ValueError("User snapshot scope differs from parent")
            selected = cq.get("user_ids", [])
            if len(selected) != 1 or selected[0] in seen or selected[0] not in parent_users:
                raise ValueError("User snapshots require unique single-identity filters from consumption")
            uid = selected[0]
            seen.add(uid)
            child_report = analyze(child, names)
            same(child_report["total_cu"], parent_users[uid]["cu"], "identity consumption")
            user = parent_users[uid]
            for m in child_report["models"]:
                joint.append({"user_id": uid, "user": user["name"], "kind": user["kind"], "model_id": m["id"], **{k: m[k] for k in METRICS}})
            for d in child_report["daily"]:
                joint_daily.append({"user_id": uid, **d})
            if has_daily and not child_report["has_daily"]:
                raise ValueError("User snapshots need matching daily coverage")
        if seen != set(parent_users):
            raise ValueError("Incomplete user snapshot coverage")
        if {j["model_id"] for j in joint} - ids:
            raise ValueError("User model absent from parent summary")
        for m in models:
            for k in METRICS:
                same(sum(j[k] for j in joint if j["model_id"] == m["id"]), m[k], "user/model " + k)
        if has_daily:
            joint_points = defaultdict(lambda: dict.fromkeys(METRICS, 0))
            for d in joint_daily:
                for k in METRICS:
                    joint_points[(d["date"], d["model"])][k] += d[k]
            for d in daily:
                for k in METRICS:
                    same(joint_points[(d["date"], d["model"])][k], d[k], "user/model time buckets " + k)
        notes.append("Per-user usage queries reconcile to every model's CU, API-key CU and job count.")
    else:
        notes.append("User/model rankings need one usage query per consumption identity with user_ids=[ID].")
    if not has_daily:
        notes.append("Time buckets were not included; date filtering and trend charts are unavailable.")
    return {"query": q, "date_start": boundary(q["start_date"]).date().isoformat(), "date_end": boundary(q["end_date"]).date().isoformat(), "fetched_at": snapshot["fetched_at"], "models": sorted(models, key=lambda m: (-m["cu"], m["id"])), "users": sorted(users, key=lambda u: (-u["cu"], u["id"])), "daily": daily, "has_daily": has_daily, "total_cu": total, "model_cu": model_cu, "model_gap": model_cu - total, "jobs": sum(m["jobs"] for m in models), "notes": notes, "joint": joint, "joint_daily": joint_daily, "joint_available": joint_ok}


FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value):
    # The raw check catches a leading tab or CR, which lstrip() would remove.
    if isinstance(value, str) and (value.startswith(FORMULA_PREFIXES) or value.lstrip().startswith(FORMULA_PREFIXES)):
        return "'" + value
    return value


def csv_text(headers, rows):
    out = io.StringIO(newline="")
    writer = csv.writer(out)
    writer.writerow(headers)
    writer.writerows([[safe_cell(x) for x in row] for row in rows])
    return out.getvalue()


def joint_rankings(report):
    metric = report.get("rank_by", "cu")
    limit = report.get("top_models_per_user", 5)
    models = {m["id"]: m["name"] for m in report["models"]}
    by_user = defaultdict(list)
    by_model = defaultdict(list)
    for row in report["joint"]:
        by_user[row["user_id"]].append(row)
        by_model[row["model_id"]].append(row)
    top_user = []
    for uid in sorted(by_user):
        for rank, row in enumerate(sorted(by_user[uid], key=lambda r: (-r[metric], r["model_id"]))[:limit], 1):
            top_user.append([row["user"], row["kind"], rank, models[row["model_id"]], row["cu"], row["jobs"]])
    top_model = []
    top10 = sorted(report["models"], key=lambda m: (-m[metric], m["id"]))[:10]
    for m in top10:
        for rank, row in enumerate(sorted(by_model[m["id"]], key=lambda r: (-r[metric], r["user_id"]))[:5], 1):
            top_model.append([m["name"], rank, row["user"], row["kind"], row["cu"], row["jobs"]])
    return top_user, top_model


def markdown(report, title):
    def clean(v):
        return str(v).replace("|", "\\|").replace("\n", " ").replace("<", "&lt;").replace(">", "&gt;")
    def table(headers, rows):
        return "\n".join(["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"] + ["| " + " | ".join(clean(x) for x in row) + " |" for row in rows])
    q = report["query"]
    text = f"# {clean(title)}\n\n{q['start_date']} inclusive to {q['end_date']} inclusive, UTC.\n\nRetrieved {report['fetched_at']}. Source: Scenario MCP usage.\n\nConsumed CU: **{report['total_cu']:,.2f} CU**. Model activity: **{report['jobs']:,} jobs**, **{len(report['models'])} models**.\n\nModel CU: {report['model_cu']:,.2f}. Model minus overall CU: {report['model_gap']:+,.2f} (separate measures).\n\n## Models\n\n"
    text += table(["Model", "CU", "Jobs", "API-key CU (subset)"], [[m["name"], f"{m['cu']:,.2f}", m["jobs"], f"{m['api_cu']:,.2f}"] for m in report["models"]])
    text += "\n\n## Identities, full period\n\n" + table(["Identity", "Type", "CU"], [[u["name"], u["kind"], f"{u['cu']:,.2f}"] for u in report["users"]])
    if report["joint_available"]:
        users, models = joint_rankings(report)
        text += f"\n\n## Top {report.get('top_models_per_user', 5)} models per identity, by {report.get('rank_by', 'cu').upper()}\n\n" + table(["Identity", "Type", "Rank", "Model", "CU", "Jobs"], users)
        text += f"\n\n## Top 5 identities for the top 10 models, by {report.get('rank_by', 'cu').upper()}\n\n" + table(["Model", "Rank", "Identity", "Type", "CU", "Jobs"], models)
    return text + "\n\n## Coverage and interpretation\n\n" + "\n".join("- " + clean(n) for n in report["notes"]) + "\n"


def render_pdf(report, target, title):
    try:
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable
    except ImportError as error:
        raise RuntimeError("PDF requires reportlab. Markdown, CSV and HTML are already saved; use browser Print / Save as PDF.") from error
    ink, accent, paper = (colors.HexColor(x) for x in ("#0a0b0d", "#c65b4c", "#f9f7f4"))
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="ReportTitle", fontName="Times-Roman", fontSize=36, leading=39, textColor=ink, spaceAfter=16))
    styles.add(ParagraphStyle(name="Deck", fontSize=11, leading=16, textColor=colors.HexColor("#58616c"), spaceAfter=10))
    styles["Heading2"].textColor = ink
    styles["BodyText"].leading = 13
    styles.add(ParagraphStyle(name="Cell", fontSize=9, leading=11, textColor=ink))
    def pdf_text(text):
        result = []
        for char in unicodedata.normalize("NFC", str(text)):
            try:
                char.encode("cp1252")
                result.append(char)
            except UnicodeEncodeError:
                if not (unicodedata.category(char).startswith(("S", "C")) or char in "\ufe0e\ufe0f"):
                    raise ValueError("PDF font cannot render a label; use pseudonyms or a Unicode-capable renderer")
        return "".join(result).strip()
    def p(text, style="BodyText"):
        return Paragraph(html.escape(pdf_text(text)), styles[style])
    class Bars(Flowable):
        def __init__(self, pairs, width=483, height=190):
            Flowable.__init__(self)
            self.pairs, self.width, self.height = pairs, width, height
        def draw(self):
            c = self.canv
            maximum = max((abs(v) for _, v in self.pairs), default=1) or 1
            for i, (label, value) in enumerate(self.pairs):
                y = self.height - 24 - i * 29
                c.setFillColor(ink)
                c.setFont("Helvetica", 9)
                label = pdf_text(label)
                while c.stringWidth(label, "Helvetica", 9) > 173:
                    label = label[:-4] + "..."
                c.drawString(0, y + 5, label)
                c.setFillColor(accent)
                bar_width = abs(value) / maximum * 228
                if bar_width:
                    c.roundRect(181, y, max(0.5, bar_width), 16, min(3, bar_width / 2), fill=1, stroke=0)
                c.setFillColor(ink)
                c.drawRightString(self.width, y + 5, f"{value:,.1f}")
    def table(headers, rows, widths):
        cells = [[p(h, "Cell") for h in headers]] + [[p(v, "Cell") for v in row] for row in rows]
        result = Table(cells, colWidths=widths, repeatRows=1, hAlign="LEFT")
        result.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), paper), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, 0), .6, accent), ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 4)]))
        return result
    def page(canvas, doc):
        canvas.setFillColor(ink)
        canvas.setFont("Helvetica-Bold", 15)
        canvas.drawString(56, 800, "Scenario")
        canvas.setFont("Helvetica", 9)
        canvas.drawRightString(539, 802, "AI ADOPTION / OBSERVABILITY")
        canvas.setStrokeColor(accent)
        canvas.line(56, 786, 539, 786)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(56, 32, "Source: Scenario MCP | Retrieved " + report["fetched_at"][:19] + " UTC")
        canvas.drawRightString(539, 32, str(doc.page))
        if symbols_omitted:
            canvas.drawString(56, 21, "Decorative symbols omitted in PDF; CSV retains original labels.")
    labels = [title] + [m["name"] for m in report["models"]] + [u["name"] for u in report["users"]]
    symbols_omitted = any(pdf_text(label) != label.strip() for label in labels)
    q = report["query"]
    story = [p(title, "ReportTitle"), p(f"{boundary(q['start_date']).strftime('%d %b %Y')} to {boundary(q['end_date']).strftime('%d %b %Y')}, inclusive / UTC", "Deck")]
    story += [p("All accessible projects" if q["scope"] == "team" else "Selected project scope", "Deck")]
    story += [table(["Consumed CU", "Model jobs", "Models used"], [[f"{report['total_cu']:,.2f} CU", f"{report['jobs']:,}", str(len(report['models']))]], [190, 180, 113]), Spacer(1, 15)]
    story += [p("Where consumption is concentrated", "Heading2"), p("Top six models by generation CU. Full model details are in the accompanying CSV.", "Deck"), Bars([(m["name"], m["cu"]) for m in report["models"][:6]])]
    monthly = defaultdict(float)
    for row in report["daily"]:
        monthly[row["date"][:7]] += row["cu"]
    if monthly:
        story += [p("Model consumption by month", "Heading2")]
        if len(monthly) <= 6:
            story += [Bars(sorted(monthly.items()), height=30 * len(monthly) + 15)]
        else:
            story += [table(["Month", "Model CU"], [[month, f"{cu:,.2f}"] for month, cu in sorted(monthly.items())], [280, 203])]
    else:
        story += [p("Model trend unavailable: daily series was not included.", "Deck")]
    story += [PageBreak(), p("People & interpretation", "ReportTitle"), p("Identity consumption for the original full period. API identities and unknown types are labeled separately.", "Deck")]
    if report["users"]:
        story += [table(["Identity", "Type", "CU"], [[u["name"], u["kind"], f"{u['cu']:,.2f}"] for u in report["users"]], [220, 150, 113])]
    else:
        story += [p("No consumption identities returned.")]
    story += [Spacer(1, 15), p("Reconciliation", "Heading2"), p(f"Reported model CU: {report['model_cu']:,.2f}. Model minus overall CU: {report['model_gap']:+,.2f}. This difference is not allocated to models."), p("Coverage and next questions", "Heading2")]
    story += [p(n, "Deck") for n in report["notes"]]
    story += [p("Discuss which repeated workflows should expand, whether concentrated usage reflects specialist work, and what delivered-output evidence would establish productive adoption.", "Deck")]
    if report["joint_available"]:
        users, models = joint_rankings(report)
        story += [PageBreak(), p("Models by identity", "ReportTitle"), p(f"Top {report.get('top_models_per_user', 5)} per identity, ranked by {report.get('rank_by', 'cu').upper()}. Both generation CU and job counts come from user-filtered MCP usage.", "Deck"), table(["Identity", "Model", "CU", "Jobs"], [[r[0], r[3], f"{r[4]:,.2f}", r[5]] for r in users], [120, 233, 80, 50])]
        story += [PageBreak(), p("Who uses each model", "ReportTitle"), p(f"Top five identities for the top ten models, ranked by {report.get('rank_by', 'cu').upper()}.", "Deck"), table(["Model", "Identity", "CU", "Jobs"], [[r[0], r[2], f"{r[4]:,.2f}", r[5]] for r in models], [233, 120, 80, 50])]

    SimpleDocTemplate(str(target), pagesize=A4, rightMargin=56, leftMargin=56, topMargin=78, bottomMargin=55, title=title, author="Scenario analytics").build(story, onFirstPage=page, onLaterPages=page)
    os.chmod(target, 0o600)


def render(snapshot, output, title, pdf=False, names=False, rank_by="cu", top_models_per_user=5):
    if rank_by not in ("cu", "jobs") or top_models_per_user < 1:
        raise ValueError("Invalid ranking options")
    report = analyze(snapshot, names)
    report.update(rank_by=rank_by, top_models_per_user=top_models_per_user)
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    for filename in ("models-monthly.csv", "top-models-per-user.csv", "top-users-per-model.csv", "report.pdf", "user-models.csv", "job-reconciliation.csv"):
        (output / filename).unlink(missing_ok=True)
    private_write(output / "report.md", markdown(report, title))
    q = report["query"]
    private_write(output / "models.csv", csv_text(["start_inclusive", "end_inclusive", "model_id", "model", "cu", "jobs", "api_key_cu_subset"], [[q["start_date"], q["end_date"], m["id"], m["name"], m["cu"], m["jobs"], m["api_cu"]] for m in report["models"]]))
    monthly = defaultdict(lambda: [0, 0, 0])
    for row in report["daily"]:
        key = (row["date"][:7], row["model"])
        for i, metric in enumerate(("cu", "jobs", "api_cu")):
            monthly[key][i] += row[metric]
    if report["has_daily"]:
        private_write(output / "models-monthly.csv", csv_text(["month", "model_id", "cu", "jobs", "api_key_cu_subset"], [[*key, *value] for key, value in sorted(monthly.items())]))
    private_write(output / "identities.csv", csv_text(["identity", "type", "cu", "start_inclusive", "end_inclusive"], [[u["name"], u["kind"], u["cu"], q["start_date"], q["end_date"]] for u in report["users"]]))
    if report["joint_available"]:
        users, models = joint_rankings(report)
        private_write(output / "top-models-per-user.csv", csv_text(["identity", "type", "rank", "model", "cu", "jobs"], users))
        private_write(output / "top-users-per-model.csv", csv_text(["model", "rank", "identity", "type", "cu", "jobs"], models))
        private_write(output / "user-models.csv", csv_text(["identity", "type", "model_id", "cu", "jobs", "api_key_cu_subset"], [[r["user"], r["kind"], r["model_id"], r["cu"], r["jobs"], r["api_cu"]] for r in report["joint"]]))
    # Export stable pseudonymous keys so filters never depend on display names.
    user_keys = {u["id"]: f"identity-{i}" for i, u in enumerate(report["users"])}
    report["query"] = {k: v for k, v in q.items() if k not in ("team_id", "project_id", "project_ids", "user_ids")}
    for u in report["users"]:
        u["key"] = user_keys[u.pop("id")]
    for row in report["joint"] + report["joint_daily"]:
        row["user_key"] = user_keys[row.pop("user_id")]
    report["title"] = title
    data = json.dumps(report, ensure_ascii=True).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    template = (Path(__file__).resolve().parent.parent / "assets/dashboard.html").read_text()
    private_write(output / "dashboard.html", template.replace("__REPORT_DATA__", data).replace("__REPORT_TITLE__", html.escape(title)))
    if pdf:
        pdf_report = analyze(snapshot, names)
        pdf_report.update(rank_by=rank_by, top_models_per_user=top_models_per_user)
        render_pdf(pdf_report, output / "report.pdf", title)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="command", required=True)
    for cmd in ("ingest", "lookup"):
        p = subs.add_parser(cmd)
        p.add_argument("--input", required=True, help="Envelope JSON for ingest; exact usage arguments JSON for lookup")
        p.add_argument("--account", required=True, help="Local non-secret connection namespace")
        p.add_argument("--cache", required=True)
        if cmd == "ingest":
            p.add_argument("--users", help="JSON list of per-user usage envelopes, one per consumption identity")
            p.add_argument("--members", help="Optional MCP team_members_list envelope for missing identity labels")
        else:
            p.add_argument("--ttl", type=int, default=3600)
            p.add_argument("--require-users", action="store_true")
    p = subs.add_parser("render")
    p.add_argument("--snapshot", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--title", default="AI adoption observability")
    p.add_argument("--pdf", action="store_true")
    p.add_argument("--names", action="store_true", help="Show returned names instead of pseudonyms")
    p.add_argument("--rank-by", choices=("cu", "jobs"), default="cu")
    p.add_argument("--top-models-per-user", type=int, default=5)
    args = parser.parse_args()
    try:
        if args.command == "render":
            render(json.loads(Path(args.snapshot).read_text()), args.out, args.title, args.pdf, args.names, args.rank_by, args.top_models_per_user)
            print(str(Path(args.out).resolve()))
        else:
            data = json.loads(Path(args.input).read_text())
            query = data["query"] if args.command == "ingest" else data
            target = Path(args.cache) / (cache_id(args.account, query) + ".json")
            if args.command == "ingest":
                users = json.loads(Path(args.users).read_text()) if args.users else None
                members = json.loads(Path(args.members).read_text()) if args.members else None
                snapshot = ingest(data, args.account, users=users, members=members)
                private_write(target, json.dumps(snapshot))
            elif not target.exists() or not fresh(json.loads(target.read_text()), args.account, query, args.ttl, require_users=args.require_users):
                print("Cache miss or expired; fetch through MCP.")
                return 1
            print(str(target.resolve()))
    except (ValueError, KeyError, TypeError, OSError, RuntimeError) as error:
        parser.exit(2, f"Analytics error: {error}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
