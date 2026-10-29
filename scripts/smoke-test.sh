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
client2_pid=

cleanup() {
  [[ -n "$client_pid" ]] && kill "$client_pid" 2>/dev/null || true
  [[ -n "$client2_pid" ]] && kill "$client2_pid" 2>/dev/null || true
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

# The scheduled newest-GNOME check runs releases that metadata.json does not list yet. Without this
# GNOME would refuse to load the extension as out of date before any real check runs.
if [[ -n "${SMOKE_IGNORE_SHELL_VERSION:-}" ]]; then
  gsettings set org.gnome.shell disable-extension-version-validation true
fi

# Logical layout, so monitors with different scales have different logical sizes (checked below).
# GNOME 51 made that the default and dropped the setting.
if gsettings list-keys org.gnome.mutter | grep -qx experimental-features; then
  gsettings set org.gnome.mutter experimental-features "['scale-monitor-framebuffer']"
fi
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
SMOKE_FRAME_EXPR="(() => { const w = global.get_window_actors().find(a => a.meta_window.get_title() === 'smoke').meta_window; const r = w.get_frame_rect(); return [r.x, r.y, r.width, r.height].join(','); })()"
KB="new imports.gi.Gio.Settings({schema_id: 'org.gnome.desktop.wm.keybindings'})"

original_shortcuts=$(ev "$KB.get_strv('switch-to-workspace-left').join('|')")
ev "Main.extensionManager.enableExtension('$UUID')" >/dev/null
sleep 1
check "extension enabled" "1 " "$(ev "$EXT.state + ' ' + ($EXT.error || '')")"
# Mutter silently refuses a keybinding whose name is already taken; only accepted ones are allowed.
check "every shortcut registered" "" "$(ev "(() => {
  const s = $EXT.stateObj.settings;
  return s.settings_schema.list_keys()
    .filter(k => s.get_value(k).get_type_string() === 'as' && !['ignored-apps', 'unregistered-shortcuts'].includes(k) && !(k in Main.wm._allowedKeybindings))
    .join(',');
})()")"
check "GNOME shortcuts untouched by default" "$original_shortcuts" \
  "$(ev "$KB.get_strv('switch-to-workspace-left').join('|')")"
# With the overrides off, Ctrl+Alt+Left is also GNOME's: the menu warns on Left Half and on its group.
IND="Main.panel.statusArea['$UUID']"
MENU_WARNING="(() => {
  const halves = $IND.menu._getMenuItems()[0];
  $IND.menu.open(false);
  const item = halves.menu._getMenuItems()[0].get_children().find(c => c.has_style_class_name?.('gnometangle-warning'));
  const result = [halves.icon.visible, item.visible].join(',');
  $IND.menu.close(false);
  return result;
})()"
check "menu warns about a shortcut GNOME also uses" "true,true" "$(ev "$MENU_WARNING")"
# The rest of the run presses the default keys, so turn on the overrides that free them.
ev "$EXT.stateObj.settings.set_boolean('override-conflicts', true)" >/dev/null
sleep 0.5
check "conflicting GNOME shortcut removed" "${original_shortcuts//|<Control><Alt>Left/}" \
  "$(ev "$KB.get_strv('switch-to-workspace-left').join('|')")"
check "no warning once the override frees the keys" "false,false" "$(ev "$MENU_WARNING")"
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
IFS=, read -r _ oy ow oh <<<"$original"
check "move left keeps the size" "$wx,$oy,$ow,$oh" "$(run move-left)"
ev "$EXT.stateObj.run('restore')" >/dev/null
sleep 0.4

# Snapping a window that GNOME itself maximized must unmaximize it first (API differs by version).
ev "(() => { const w = global.display.get_focus_window(); typeof w.is_maximized === 'function' ? w.maximize() : w.maximize(3); return 1; })()" >/dev/null
sleep 0.5
check "left half from a maximized window" "$wx,$wy,$half,$wh" "$(run left-half)"
ev "$EXT.stateObj.run('restore')" >/dev/null
sleep 0.4

# A real key press through a virtual keyboard: Ctrl+Alt+Left (evdev codes 29, 56, 105).
ev "globalThis._smokeKbd = (global.stage.context?.get_backend() ?? imports.gi.Clutter.get_default_backend()).get_default_seat().create_virtual_device(imports.gi.Clutter.InputDeviceType.KEYBOARD_DEVICE); 1" >/dev/null
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

