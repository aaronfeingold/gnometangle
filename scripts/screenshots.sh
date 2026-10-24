#!/usr/bin/env bash
# Regenerates the README images in docs/images/ from a real (headless) GNOME Shell:
#   menu.png       the top bar menu over a few snapped windows
#   prefs.png      the preferences window
#   snapping.gif   a window cycling through halves, corners, thirds and maximize
#
# Usage: scripts/screenshots.sh [<uuid>.shell-extension.zip]   (default: builds one)
# Needs: gnome-shell, gjs, GTK 4 + libadwaita typelibs, dconf, dbus, ImageMagick, ffmpeg.
set -euo pipefail

UUID=gnometangle@aaronfeingold.github.io
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/docs/images"

if [[ -z "${SHOTS_INNER:-}" ]]; then
  ZIP=${1:-}
  if [[ -z "$ZIP" ]]; then
    (cd "$ROOT" && pnpm run pack >/dev/null)
    ZIP="$ROOT/$UUID.shell-extension.zip"
  fi
  ZIP=$(realpath "$ZIP")
  HOME=$(mktemp -d)
  XDG_RUNTIME_DIR=$(mktemp -d)
  chmod 700 "$XDG_RUNTIME_DIR"
  export HOME XDG_RUNTIME_DIR SHOTS_INNER=1 ZIP
  exec dbus-run-session -- "$0"
fi

WIDTH=1600 HEIGHT=1000
FRAMES="$HOME/frames"
mkdir -p "$OUT" "$FRAMES"
shell_pid=
clients=()
cleanup() {
  for pid in "${clients[@]}"; do kill "$pid" 2>/dev/null || true; done
  [[ -n "$shell_pid" ]] && kill "$shell_pid" 2>/dev/null || true
}
trap cleanup EXIT

# Evaluates JavaScript in the shell and prints the result without GVariant quoting.
ev() {
  local out
  out=$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Eval "$1")
  [[ "$out" == "(true, "* ]] || { echo "eval failed: $1 -> $out" >&2; return 1; }
  out=${out#"(true, '"}
  out=${out%"')"}
  printf '%s' "${out//\"/}"
}

shot() {
  gdbus call --session --dest org.gnome.Shell.Screenshot --object-path /org/gnome/Shell/Screenshot \
    --method org.gnome.Shell.Screenshot.Screenshot false false "$1" >/dev/null
}

mkdir -p "$HOME/.local/share/gnome-shell/extensions/$UUID"
unzip -q -o "$ZIP" -d "$HOME/.local/share/gnome-shell/extensions/$UUID"
glib-compile-schemas "$HOME/.local/share/gnome-shell/extensions/$UUID/schemas"
gsettings set org.gnome.desktop.interface color-scheme prefer-dark
# Skip the distro welcome tour that a fresh home would show.
gsettings set org.gnome.shell welcome-dialog-last-shown-version '999'

shell_args=(--headless --wayland --unsafe-mode --virtual-monitor "${WIDTH}x${HEIGHT}")
if gnome-shell --help 2>&1 | grep -q -- '--no-x11'; then shell_args+=(--no-x11); fi
gnome-shell "${shell_args[@]}" >"$HOME/shell.log" 2>&1 &
shell_pid=$!
for _ in $(seq 1 60); do
  if ev 'Main.layoutManager._startingUp === false' 2>/dev/null | grep -q true; then break; fi
  sleep 0.5
done
ev "Main.overview.hide()" >/dev/null
ev "Main.extensionManager.enableExtension('$UUID')" >/dev/null
sleep 1
EXT="Main.extensionManager.lookup('$UUID').stateObj"
ev "$EXT.settings.set_int('gap-size', 8)" >/dev/null

# Demo windows: a libadwaita window with a header bar and a status page.
open_window() {
  local title=$1 icon=$2 subtitle=$3
  GTK_A11Y=none GSK_RENDERER=cairo GDK_BACKEND=wayland WAYLAND_DISPLAY=wayland-0 gjs -c "
    imports.gi.versions.Gtk = '4.0';
    imports.gi.versions.Adw = '1';
    const {Adw, Gtk, GLib} = imports.gi;
    Adw.init();
    const view = new Adw.ToolbarView();
    view.add_top_bar(new Adw.HeaderBar());
    view.set_content(new Adw.StatusPage({title: '$title', description: '$subtitle', icon_name: '$icon'}));
    new Adw.Window({title: '$title', default_width: 640, default_height: 460, content: view}).present();
    new GLib.MainLoop(null, false).run();
  " >/dev/null 2>&1 &
  clients+=($!)
  for _ in $(seq 1 40); do
    [[ "$(ev "global.get_window_actors().filter(a => a.meta_window.get_title() === '$title').length" 2>/dev/null)" == 1 ]] && break
    sleep 0.25
  done
}
win() { echo "global.get_window_actors().find(a => a.meta_window.get_title() === '$1').meta_window"; }
snap() { ev "$EXT.run('$2', $(win "$1"))" >/dev/null; sleep 0.3; }

