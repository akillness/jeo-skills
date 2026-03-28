# URI and Callbacks

Obsidian CLI and the `obsidian://` URI protocol complement each other.

## URI format

```text
obsidian://action?param1=value&param2=value
```

Official actions:

- `open`
- `new`
- `daily`
- `unique`
- `search`
- `choose-vault`

## Encoding rules

Values must be URI encoded correctly.

Examples from the docs:

- spaces -> `%20`
- `/` -> `%2F`
- heading navigation -> `%23Heading`
- block navigation -> `%23%5EBlock`

Improperly encoded reserved characters can break the action.

## Open note

Examples:

```text
obsidian://open?vault=my%20vault
obsidian://open?vault=my%20vault&file=my%20note
obsidian://open?path=%2Fhome%2Fuser%2Fmy%20vault%2Fpath%2Fto%2Fmy%20note
```

Rules:

- `vault` can be the vault name or vault ID
- `file` can be a note name or a path from the vault root
- `path` is a global absolute file system path and overrides `vault` and `file`
- `paneType=tab|split|window` changes where the note opens

## Create note and daily note

Examples:

```text
obsidian://new?vault=my%20vault&name=my%20note
obsidian://daily?vault=my%20vault
obsidian://unique?vault=my%20vault&content=Hello%20World
```

Notes:

- `new` can use `name`, `file`, `path`, `content`, `clipboard`, `silent`, `append`, `overwrite`
- `daily` accepts the same parameters as `new`
- `daily` requires the Daily notes plugin
- `unique` requires the Unique note creator plugin

## Search and vault picker

Examples:

```text
obsidian://search?vault=my%20vault&query=Obsidian
obsidian://choose-vault
```

## x-callback-url support

Some endpoints accept:

- `x-success`
- `x-error`

The docs say `x-success` callbacks can receive:

- `name`
- `url` as an `obsidian://` URI
- `file` as a `file://` URL on desktop only

This makes URI automation useful for launcher apps and callback-based integrations.

## Hook integration

The docs also expose:

```text
obsidian://hook-get-address
```

If `x-success` is defined, Obsidian uses it as the callback URL. Otherwise, it copies a Markdown link of the focused note to the clipboard as an `obsidian://open` URL.

## Registration notes

- Running the app once should register the URI protocol on Windows and macOS
- Linux requires a more manual desktop-entry flow
