# Changelog

## 0.2.0 (unreleased)

### Upgrading

- **Opinionated Overrides is now off by default.** Earlier versions removed GNOME shortcuts that use the same keys
  as Gnometangle (Ctrl+Alt+Arrow for workspaces, Ctrl+Alt+Shift+Up for moving a window up a workspace) as soon as the
  extension was enabled. If you never changed this setting, you now get the new default: your GNOME shortcuts are
  restored the first time 0.2.0 starts, and those keys go back to GNOME. To keep the old behavior, turn on
  **Opinionated Overrides** in the preferences. See
  [Opinionated overrides](README.md#opinionated-overrides).

### Changed

- Restoring GNOME shortcuts keeps any of them you changed yourself while the overrides were on.