open_window Editor accessories-text-editor-symbolic 'Ctrl+Alt+Left: left half'
open_window Terminal utilities-terminal-symbolic 'Ctrl+Alt+I: top right'
open_window Files folder-symbolic 'Ctrl+Alt+K: bottom right'
snap Editor left-half
snap Terminal top-right
snap Files bottom-right
sleep 0.5

# Top bar menu with the Halves group expanded, over the snapped windows.
IND="Main.panel.statusArea['$UUID']"
ev "$(win Editor).activate(global.get_current_time())" >/dev/null
ev "(() => { $IND.menu.open(); $IND.menu._getMenuItems()[0].setSubmenuShown(true); return 1; })()" >/dev/null
sleep 0.6
shot "$HOME/menu.png"
ev "$IND.menu.close()" >/dev/null

# Snapping animation: one window walks through a few actions, each frame captioned with its shortcut.
ev "$(win Terminal).minimize()" >/dev/null
ev "$(win Files).minimize()" >/dev/null
ev "$(win Editor).minimize()" >/dev/null
open_window Notes document-edit-symbolic ''
snap Notes center
n=0
while IFS='|' read -r action caption; do
  snap Notes "$action"
  sleep 0.2
  frame="$FRAMES/$(printf '%02d' $n).png"
  shot "$frame"
  magick "$frame" -gravity south -font Cantarell-Bold -pointsize 34 \
    -fill '#000000b0' -draw "roundrectangle $((WIDTH / 2 - 230)),$((HEIGHT - 110)) $((WIDTH / 2 + 230)),$((HEIGHT - 40)) 18,18" \
    -fill white -annotate +0+58 "$caption" "$frame"
  n=$((n + 1))
done <<'EOF'
center|Ctrl+Alt+C   Center
left-half|Ctrl+Alt+←   Left Half
left-half|Ctrl+Alt+← again   Two Thirds
right-half|Ctrl+Alt+→   Right Half
top-left|Ctrl+Alt+U   Top Left
top-right|Ctrl+Alt+I   Top Right
bottom-right|Ctrl+Alt+K   Bottom Right
bottom-left|Ctrl+Alt+J   Bottom Left
first-third|Ctrl+Alt+D   First Third
center-third|Ctrl+Alt+F   Center Third
last-third|Ctrl+Alt+G   Last Third
maximize-window|Ctrl+Alt+Enter   Maximize
restore|Ctrl+Alt+Backspace   Restore
EOF

# Preferences window (Shortcuts page), cropped to the window.
dbus-update-activation-environment WAYLAND_DISPLAY=wayland-0 GDK_BACKEND=wayland GSK_RENDERER=cairo GTK_A11Y=none
gnome-extensions prefs "$UUID" >/dev/null 2>&1 || true
for _ in $(seq 1 40); do
  [[ -n "$(ev "global.get_window_actors().map(a => a.meta_window.get_title() ?? '').filter(t => t.includes('Gnometangle')).join('')" 2>/dev/null)" ]] && break
  sleep 0.25
done
sleep 1
PREFS="global.get_window_actors().find(a => (a.meta_window.get_title() ?? '').includes('Gnometangle')).meta_window"
ev "$PREFS.move_frame(true, 400, 80)" >/dev/null
sleep 0.5
shot "$HOME/prefs-full.png"
IFS=, read -r px py pw ph <<<"$(ev "(() => { const r = $PREFS.get_frame_rect(); return [r.x, r.y, r.width, r.height].join(','); })()")"

magick "$HOME/menu.png" -resize 1200x "$OUT/menu.png"
magick "$HOME/prefs-full.png" -crop "${pw}x${ph}+${px}+${py}" +repage -resize 720x "$OUT/prefs.png"
ffmpeg -loglevel error -y -framerate 1.25 -i "$FRAMES/%02d.png" \
  -vf "scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  -loop 0 "$OUT/snapping.gif"
ls -la "$OUT"
