#!/usr/bin/env bash
# Installs GNOME Shell inside a distro container and runs the smoke test there.
# Usage (from the repo root, after `pnpm run pack`):
#   docker run --rm -v "$PWD:/src:ro" -w /src fedora:43 scripts/smoke-container.sh
set -euo pipefail

if command -v dnf >/dev/null; then
  dnf install -y -q --setopt=install_weak_deps=False \
    gnome-shell gjs gtk4 dconf dbus-daemon glib2 unzip procps-ng >/dev/null
elif command -v apt-get >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends \
    gnome-shell gjs gir1.2-gtk-4.0 dconf-gsettings-backend dconf-service dbus dbus-x11 \
    libglib2.0-bin unzip procps >/dev/null
else
  echo "Unsupported distro" >&2
  exit 1
fi

# No logind in a container: hide systemd's seat directory so the shell uses its fallback.
rm -rf /run/systemd/seats
mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix
mkdir -p /run/dbus && (dbus-daemon --system --fork 2>/dev/null || true)
exec scripts/smoke-test.sh "$(ls ./*.shell-extension.zip | head -1)"
