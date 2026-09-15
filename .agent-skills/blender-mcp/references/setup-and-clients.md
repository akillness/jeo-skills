# MCP for Blender setup and client wiring

Verified against upstream commit `7684c6b3ad2aa0710bbdb1cb06b497c90899ae00`.

## Prerequisites

| Requirement | Expectation |
|---|---|
| Blender | 3.0 or newer |
| Python | 3.10 or newer |
| uv | installed with the official installer, not `pip install uv` |

`pip install uv` may not create the `uvx` command and can hide uv inside an
environment the MCP client cannot see. The repository's `.python-version` is a
contributor hint and does not affect `uvx`.

Check the host without installing anything:

```bash
python3 .agent-skills/blender-mcp/scripts/blender-mcp-check.py doctor
```

## Install the server

The server is run on demand rather than installed globally:

```bash
uvx blender-mcp
```

Locked-down machines can use pipx instead, then point the client at the
resulting absolute path:

```bash
pipx install blender-mcp
pipx ensurepath
which blender-mcp   # or: where blender-mcp
```

## Install the addon

```bash
uvx blender-mcp install-addon     # copies the addon in as blender_mcp.py
uvx blender-mcp addon-paths       # lists detected Blender addons folders
```

`install-addon` prints the destination and keeps a `.bak` of any file it
replaces. Override the destination with `BLENDERMCP_ADDONS_DIR`.

Then, in Blender:

1. **Edit → Preferences → Add-ons**
2. enable **Interface: MCP for Blender** (search for "MCP for Blender")
3. press `N` in the 3D viewport and open the **MCP for Blender** tab
4. click **Start MCP Server**

If the addon does not appear, use **Install…** and select the copied
`blender_mcp.py` or a downloaded `addon.py`, or restart Blender.

### Upgrading

Run `install-addon` again, then disable and re-enable the addon or restart
Blender, and click **Start MCP Server** again. If the server package itself
needs refreshing, remove the MCP entry from the client and add it back.

The server never modifies addon files on its own. At startup it only checks
whether the installed addon is behind the bundled copy and logs how to update.

## Client configuration

### Recommended baseline

```json
{
  "mcpServers": {
    "blender": {
      "command": "uvx",
      "args": ["--python", "3.11", "blender-mcp"],
      "env": { "UV_PYTHON_PREFERENCE": "only-managed" }
    }
  }
}
```

`--python 3.11` still satisfies `requires-python >=3.10`, and
`UV_PYTHON_PREFERENCE=only-managed` stops uv from selecting conda, pyenv, asdf,
or system Python first.

### PATH failures in GUI-launched clients

Clients started from a Dock, Start menu, or taskbar do not inherit a terminal
PATH, so a bare `"command": "uvx"` can fail with a spawn error even when `uvx`
works in a terminal. Fixes:

- use the absolute path from `which uvx` or `where uvx`, for example
  `/opt/homebrew/bin/uvx` or `C:\Users\<you>\.local\bin\uvx.exe`;
- on Windows, wrap it: `"command": "cmd", "args": ["/c", "uvx", "blender-mcp"]`.

After any PATH or config change, fully quit and relaunch the client. On Windows
quit from the system tray, not just the window.

If a previous failed attempt keeps replaying after a fix, clear the cache:

```bash
uv cache clean blender-mcp && uvx --refresh blender-mcp
```

### Supported clients

The README documents entries for Claude for Desktop, Codex, Cursor, Visual
Studio Code, OpenCode, and Antigravity. The shape is the same in each: a
command, arguments, and optional environment. Read the current README section
for a client's exact config file location rather than guessing.

### Two Blender instances

```json
{
  "mcpServers": {
    "blender":   { "command": "uvx", "args": ["blender-mcp"] },
    "blender-b": { "command": "uvx", "args": ["blender-mcp", "--port", "9877"] }
  }
}
```

Each instance also needs its matching port set in its own Blender addon panel.

### Docker

Blender still runs on the host; the container only hosts the MCP server.

```bash
docker build -t blender-mcp .
```

```json
{
  "mcpServers": {
    "blender": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "blender-mcp"]
    }
  }
}
```

The `-i` flag is required because the server speaks over stdin and stdout. The
image defaults to `BLENDER_HOST=host.docker.internal`, which reaches the host on
macOS and Windows with Docker Desktop.

On Linux, `host.docker.internal` does not exist and the addon only listens on
localhost, so use host networking:

```json
{
  "mcpServers": {
    "blender": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "--network=host",
               "-e", "BLENDER_HOST=localhost", "blender-mcp"]
    }
  }
}
```

Add `"-e", "BLENDER_MCP_SAFE_MODE=1"` to enable safe mode in the container.

## Environment variables

### Connection and posture

| Variable | Default | Effect |
|---|---|---|
| `BLENDER_HOST` | `localhost` | host of the Blender socket server |
| `BLENDER_PORT` | `9876` | port of the Blender socket server |
| `BLENDER_MCP_SAFE_MODE` | off | set truthy to validate scripts before they run |
| `BLENDERMCP_ADDONS_DIR` | unset | override the addon install destination |

### Telemetry opt-out

`DISABLE_TELEMETRY`, `BLENDER_MCP_DISABLE_TELEMETRY`, `MCP_DISABLE_TELEMETRY`.

### Provider credentials

| Variable |
|---|
| `BLENDERMCP_SKETCHFAB_API_KEY` |
| `BLENDERMCP_POLYPIZZA_API_KEY` |
| `BLENDERMCP_HYPER3D_API_KEY` |
| `BLENDERMCP_HUNYUAN3D_SECRET_ID` |
| `BLENDERMCP_HUNYUAN3D_SECRET_KEY` |
| `BLENDERMCP_HUNYUAN3D_API_URL` |

Credentials can also be stored persistently in **Edit → Preferences → Add-ons →
MCP for Blender** so they survive Blender restarts. The environment variables
exist for headless and CI setups. Never print a value.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Connection errors | The addon server is not started in Blender, or the client entry is wrong. Do not run the `uvx` command manually in a terminal as a fix. |
| Spawn error naming `uvx` | GUI client PATH; use the absolute `uvx` path or the Windows `cmd /c` wrapper. |
| Timeouts | Simplify the request or split it into smaller steps. |
| Addon missing after install | Use **Install…** with the copied file, or restart Blender. |
| Version mismatch warnings | Run `install-addon`, then re-enable the addon and start the server again. |
| Poly Pizza download blocked by a Cloudflare challenge | The CDN blocks datacenter, VPN, and cloud IPs. The API key is not the problem. Retry from a normal connection or import the `.glb` by hand. |
| Still failing | Restart both the client and the Blender server. |
