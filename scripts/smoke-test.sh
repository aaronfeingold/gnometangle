#!/usr/bin/env bash
# End-to-end test: installs the packed extension into a headless GNOME Shell (Wayland),
# opens a real GTK window and checks that actions and a real key press move it.
#
# Usage: scripts/smoke-test.sh <uuid>.shell-extension.zip
# Needs: gnome-shell, gjs, GTK 4 typelibs, dconf, dbus. CI runs it inside distro containers.
set -euo pipefail

UUID=gnometangle@aaronfeingold.github.io
ZIP=$(realpath "${1:?usage: smoke-test.sh <extension zip>}")

# Re-run inside a private session bus with a throwaway home, so dconf writes land in the
# same home the shell reads from.
if [[ -z "${SMOKE_INNER:-}" ]]; then
  HOME=$(mktemp -d)
  XDG_RUNTIME_DIR=$(mktemp -d)
  chmod 700 "$XDG_RUNTIME_DIR"
  export HOME XDG_RUNTIME_DIR SMOKE_INNER=1
  exec dbus-run-session -- "$0" "$ZIP"
fi

LOG="$HOME/shell.log"
failures=0
shell_pid=
client_pid=

cleanup() {
  [[ -n "$client_pid" ]] && kill "$client_pid" 2>/dev/null || true
  [[ -n "$shell_pid" ]] && kill "$shell_pid" 2>/dev/null || true
}
trap cleanup EXIT

