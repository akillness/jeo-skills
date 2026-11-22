"""Serve a film folder on a free local port, and read the film's metadata.

render.py, mix.py and finish.py serve the folder so headless Chrome can load the film, then ask it
(info.mjs) for its title, length, frame rate, tempo, cuts, end card and every sound cue.
"""

import functools
import http.server
import json
import os
import socketserver
import subprocess
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class FilmServer(socketserver.ThreadingTCPServer):
    daemon_threads = True
    # Python's default backlog of 5 overflowed when several render workers booted at once: the
    # extra connections were reset (net::ERR_CONNECTION_RESET) and those workers timed out.
    request_queue_size = 128


def serve(folder):
    """Serve folder on 127.0.0.1 at a free port. Returns (url, server); call stop(server) after."""
    handler = functools.partial(QuietHandler, directory=os.path.abspath(folder))
    server = FilmServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}/", server


def stop(server):
    server.shutdown()
    server.server_close()


def film_info(folder, info_file=None):
    """The film's metadata, from info_file (JSON that info.mjs wrote) or from the film in a browser.

    Exits with info.mjs's own message, never a traceback, when the film does not load or its spec
    has an error. Warnings are printed and the film's metadata is returned.
    """
    if info_file:
        with open(info_file) as fh:
            return json.load(fh)
    url, server = serve(folder)
    env = {**os.environ, "FILM_URL": url, "FILM_DIR": os.path.abspath(folder)}
    try:
        result = subprocess.run(
            ["node", os.path.join(HERE, "info.mjs")], env=env, capture_output=True, text=True
        )
    except FileNotFoundError:
        sys.exit("node was not found: install Node 20 or newer")
    finally:
        stop(server)
    sys.stderr.write(result.stderr)
    if result.returncode != 0:
        sys.exit(f"the film in {os.path.abspath(folder)} did not load: fix the problems above")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        sys.exit(f"info.mjs exited 0 but printed no film metadata (stdout: {result.stdout[:200]!r})")


if __name__ == "__main__":
    sys.exit("usage: filmserver.py is imported by render.py, mix.py and finish.py, not run on its own")