# An ignored app gets the keys: our shortcuts are unregistered while it has focus. Removing a
# keybinding leaves it in _allowedKeybindings with ActionMode.NONE (0).
LEFT_ALLOWED="(Main.wm._allowedKeybindings['left-half'] ?? 0) !== 0"
smoke_app=$(ev "imports.gi.Shell.WindowTracker.get_default().get_window_app(global.display.get_focus_window()).get_id()")
ev "$EXT.stateObj.settings.set_strv('ignored-apps', ['$smoke_app'])" >/dev/null
sleep 0.5
check "ignored app unregisters the shortcuts" "false" "$(ev "$LEFT_ALLOWED")"
ev "$EXT.stateObj.run('center')" >/dev/null
sleep 0.4
centered=$(ev "$FRAME")
press 29,56,105
check "ignored app keeps Ctrl+Alt+Left" "$centered" "$(ev "$FRAME")"
ev "$EXT.stateObj.settings.set_strv('ignored-apps', [])" >/dev/null
sleep 0.5
check "shortcuts return when no longer ignored" "true" "$(ev "$LEFT_ALLOWED")"
ev "$EXT.stateObj.run('restore')" >/dev/null
sleep 0.4

# Top bar menu: one submenu per group (8), then a separator and "Customize Shortcuts…".
check "top bar icon shown" "true" "$(ev "!!$IND")"
check "top bar menu items" "10" "$(ev "$IND.menu._getMenuItems().length")"
check "menu shows the shortcut" "Left Half Ctrl+Alt+Left" \
  "$(ev "(() => { const i = $IND.menu._getMenuItems()[0].menu._getMenuItems()[0];
    return i.label.text + ' ' + i.get_children().find(c => c.has_style_class_name?.('gnometangle-shortcut')).text.replace('←', 'Left'); })()")"
ev "$EXT.stateObj.run('center')" >/dev/null
ev "(() => { $IND.menu.open(); $IND.menu._getMenuItems()[0].menu._getMenuItems()[0].activate(null); return 1; })()" >/dev/null
sleep 0.4
check "menu shows keys in the keys font" "JetBrainsMono Nerd Font,JetBrains Mono,monospace" \
  "$(ev "$IND.menu._getMenuItems()[0].menu._getMenuItems()[0].get_children().find(c => c.has_style_class_name?.('gnometangle-shortcut')).get_theme_node().get_font().get_family()")"
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

# Directions follow the physical layout (monitor 1 is to the right), and displays are numbered left to right.
ON_MONITOR="global.display.get_focus_window().get_monitor()"
move_to() {
  ev "$EXT.stateObj.run('$1')" >/dev/null
  sleep 0.5
  ev "$ON_MONITOR"
}
check "display on the right" "1" "$(move_to display-right)"
check "nothing above stays put" "1" "$(move_to display-above)"
check "display on the left" "0" "$(move_to display-left)"
check "display 2" "1" "$(move_to send-to-display-2)"
check "display 1" "0" "$(move_to send-to-display-1)"

ev "$EXT.stateObj.run('identify-displays')" >/dev/null
IDENTIFY="Main.layoutManager.uiGroup.get_children().filter(c => c.has_style_class_name?.('gnometangle-identify')).map(l => l.text).join(',')"
check "identify shows each display's number" "1,2" "$(ev "$IDENTIFY")"
# Shown for 2 seconds; GLib may run a seconds timeout up to a second late, so allow for that.
for _ in $(seq 1 20); do
  [[ -z "$(ev "$IDENTIFY")" ]] && break
  sleep 0.25
done
check "identify goes away" "" "$(ev "$IDENTIFY")"

# Focus another display: a second window on monitor 1 gets focus, and nothing moves.
GTK_A11Y=none GSK_RENDERER=cairo GDK_BACKEND=wayland WAYLAND_DISPLAY=wayland-0 gjs -c "
  imports.gi.versions.Gtk = '4.0';
  const {Gtk, GLib} = imports.gi;
  Gtk.init();
  new Gtk.Window({title: 'smoke2', default_width: 300, default_height: 200}).present();
  new GLib.MainLoop(null, false).run();
" >"$HOME/client2.log" 2>&1 &
client2_pid=$!
SMOKE2="global.get_window_actors().find(a => a.meta_window.get_title() === 'smoke2')?.meta_window"
for _ in $(seq 1 40); do
  [[ "$(ev "!!$SMOKE2" 2>/dev/null)" == true ]] && break
  sleep 0.25
done
ev "$EXT.stateObj.run('send-to-display-2', $SMOKE2)" >/dev/null
sleep 0.5
SMOKE="global.get_window_actors().find(a => a.meta_window.get_title() === 'smoke').meta_window"
ev "$SMOKE.activate(global.get_current_time())" >/dev/null
sleep 0.3
ev "$EXT.stateObj.run('focus-next-display')" >/dev/null
sleep 0.3
check "focus next display" "smoke2 1 0" \
  "$(ev "[global.display.get_focus_window().get_title(), $SMOKE2.get_monitor(), $SMOKE.get_monitor()].join(' ')")"