# Evaluates JavaScript in the shell and prints the result without GVariant quoting.
ev() {
  local out
  out=$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Eval "$1")
  if [[ "$out" != "(true, "* ]]; then
    echo "eval failed: $1 -> $out" >&2
    return 1
  fi
  out=${out#"(true, '"}
  out=${out%"')"}
  out=${out#\"}
  out=${out%\"}
  printf '%s' "$out"
}

check() {
  local name=$1 expected=$2 actual=$3
  if [[ "$actual" == "$expected" ]]; then
    echo "ok    $name"
  else
    echo "FAIL  $name: expected '$expected', got '$actual'"
    failures=$((failures + 1))
  fi
}

mkdir -p "$HOME/.local/share/gnome-shell/extensions/$UUID"
unzip -q -o "$ZIP" -d "$HOME/.local/share/gnome-shell/extensions/$UUID"
glib-compile-schemas "$HOME/.local/share/gnome-shell/extensions/$UUID/schemas"

shell_args=(--headless --wayland --unsafe-mode --virtual-monitor 1920x1080 --virtual-monitor 1280x1024)
if gnome-shell --help 2>&1 | grep -q -- '--no-x11'; then shell_args+=(--no-x11); fi
gnome-shell "${shell_args[@]}" >"$LOG" 2>&1 &
shell_pid=$!

for _ in $(seq 1 60); do
  if ev 'Main.layoutManager._startingUp === false' 2>/dev/null | grep -q true; then break; fi
  sleep 0.5
done
if ! kill -0 "$shell_pid" 2>/dev/null; then
  echo "FAIL  GNOME Shell exited during startup. Log:"
  tail -40 "$LOG"
  exit 1
fi
gnome-shell --version

WA="(()=>{const w=global.display.get_focus_window(); const r=w.get_work_area_current_monitor(); return [r.x,r.y,r.width,r.height].join(',')})()"
FRAME="(()=>{const r=global.display.get_focus_window().get_frame_rect(); return [r.x,r.y,r.width,r.height].join(',')})()"
EXT="Main.extensionManager.lookup('$UUID')"
KB="new imports.gi.Gio.Settings({schema_id: 'org.gnome.desktop.wm.keybindings'})"

original_shortcuts=$(ev "$KB.get_strv('switch-to-workspace-left').join('|')")
ev "Main.extensionManager.enableExtension('$UUID')" >/dev/null
sleep 1
check "extension enabled" "1 " "$(ev "$EXT.state + ' ' + ($EXT.error || '')")"
# Mutter silently refuses a keybinding whose name is already taken; only accepted ones are allowed.
check "every shortcut registered" "" "$(ev "(() => {
  const s = $EXT.stateObj.settings;
  return s.settings_schema.list_keys()
    .filter(k => s.get_value(k).get_type_string() === 'as' && !(k in Main.wm._allowedKeybindings))
    .join(',');
})()")"
check "GNOME shortcuts untouched by default" "$original_shortcuts" \
  "$(ev "$KB.get_strv('switch-to-workspace-left').join('|')")"
# The rest of the run presses the default keys, so turn on the overrides that free them.
ev "$EXT.stateObj.settings.set_boolean('override-conflicts', true)" >/dev/null
sleep 0.5
check "conflicting GNOME shortcut removed" "${original_shortcuts//|<Control><Alt>Left/}" \
  "$(ev "$KB.get_strv('switch-to-workspace-left').join('|')")"
both_sides="$KB.get_strv('switch-to-workspace-left').join('|') + ' / ' + $KB.get_strv('switch-to-workspace-right').join('|')"
overridden_sides=$(ev "$both_sides")
ev "$EXT.stateObj.settings.set_strv('left-half', ['<Control><Alt>h'])" >/dev/null
sleep 0.5
check "changing a shortcut gives back only its GNOME key" "$original_shortcuts / ${overridden_sides#* / }" \
  "$(ev "$both_sides")"
ev "$EXT.stateObj.settings.reset('left-half')" >/dev/null
sleep 0.5
check "resetting it removes that GNOME key again" "$overridden_sides" "$(ev "$both_sides")"

GTK_A11Y=none GSK_RENDERER=cairo GDK_BACKEND=wayland WAYLAND_DISPLAY=wayland-0 gjs -c "
  imports.gi.versions.Gtk = '4.0';
  const {Gtk, GLib} = imports.gi;
  Gtk.init();
  new Gtk.Window({title: 'smoke', default_width: 500, default_height: 400}).present();
  new GLib.MainLoop(null, false).run();
" >"$HOME/client.log" 2>&1 &
client_pid=$!

for _ in $(seq 1 40); do
  if [[ "$(ev "global.get_window_actors().filter(a => a.meta_window.get_title() === 'smoke').length" 2>/dev/null)" == 1 ]]; then break; fi
  sleep 0.25
done
ev "global.get_window_actors().find(a => a.meta_window.get_title() === 'smoke').meta_window.activate(global.get_current_time())" >/dev/null
sleep 0.5

IFS=, read -r wx wy ww wh <<<"$(ev "$WA")"
original=$(ev "$FRAME")
half=$((ww / 2))

run() {
  ev "$EXT.stateObj.run('$1')" >/dev/null
  sleep 0.4
  ev "$FRAME"
}

check "left half" "$wx,$wy,$half,$wh" "$(run left-half)"
check "left half repeated (2/3)" "$wx,$wy,$((ww * 2 / 3)),$wh" "$(run left-half)"
check "right half" "$((wx + ww - half)),$wy,$half,$wh" "$(run right-half)"
check "top left" "$wx,$wy,$half,$((wh / 2))" "$(run top-left)"
check "maximize" "$wx,$wy,$ww,$wh" "$(run maximize-window)"
check "restore" "$original" "$(run restore)"

# Snapping a window that GNOME itself maximized must unmaximize it first (API differs by version).
ev "(() => { const w = global.display.get_focus_window(); typeof w.is_maximized === 'function' ? w.maximize() : w.maximize(3); return 1; })()" >/dev/null
sleep 0.5
check "left half from a maximized window" "$wx,$wy,$half,$wh" "$(run left-half)"
ev "$EXT.stateObj.run('restore')" >/dev/null
sleep 0.4

# A real key press through a virtual keyboard: Ctrl+Alt+Left (evdev codes 29, 56, 105).
ev "globalThis._smokeKbd = imports.gi.Clutter.get_default_backend().get_default_seat().create_virtual_device(imports.gi.Clutter.InputDeviceType.KEYBOARD_DEVICE); 1" >/dev/null
sleep 0.5
press() {
  ev "(() => {
    const C = imports.gi.Clutter, d = globalThis._smokeKbd;
    let t = Number(imports.gi.GLib.get_monotonic_time());
    const keys = [$1];
    for (const k of keys) d.notify_key(t += 1000, k, C.KeyState.PRESSED);
    for (const k of keys.reverse()) d.notify_key(t += 1000, k, C.KeyState.RELEASED);
    return 1;
  })()" >/dev/null
  sleep 0.6
}
# The first synthetic events after creating the device can be dropped while the keymap
# settles, so retry a few times. Any left-anchored, full-height frame means the binding fired.
press 125
ev "Main.overview.hide()" >/dev/null
sleep 0.5
ev "global.get_window_actors().find(a => a.meta_window.get_title() === 'smoke').meta_window.activate(global.get_current_time())" >/dev/null
ev "$EXT.stateObj.run('center')" >/dev/null
key_result=
for _ in 1 2 3 4 5; do
  press 29,56,105
  IFS=, read -r fx fy _ fh <<<"$(ev "$FRAME")"
  if [[ "$fx,$fy,$fh" == "$wx,$wy,$wh" ]]; then key_result=snapped; break; fi
  sleep 0.5
