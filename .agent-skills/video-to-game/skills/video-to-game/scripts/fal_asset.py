#!/usr/bin/env python3
"""Run one fal model, download what it returns, and log the call.

Every asset of the game goes through this script, so the log (fal_log.json next to the outputs) lists each
file with the endpoint that made it. Local files passed with --file are uploaded to the fal CDN first.

Usage:
  python3 fal_asset.py minimax/h3-max/text-to-video -o video/ --arg prompt="..." --arg duration=10 \\
      --arg prompt_expansion_mode=disabled --arg resolution=1080P
  python3 fal_asset.py fal-ai/nano-banana-pro/edit -o assets/ --name hero_concept \\
      --arg prompt="the hero alone, A-pose, plain light grey background" --file image_urls=study/f_012.jpg
  python3 fal_asset.py fal-ai/birefnet/v2 -o assets/ --name hero_cutout --file image_url=assets/hero_concept.png
  python3 fal_asset.py meshy/v7.1/image-to-3d -o assets/ --name hero --file image_url=assets/hero_cutout.png
  python3 fal_asset.py fal-ai/elevenlabs/sound-effects/v2 -o assets/ --name jump --arg text="soft cloth whoosh"

--arg key=value   JSON value if it parses (numbers, true, lists), else a string. Repeat for each field.
--file key=path   uploads the file; repeat the same key to build a list (image_urls=a.png --file image_urls=b.png).

Needs FAL_KEY in the environment and `pip install fal-client`. One job at a time: wait for it, look at it,
then decide the next one.
"""
import argparse
import json
import mimetypes
import os
import sys
import time
import urllib.request

LIST_KEYS = ('image_urls', 'animation_action_ids', 'reference_image_urls')


def parse_value(v):
    try:
        return json.loads(v)
    except ValueError:
        return v


def urls_in(obj):
    """Every downloadable file URL in a fal result, with the key path it came from."""
    out = []
    if isinstance(obj, dict):
        if isinstance(obj.get('url'), str) and obj['url'].startswith('http'):
            out.append(('', obj['url'], obj.get('file_name') or obj.get('content_type')))
        for k, v in obj.items():
            if k != 'url':
                out += [(f'{k}.{p}'.strip('.'), u, n) for p, u, n in urls_in(v)]
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            out += [(f'{i}.{p}'.strip('.'), u, n) for p, u, n in urls_in(v)]
    return out


def ext_for(url, hint):
    path = url.split('?')[0]
    ext = os.path.splitext(path)[1]
    if ext and len(ext) <= 5:
        return ext
    return mimetypes.guess_extension(hint or '') or '.bin'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('endpoint')
    ap.add_argument('-o', '--out', default='assets')
    ap.add_argument('--name', help='base name of the saved files (default: endpoint + time)')
    ap.add_argument('--arg', action='append', default=[], metavar='KEY=VALUE')
    ap.add_argument('--file', action='append', default=[], metavar='KEY=PATH')
    a = ap.parse_args()

    if not os.environ.get('FAL_KEY'):
        sys.exit('FAL_KEY is not set')
    import fal_client  # pip install fal-client

    args = {}
    for kv in a.arg:
        k, v = kv.split('=', 1)
        args[k] = parse_value(v)
    for kv in a.file:
        k, p = kv.split('=', 1)
        url = fal_client.upload_file(p)
        if k in args or k in LIST_KEYS:
            args.setdefault(k, [])
            args[k] = (args[k] if isinstance(args[k], list) else [args[k]]) + [url]
        else:
            args[k] = url

    os.makedirs(a.out, exist_ok=True)
    name = a.name or a.endpoint.replace('/', '_') + time.strftime('_%H%M%S')
    t0 = time.time()
    result = fal_client.subscribe(a.endpoint, arguments=args, with_logs=False)
    files = []
    found = urls_in(result)
    for i, (key, url, hint) in enumerate(found):
        dest = os.path.join(a.out, name + ('' if len(found) == 1 else f'_{i}') + ext_for(url, hint))
        urllib.request.urlretrieve(url, dest)
        files.append({'file': dest, 'key': key, 'url': url})

    log_path = os.path.join(a.out, 'fal_log.json')
    log = json.load(open(log_path)) if os.path.exists(log_path) else []
    log.append({'endpoint': a.endpoint, 'name': name, 'seconds': round(time.time() - t0, 1),
                'arguments': {k: v for k, v in args.items() if k != 'prompt'}, 'prompt': args.get('prompt'),
                'files': [f['file'] for f in files]})
    with open(log_path, 'w') as f:
        json.dump(log, f, indent=1)
    for f in files:
        print(f['file'])
    if not files:
        print(json.dumps(result, indent=1)[:2000])


if __name__ == '__main__':
    main()
