# RTK Install And Verify

Use this file when the user needs installation choices, verification logic, or a fix for the wrong `rtk` package.

## Decision order

1. Check `rtk --version`
2. Check `rtk gain`
3. Check `which rtk`
4. Install or repair only if `rtk gain` fails or `rtk` is missing

The key signal is simple:

- `rtk gain` works: correct RTK already installed
- `rtk --version` works but `rtk gain` fails: likely the wrong package
- `rtk` missing: install required

## Safe install methods

### Homebrew

```bash
brew install rtk
```

Use this when Homebrew is present and the user wants a standard package-manager install.

### Repository install script

```bash
curl -fsSL https://raw.githubusercontent.com/akillness/rtk/refs/heads/master/install.sh | sh
```

Notes:

- The fork's `install.sh` still downloads release artifacts from `rtk-ai/rtk`
- Default install target is `~/.local/bin`
- The script works well for Linux and macOS release installs

### Cargo from git

```bash
cargo install --git https://github.com/akillness/rtk
```

Use this when the user wants source-driven installation from the fork or is working on RTK itself.

## Dangerous install path

Avoid this unless the user already proved it resolves to Token Killer:

```bash
cargo install rtk
```

That name can resolve to the unrelated Rust Type Kit package. If the user already ran it and `rtk gain` fails, uninstall first:

```bash
cargo uninstall rtk
```

## Verification checklist

Run these after any install:

```bash
rtk --version
rtk gain
which rtk
```

Expected outcome:

- `rtk --version` prints a version string
- `rtk gain` prints token-savings stats instead of `not a rtk command`
- `which rtk` points at the intended binary path

## PATH fixes

If the binary installed but is not found:

### install.sh path

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### Cargo path

```bash
export PATH="$HOME/.cargo/bin:$PATH"
```

Use shell profile files such as `~/.zshrc` or `~/.bashrc` if the change should persist.