done
check "Ctrl+Alt+Left key press" "snapped" "$key_result"

# Ctrl+Alt+Enter (evdev 28) maximizes to the work area.
ev "$EXT.stateObj.run('center')" >/dev/null
press 29,56,28
check "Ctrl+Alt+Enter key press" "$wx,$wy,$ww,$wh" "$(ev "$FRAME")"
ev "$EXT.stateObj.run('restore')" >/dev/null
sleep 0.4

# Top bar menu: one submenu per group, then a separator and "Customize Shortcuts…".
IND="Main.panel.statusArea['$UUID']"
check "top bar icon shown" "true" "$(ev "!!$IND")"
check "top bar menu items" "8" "$(ev "$IND.menu._getMenuItems().length")"
check "menu shows the shortcut" "Left Half Ctrl+Alt+Left" \
  "$(ev "(() => { const i = $IND.menu._getMenuItems()[0].menu._getMenuItems()[0];
    return i.label.text + ' ' + i.get_children().filter(c => c instanceof imports.gi.St.Label).pop().text.replace('←', 'Left'); })()")"
ev "$EXT.stateObj.run('center')" >/dev/null
ev "(() => { $IND.menu.open(); $IND.menu._getMenuItems()[0].menu._getMenuItems()[0].activate(null); return 1; })()" >/dev/null
sleep 0.4
check "menu item snaps the window" "$wx,$wy,$half,$wh" "$(ev "$FRAME")"
check "menu closes after choosing" "false" "$(ev "$IND.menu.isOpen")"
ev "$EXT.stateObj.run('restore')" >/dev/null
ev "$EXT.stateObj.settings.set_boolean('show-indicator', false)" >/dev/null
check "top bar icon can be hidden" "false" "$(ev "!!$IND")"
ev "$EXT.stateObj.settings.set_boolean('show-indicator', true)" >/dev/null
sleep 0.4

ev "$EXT.stateObj.run('next-display')" >/dev/null
sleep 0.4
check "next display" "1" "$(ev "global.display.get_focus_window().get_monitor()")"
ev "$EXT.stateObj.run('previous-display')" >/dev/null
sleep 0.4
check "previous display" "0" "$(ev "global.display.get_focus_window().get_monitor()")"

# Open the preferences window through the regular Extensions service.
dbus-update-activation-environment WAYLAND_DISPLAY=wayland-0 GDK_BACKEND=wayland GSK_RENDERER=cairo GTK_A11Y=none
gnome-extensions prefs "$UUID" >"$HOME/prefs.log" 2>&1 || true
prefs_window=
for _ in $(seq 1 40); do
  prefs_window=$(ev "global.get_window_actors().map(a => a.meta_window.get_title() ?? '').filter(t => t.includes('Gnometangle')).join('|')" 2>/dev/null || true)
  [[ -n "$prefs_window" ]] && break
  sleep 0.25
done
check "preferences window opens" "Gnometangle" "$prefs_window"

ev "Main.extensionManager.disableExtension('$UUID')" >/dev/null
sleep 1
check "GNOME shortcuts restored on disable" "$original_shortcuts" \
  "$(ev "$KB.get_strv('switch-to-workspace-left').join('|')")"

if grep -q "JS ERROR" "$LOG" && grep -B2 -A8 "JS ERROR" "$LOG" | grep -q "$UUID"; then
  echo "FAIL  JavaScript errors from the extension:"
  grep -A8 "JS ERROR" "$LOG"
  failures=$((failures + 1))
fi

if ((failures > 0)); then
  echo "$failures check(s) failed. Shell log:"
  tail -50 "$LOG"
  exit 1
fi
echo "All smoke checks passed."
