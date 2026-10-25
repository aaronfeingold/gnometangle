# Contributing to Gnometangle

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

- **Bugs and ideas:** open an [issue](https://github.com/aaronfeingold/gnometangle/issues/new/choose). For bugs,
  include your GNOME Shell version (`gnome-shell --version`), Wayland or X11, and your monitor setup.
- **Security problems:** report them privately, see [SECURITY.md](SECURITY.md).
- **Code:** for anything bigger than a small fix, comment on an issue first so we can agree on the approach.

## Development setup

Requires Node.js 22 (see `.nvmrc`), pnpm, and GNOME Shell 45 or later to try the extension.

```sh
git clone https://github.com/aaronfeingold/gnometangle.git
cd gnometangle
pnpm install
pnpm check        # lint, format check, typecheck, unit tests, build
```

### Try your changes

`scripts/install.sh` builds and installs the extension for your user. GNOME on Wayland only loads extension code at
login, so either log out and back in, or run a nested shell (GNOME 49 and later use `--devkit`, older releases use
`--nested`):

```sh
./scripts/install.sh
dbus-run-session -- gnome-shell --devkit --wayland
```

Watch the shell's log for errors from the extension:

```sh
journalctl --user -f -o cat /usr/bin/gnome-shell
```

## How the code is organized

```
src/core/          Pure TypeScript with no GNOME imports: actions, geometry, cycling, monitors, accelerators.
                   Everything here is unit tested with Vitest.
src/extension.ts   Enable and disable: settings, keybindings, the top bar icon and overrides.
src/snapper.ts     Runs actions on windows, with the per-window history for cycling and restore.
src/window.ts      Reads window frames and work areas, and moves windows through Mutter.
src/indicator.ts   Top bar icon and menu: every action with its shortcut, plus "Customize Shortcuts…".
src/overrides.ts   Saves, removes and restores conflicting GNOME shortcuts.
src/compat.ts      Window API differences between GNOME 45-48 and 49+.
src/prefs.ts       Adwaita preferences window with a shortcut recorder.
src/stylesheet.css Shell styles (top bar menu).
src/icons/         Symbolic top bar icon.
scripts/build.mjs  Bundles with esbuild and generates the GSettings schema from src/core/actions.ts.
```

The GSettings schema is generated, so keys and defaults can't drift from the code.

### Adding an action

1. Add an entry to `ACTIONS` in `src/core/actions.ts`: id, label, group, default shortcuts (often none) and
   behavior. The id is also the GSettings key and the name Mutter registers the keybinding under, so it must not
   match a GNOME keybinding name; `test/actions.test.ts` checks this.
2. Most actions are a region: a fraction of the work area, or several to cycle through on repeat. If none of the
   existing behavior kinds fits, add one to `ActionBehavior` and handle it in `computeTarget` in
   `src/core/geometry.ts`. Either way, add unit tests in `test/geometry.test.ts`.
3. Add a row to the shortcuts table in the README.

The preferences window and the top bar menu pick it up automatically.

## Tests

| Command                       | What it checks                                                   |
| ----------------------------- | ---------------------------------------------------------------- |
| `pnpm test`                   | Unit tests for everything in `src/core/`                         |
| `pnpm check`                  | Lint, formatting, types, unit tests and build. CI runs the same. |
| `scripts/smoke-test.sh <zip>` | End-to-end in a headless GNOME Shell (below)                     |

`scripts/smoke-test.sh` starts a headless GNOME Shell with two virtual monitors, installs the packed zip, opens a
real GTK window and checks that every shortcut registered, snapping, cycling, restore, unmaximizing, display moves,
real Ctrl+Alt+Left and Ctrl+Alt+Enter key presses, the top bar menu, the preferences window, and that GNOME's
shortcuts are restored on disable. CI runs it on GNOME 46, 49 and 50 in Ubuntu containers. Run it locally:

```sh
pnpm run pack
scripts/smoke-test.sh gnometangle@aaronfeingold.github.io.shell-extension.zip
# or in a container, the way CI does:
docker run --rm -v "$PWD:/src:ro" -w /src ubuntu:24.04 scripts/smoke-container.sh
```

### Screenshots

The images in the README are generated, not hand-made. After a visible change, regenerate them and commit the
results in `docs/images/`:

```sh
scripts/screenshots.sh     # needs gnome-shell, gjs, libadwaita, ImageMagick and ffmpeg
```

## Pull requests

- Keep each pull request to one change, and describe what it fixes and how you tested it.
- `pnpm check` must pass, and the smoke test should pass for changes to anything in `src/` outside `src/core/`.
- `main` only changes through pull requests that pass CI, and the maintainer reviews each one before it merges.

## Releasing (maintainer)

Bump `version` in `package.json` and merge that pull request. Then tag the merge commit on `main`:

```sh
git switch main && git pull && git tag v0.1.1 && git push origin v0.1.1
```

The release workflow refuses tags that aren't on `main` or don't match `package.json`. It runs the full checks,
builds the zip and publishes it with `SHA256SUMS` and a build attestation. That zip is what gets uploaded to
extensions.gnome.org.
