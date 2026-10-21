#!/usr/bin/env bash
# Builds the extension and installs it for the current user.
# Log out and back in (Wayland) or press Alt+F2, r (X11), then enable it with:
#   gnome-extensions enable gnometangle@aaronfeingold.github.io
set -euo pipefail

cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
pnpm run pack
gnome-extensions install --force gnometangle@aaronfeingold.github.io.shell-extension.zip
schemas="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/gnometangle@aaronfeingold.github.io/schemas"
if command -v glib-compile-schemas >/dev/null; then glib-compile-schemas "$schemas"; fi
echo "Installed. Log out and back in, then run:"
echo "  gnome-extensions enable gnometangle@aaronfeingold.github.io"
