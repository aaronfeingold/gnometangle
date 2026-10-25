# Changelog

## 0.2.0 (2026-10-24)

### Upgrading

- **Opinionated Overrides is now off by default.** Earlier versions removed GNOME shortcuts that use the same keys
  as Gnometangle (Ctrl+Alt+Arrow for workspaces, Ctrl+Alt+Shift+Up for moving a window up a workspace) as soon as the
  extension was enabled. If you never changed this setting, you now get the new default: your GNOME shortcuts are
  restored the first time 0.2.0 starts, and those keys go back to GNOME. To keep the old behavior, turn on
  **Opinionated Overrides** in the preferences. See
  [Opinionated overrides](README.md#opinionated-overrides).

### Added

- **Workspaces:** send a window to workspace 1–9 (unset by default) or to the previous / next workspace
  (Ctrl+Alt+Shift+Left / Right). It keeps its layout, you follow it unless you turn that off, and a workspace that
  doesn't exist yet is created. (#11)
- **Displays:** send a window to the display on the left / right, above / below, or to display 1–3; focus the next or
  previous display without moving anything; and **Identify Displays** shows each display's number. (#12)
- **Warnings for shortcuts that won't work:** a warning icon with the reason in the preferences and the top bar menu
  when another GNOME or custom shortcut uses the same keys, or GNOME refused the shortcut. Click it in the preferences
  to pick other keys. (#13)
- **More actions:** move left / right / up / down without resizing, and smaller / larger width and height. (#14)
- **Ignored apps:** while one of them has focus, Gnometangle's shortcuts are turned off so the app gets those keys.
  (#14)
- Translations: every string can now be translated; see CONTRIBUTING. (#23)

### Changed

- First to last fourth now default to Ctrl+Alt+1 to 4. (#14)
- Restoring GNOME shortcuts keeps any of them you changed yourself while the overrides were on. (#17)
- Changing a shortcut only touches the GNOME shortcuts that actually change, instead of restoring and removing all
  of them. (#22)
- Internal cleanup for the extensions.gnome.org review: the action table describes each action's behavior, and
  extension.ts is split into smaller modules. (#18, #19, #20, #21)

### Fixed

- Moving a snapped window between displays with different scales keeps its layout exactly. Before, it could be cut
  to the old display's size. (#27)
- Disabling the extension no longer removes another keybinding that has the same name as a refused one. (#25)
