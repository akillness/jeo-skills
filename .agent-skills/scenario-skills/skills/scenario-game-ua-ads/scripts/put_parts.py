#!/usr/bin/env python3
"""PUT a local file to the presigned part URLs the MCP upload_asset tool returned, in order.

Usage: python3 put_parts.py FILE PARTS.json [--part-size 6000000] [-o etags.json] [--allow-host HOST]

Write the upload_asset response, or just its part URLs, to PARTS.json, copied exactly. It reads:
- the response object: its "parts" list, each part a URL or an object holding it under "upload_url"
  or "url", with "part_number" and "content_length" when present, and "part_size" and "upload_id"
  when the response has them;
- a plain JSON list of the part URLs, in order.

- Parts are part_size bytes, else --part-size (default 6,000,000 bytes, not 6 MiB); the last part
  holds the rest. The URL count and any content_length must match the file, checked before the
  first PUT.
- Each part goes out as one PUT with its exact Content-Length and no Content-Type or checksum
  header: a presigned URL can refuse a header it did not sign. Nothing goes through a pipe or a
  temporary file.
- A network error or a 5xx answer is retried twice. A 403 usually means the URLs expired: call
  upload_asset again.
- Prints JSON with the upload_id and each part's ETag, also written to -o. Then call
  upload_asset_complete with that upload_id.

It only sends the file to presigned S3 part URLs, the kind upload_asset returns: every URL must be
https, on an amazonaws.com host, signed (X-Amz-Signature), and all on one host, checked before the
first PUT. Anything else is refused, so a tampered PARTS.json cannot send the file elsewhere. Should
Scenario move its uploads, pass the new host with --allow-host. Plain http is accepted only on a
loopback host, for a local test server.

It makes no Scenario API call, like downloading the URL asset_download gives. Exit status 1 when a
part fails, 2 when PARTS.json does not fit the file or holds a URL it will not send to.
"""

import argparse
import http.client
import json
import math
import sys
import time
import urllib.parse
from pathlib import Path

PART_SIZE = 6_000_000
RETRIES = 2
S3_HOST_SUFFIX = ".amazonaws.com"
LOOPBACK = {"127.0.0.1", "::1", "localhost"}


class PartsError(Exception):
    pass


def same_file(a, b):
    """True when two paths name one file, so an output would overwrite an input."""
    return a is not None and b is not None and Path(a).resolve() == Path(b).resolve()


def check_url(k, url, allow=()):
    """The URL's host, when it is a presigned S3 part URL this script may send a file to."""
    u = urllib.parse.urlsplit(url)
    host = (u.hostname or "").lower()
    if u.scheme != "https" and not (u.scheme == "http" and host in LOOPBACK):
        raise PartsError(f"part {k} is not an https URL: upload_asset returns https part URLs")
    if not (host.endswith(S3_HOST_SUFFIX) or host in LOOPBACK or host in allow):
        raise PartsError(f"part {k} goes to {host or 'no host'}, not an S3 upload host (*{S3_HOST_SUFFIX}); "
                         "if Scenario moved its uploads, pass --allow-host with that host")
    if "X-Amz-Signature" not in urllib.parse.parse_qs(u.query):
        raise PartsError(f"part {k} is not a presigned URL: it carries no X-Amz-Signature")
    return host


def read_parts(raw, allow=()):
    """(upload_id, part_size, [(part number, url, content_length)]) from a response object or a URL list.

    Every URL passes check_url and all share one host, before anything is sent.
    """
    if isinstance(raw, list):
        raw = {"parts": raw}
    if not isinstance(raw, dict) or not isinstance(raw.get("parts"), list) or not raw["parts"]:
        raise PartsError("no parts list: save the upload_asset response, or a JSON list of the part URLs")
    parts = []
    hosts = set()
    for k, p in enumerate(raw["parts"], 1):
        url = p if isinstance(p, str) else (p.get("upload_url") or p.get("url")) if isinstance(p, dict) else None
        if not isinstance(url, str) or not url.startswith(("https://", "http://")):
            raise PartsError(f"part {k} holds no URL")
        hosts.add(check_url(k, url, allow))
        meta = p if isinstance(p, dict) else {}
        parts.append((int(meta.get("part_number", k)), url, meta.get("content_length")))
    if len(hosts) > 1:
        raise PartsError(f"the part URLs go to {len(hosts)} hosts ({', '.join(sorted(hosts))}): one upload uses one")
    return raw.get("upload_id"), raw.get("part_size"), sorted(parts)