kill "$client2_pid" 2>/dev/null || true
ev "$SMOKE.activate(global.get_current_time())" >/dev/null
sleep 0.5

# Mixed scale: monitor 0 at 2x (logical 960x540) next to monitor 1 at 1x. A snapped window keeps
# its layout exactly both ways, which needs it on the target monitor before it is resized.
DC=(gdbus call --session --dest org.gnome.Mutter.DisplayConfig --object-path /org/gnome/Mutter/DisplayConfig --method org.gnome.Mutter.DisplayConfig)
apply_monitors() {
  local serial
  serial=$("${DC[@]}.GetCurrentState" | sed -E 's/^\(uint32 ([0-9]+),.*/\1/')
  "${DC[@]}.ApplyMonitorsConfig" "$serial" 1 "$1" "@a{sv} {}" >/dev/null
  sleep 1.5
}
apply_monitors "[(0, 0, 2.0, uint32 0, true, [('Meta-0', '1920x1080@60.000', @a{sv} {})]), (960, 0, 1.0, uint32 0, false, [('Meta-1', '1280x1024@60.000', @a{sv} {})])]"
check "mixed scale monitors" "960x540@2 1280x1024@1" "$(ev "[0, 1].map(i => { const g = global.display.get_monitor_geometry(i); return g.width + 'x' + g.height + '@' + global.display.get_monitor_scale(i); }).join(' ')")"
LEFT_HALF_OF="(() => { const a = $SMOKE.get_work_area_for_monitor(MON); return [a.x, a.y, Math.round(a.width / 2), a.height].join(','); })()"
# Shrinking monitor 0 can leave the window on either monitor (it differs between GNOME releases), so
# check relative to where it is: snapped there, kept exactly on the other display, and back again.
ev "$SMOKE.activate(global.get_current_time())" >/dev/null
here=$(ev "$SMOKE.get_monitor()")
there=$((1 - here))
ev "$EXT.stateObj.run('left-half', $SMOKE)" >/dev/null
sleep 0.5
check "left half on display $here" "$(ev "${LEFT_HALF_OF/MON/$here}")" "$(ev "$SMOKE_FRAME_EXPR")"
ev "$EXT.stateObj.run('next-display', $SMOKE)" >/dev/null
sleep 1
check "left half kept on display $there" "$(ev "${LEFT_HALF_OF/MON/$there}")" "$(ev "$SMOKE_FRAME_EXPR")"
ev "$EXT.stateObj.run('previous-display', $SMOKE)" >/dev/null
sleep 1
check "left half kept back on display $here" "$(ev "${LEFT_HALF_OF/MON/$here}")" "$(ev "$SMOKE_FRAME_EXPR")"
apply_monitors "[(0, 0, 1.0, uint32 0, true, [('Meta-0', '1920x1080@60.000', @a{sv} {})]), (1920, 0, 1.0, uint32 0, false, [('Meta-1', '1280x1024@60.000', @a{sv} {})])]"
ev "$EXT.stateObj.run('restore', $SMOKE)" >/dev/null
sleep 0.4

# Rotation turns the window's display and keeps the other one next to it. Snapped to the left half
# first, the window stays inside its display when that gets narrower.
ev "$EXT.stateObj.run('left-half', $SMOKE)" >/dev/null
sleep 0.4
LAYOUT="[0, 1].map(i => global.display.get_monitor_geometry(i)).sort((a, b) => a.x - b.x).map(g => [g.x, g.y, g.width, g.height].join(',')).join(' ')"
ROTATED_CONNECTOR="['Meta-0', 'Meta-1'].find(c => global.backend.get_monitor_manager().get_monitor_for_connector(c) === $SMOKE.get_monitor())"
landscape=$(ev "$LAYOUT")
rotated=$(ev "$ROTATED_CONNECTOR")
if [[ "$rotated" == Meta-0 ]]; then portrait="0,0,1080,1920 1080,0,1280,1024"; else portrait="0,0,1920,1080 1920,0,1024,1280"; fi
ev "$EXT.stateObj.run('rotate-display-right', $SMOKE)" >/dev/null
sleep 1.5
check "rotate display right" "$portrait" "$(ev "$LAYOUT")"
rotated_index=$(ev "global.backend.get_monitor_manager().get_monitor_for_connector('$rotated')")
check "snapped window stays snapped on the rotated display" "$rotated_index $(ev "${LEFT_HALF_OF/MON/$rotated_index}")" \
  "$(ev "$SMOKE.get_monitor()") $(ev "$SMOKE_FRAME_EXPR")"
