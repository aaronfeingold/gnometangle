# Gnometangle

Keyboard-driven window snapping for GNOME Shell, modeled on [Rectangle](https://github.com/rxhanson/Rectangle) for
macOS. Press a shortcut and the focused window jumps to a half, third, fourth or corner of its screen, maximizes,
centers, or moves to another monitor. Works on Wayland and X11.

Targets GNOME Shell 45 through 50. An end-to-end test runs on GNOME 46, 49 and 50 under Wayland in CI for every
change, and has also passed on GNOME 48. GNOME 45 and 47 are expected to work but are not tested yet.

## Shortcuts

Rectangle uses Ctrl+Option on macOS. Here that is **Ctrl+Alt**. Every shortcut can be changed or disabled in the
preferences window.

| Action                                            | Default                     |
| ------------------------------------------------- | --------------------------- |
| Left / Right half                                 | Ctrl+Alt+Left / Right       |
| Top / Bottom half                                 | Ctrl+Alt+Up / Down          |
| Center half                                       | unset                       |
| Top left / Top right / Bottom left / Bottom right | Ctrl+Alt+U / I / J / K      |
| First / Center / Last third                       | Ctrl+Alt+D / F / G          |
| First / Last two thirds                           | Ctrl+Alt+E / T              |
| Center two thirds                                 | unset                       |
| First / Second / Third / Last fourth              | unset                       |
| First / Center / Last three fourths               | unset                       |
| Maximize                                          | Ctrl+Alt+Enter              |
| Almost maximize                                   | unset                       |
| Maximize height                                   | Ctrl+Alt+Shift+Up           |
| Make smaller / Make larger                        | Ctrl+Alt+Minus / Equal      |
| Center                                            | Ctrl+Alt+C                  |
| Restore                                           | Ctrl+Alt+Backspace          |
| Next / Previous display                           | Ctrl+Alt+Super+Right / Left |

Behaviour borrowed from Rectangle:

- Pressing a half shortcut again cycles the width (or height) through 1/2, 2/3 and 1/3. First third and last third
  cycle through the three thirds.
- Thirds and fourths stack vertically on portrait monitors.
- Restore puts the window back where it was before the first snap.
- Moving to another display keeps a snapped window's layout and a floating window's size.
- Make larger and make smaller keep edges that touch the screen pinned, so a left-half window grows to the right.

## Settings

- Gap size between windows and around screen edges.
- Cycle sizes on repeat (on by default).
- Almost maximize size (90 percent by default).
- Resize step for make larger and make smaller.
- Override conflicting GNOME shortcuts (on by default), described below.

## Conflicts with GNOME shortcuts

GNOME binds Ctrl+Alt+Arrow keys to workspace switching, and Ctrl+Alt+Shift+Up to moving a window up a workspace.
With **Override conflicting GNOME shortcuts** on, the extension removes only the GNOME entries that use the same keys
as its own shortcuts while it is enabled, and puts them back when it is disabled. Other keys on those GNOME actions
(such as Super+Page Up) keep working. The originals are saved before anything changes, so they are also restored on
the next start if the shell ever exits without disabling the extension.

On Ubuntu, Ctrl+Alt+T opens a terminal. That binding lives in a different place and is not overridden, so the
terminal wins. Rebind "Last Two Thirds" (or the terminal shortcut) if you want both.

## Install

### From a release

1. Download `gnometangle@aaronfeingold.github.io.shell-extension.zip` from the
   [latest release](https://github.com/aaronfeingold/gnometangle/releases/latest).
2. Install and enable it:

   ```sh
   gnome-extensions install --force gnometangle@aaronfeingold.github.io.shell-extension.zip
   ```

3. Log out and back in (required on Wayland), then:

   ```sh
   gnome-extensions enable gnometangle@aaronfeingold.github.io
   gnome-extensions prefs gnometangle@aaronfeingold.github.io   # optional, opens preferences
   ```

### From source

Requires Node.js 22 and pnpm.

```sh
git clone https://github.com/aaronfeingold/gnometangle.git
cd gnometangle
./scripts/install.sh
```

## Development

```sh
pnpm install
pnpm check        # lint, format check, typecheck, unit tests, build
pnpm run pack     # build dist/ and the installable zip
```

To try changes without logging out, run a nested shell (GNOME 49 and later use `--devkit`, older releases use
`--nested`):

```sh
./scripts/install.sh
dbus-run-session -- gnome-shell --devkit --wayland
```

### End-to-end test

`scripts/smoke-test.sh` starts a headless GNOME Shell with two virtual monitors, installs the packed zip, opens a
real GTK window and checks snapping, cycling, restore, unmaximizing, display moves, a synthetic Ctrl+Alt+Left key
press, the preferences window, and that GNOME's shortcuts are restored on disable. CI runs it inside Ubuntu
containers. To run it locally with Docker:

```sh
pnpm run pack
docker run --rm -v "$PWD:/src:ro" -w /src ubuntu:24.04 scripts/smoke-container.sh
```

### Layout

```
src/core/       Pure TypeScript with no GNOME imports: actions, geometry, cycling, monitors, accelerators.
                Everything here is unit tested with Vitest.
src/extension.ts  Registers keybindings and moves windows through Mutter.
src/overrides.ts  Saves, removes and restores conflicting GNOME shortcuts.
src/compat.ts     Window API differences between GNOME 45-48 and 49+.
src/prefs.ts      Adwaita preferences window with a shortcut recorder.
scripts/build.mjs Bundles with esbuild and generates the GSettings schema from src/core/actions.ts.
```

The GSettings schema is generated, so adding an action means adding one line to `src/core/actions.ts` and handling
it in `src/core/geometry.ts`.

### Releasing

Bump `version` in `package.json`, merge, then push a matching tag:

```sh
git tag v0.1.0 && git push origin v0.1.0
```

The release workflow builds the zip and attaches it to a GitHub release. That zip is what gets uploaded to
extensions.gnome.org.

## Roadmap

- Drag-to-edge snap areas
- User-defined layouts
- Per-application rules
- Publish on extensions.gnome.org

## License

MIT. Gnometangle is an independent project and is not affiliated with Rectangle or its authors.