def put(url, data, timeout=120):
    """One PUT through http.client, which sends only Host and Content-Length here.

    urllib.request would add a form Content-Type to every request with a body.
    """
    u = urllib.parse.urlsplit(url)
    conn = (http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection)(u.netloc, timeout=timeout)
    try:
        conn.putrequest("PUT", (u.path or "/") + (f"?{u.query}" if u.query else ""), skip_accept_encoding=True)
        conn.putheader("Content-Length", str(len(data)))
        conn.endheaders(data)
        r = conn.getresponse()
        body = r.read(2000)
        return r.status, r.getheader("ETag"), body.decode("utf-8", "replace")
    finally:
        conn.close()


def upload(path, upload_id, size, parts, wait=1.0):
    total = path.stat().st_size
    count = max(1, math.ceil(total / size))
    if count != len(parts):
        raise PartsError(f"{path.name} is {total} bytes: {count} parts of {size} bytes, but PARTS.json lists {len(parts)} "
                         "URLs. Was upload_asset given this file's size?")
    for i, (n, _, length) in enumerate(parts):
        expected = min(size, total - i * size)
        if length is not None and int(length) != expected:
            raise PartsError(f"part {n}: {expected} bytes, but the response expects {length}")
    etags = []
    with path.open("rb") as f:
        for i, (n, url, _) in enumerate(parts):
            f.seek(i * size)
            data = f.read(size)
            for attempt in range(RETRIES + 1):
                try:
                    status, etag, body = put(url, data)
                except OSError as e:
                    status, etag, body = None, None, str(e)
                if status is not None and status < 500:
                    break
                if attempt < RETRIES:
                    time.sleep(wait * (attempt + 1))
            if status is None or not 200 <= status < 300:
                hint = ": the URLs may have expired, call upload_asset again" if status == 403 else ""
                print(f"part {n}/{len(parts)}: {status or 'no answer'} {body[:300]}{hint}", file=sys.stderr)
                return None
            print(f"part {n}/{len(parts)}: {len(data)} bytes, {status}, ETag {etag}", file=sys.stderr)
            etags.append({"part_number": n, "etag": etag})
    return {"upload_id": upload_id, "file": path.name, "size": total, "parts": etags}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file", type=Path)
    ap.add_argument("parts", type=Path, help="the upload_asset response, or a JSON list of the part URLs")
    ap.add_argument("--part-size", type=int, help=f"bytes per part when the response gives none ({PART_SIZE})")
    ap.add_argument("-o", "--out", type=Path, help="also write the JSON result here")
    ap.add_argument("--allow-host", action="append", default=[], metavar="HOST",
                    help=f"also accept part URLs on this host, besides *{S3_HOST_SUFFIX} (repeatable)")
    args = ap.parse_args(argv)
    if any(same_file(args.out, p) for p in (args.file, args.parts)):
        print(f"error: -o {args.out} is an input; write the result elsewhere", file=sys.stderr)
        return 2
    try:
        upload_id, size, parts = read_parts(json.loads(args.parts.read_text()), {h.lower() for h in args.allow_host})
        result = upload(args.file, upload_id, int(size or args.part_size or PART_SIZE), parts)
    except (PartsError, ValueError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    if result is None:
        return 1
    text = json.dumps(result, indent=1)
    print(text)
    if args.out:
        args.out.write_text(text + "\n")
    if upload_id:
        print(f"next: upload_asset_complete with upload_id {upload_id}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