ev "$EXT.stateObj.run('rotate-display-left', $SMOKE)" >/dev/null
sleep 1.5
check "rotate display left" "$portrait" "$(ev "$LAYOUT")"
ev "$EXT.stateObj.run('reset-display-rotation', $SMOKE)" >/dev/null
sleep 1.5
check "reset display rotation" "$landscape" "$(ev "$LAYOUT")"
ev "$EXT.stateObj.run('restore', $SMOKE)" >/dev/null
sleep 0.4

# Workspaces: numbered targets are created when missing, the frame stays, and Follow is a setting.
SMOKE="global.get_window_actors().find(a => a.meta_window.get_title() === 'smoke').meta_window"
WS="[$SMOKE.get_workspace().index(), global.workspace_manager.get_active_workspace_index()].join(',')"
SMOKE_FRAME="(() => { const r = $SMOKE.get_frame_rect(); return [r.x, r.y, r.width, r.height].join(','); })()"
ev "$SMOKE.activate(global.get_current_time())" >/dev/null
ev "$EXT.stateObj.run('left-half')" >/dev/null
sleep 0.4
snapped_frame=$(ev "$SMOKE_FRAME")
ev "$EXT.stateObj.run('send-to-workspace-3', $SMOKE)" >/dev/null
sleep 0.6
check "send to workspace 3 follows the window" "2,2" "$(ev "$WS")"
check "window keeps its layout on another workspace" "$snapped_frame" "$(ev "$SMOKE_FRAME")"
ev "$EXT.stateObj.run('send-to-previous-workspace', $SMOKE)" >/dev/null
sleep 0.6
check "previous workspace" "1,1" "$(ev "$WS")"
ev "$EXT.stateObj.settings.set_boolean('workspace-follow', false)" >/dev/null
ev "$EXT.stateObj.run('send-to-next-workspace', $SMOKE)" >/dev/null
sleep 0.6
check "next workspace without following" "2,1" "$(ev "$WS")"
ev "$EXT.stateObj.settings.reset('workspace-follow')" >/dev/null
ev "$EXT.stateObj.run('send-to-workspace-1', $SMOKE)" >/dev/null
sleep 0.6
check "send to workspace 1" "0,0" "$(ev "$WS")"
COUNT="global.workspace_manager.get_n_workspaces()"
ev "$EXT.stateObj.run('send-to-workspace-6', $SMOKE)" >/dev/null
sleep 0.6
check "missing workspaces are created" "5,5 6" "$(ev "$WS") $(ev "$COUNT")"
ev "$EXT.stateObj.run('send-to-workspace-1', $SMOKE)" >/dev/null
# With dynamic workspaces GNOME then drops the empty ones in between: the window still gets a new one.
MUTTER="new imports.gi.Gio.Settings({schema_id: 'org.gnome.mutter'})"
ev "$MUTTER.set_boolean('dynamic-workspaces', true)" >/dev/null
sleep 1
ev "globalThis._smokeWorkspace = $SMOKE.get_workspace(); 1" >/dev/null
ev "$EXT.stateObj.run('send-to-workspace-6', $SMOKE)" >/dev/null
sleep 1
check "dynamic workspaces: window moves to a new workspace" "true" \
  "$(ev "$SMOKE.get_workspace() !== globalThis._smokeWorkspace && $SMOKE.get_workspace().active")"
ev "$EXT.stateObj.run('send-to-workspace-1', $SMOKE)" >/dev/null
ev "$MUTTER.reset('dynamic-workspaces')" >/dev/null
sleep 1
ev "$SMOKE.activate(global.get_current_time())" >/dev/null
ev "$EXT.stateObj.run('restore')" >/dev/null
sleep 0.4

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

# Mutter refuses a keybinding whose name is taken: take 'center' first, then enable again.
ev "Main.wm.addKeybinding('center', $EXT.stateObj.getSettings(), imports.gi.Meta.KeyBindingFlags.NONE, imports.gi.Shell.ActionMode.NORMAL, () => {})" >/dev/null
ev "Main.extensionManager.enableExtension('$UUID')" >/dev/null
sleep 1
check "refused keybinding is reported" "center" "$(ev "$EXT.stateObj.settings.get_strv('unregistered-shortcuts').join(',')")"
check "refused keybinding is logged" "yes" "$(grep -q 'refused the keybindings for center' "$LOG" && echo yes || echo no)"
ev "Main.extensionManager.disableExtension('$UUID')" >/dev/null
check "disable leaves the other 'center' binding alone" "true" "$(ev "(Main.wm._allowedKeybindings['center'] ?? 0) !== 0")"
ev "Main.wm.removeKeybinding('center')" >/dev/null

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
