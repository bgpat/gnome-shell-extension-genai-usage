#!/bin/sh
set -eu

uuid=genai-usage@bgpat.github.io
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
export XDG_DATA_HOME=${XDG_DATA_HOME:-$(mktemp -d)}
export XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-$(mktemp -d)}
export XDG_CACHE_HOME=${XDG_CACHE_HOME:-$(mktemp -d)}
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-$(mktemp -d)}
export UUID=$uuid

# Fedora containers and some CI images need a writable X11 socket directory for XWayland.
install -d -m 1777 /tmp/.X11-unix

cd "$root"
bun run pack
mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions"
rm -rf "$XDG_DATA_HOME/gnome-shell/extensions/$uuid"
mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions/$uuid"
unzip -q -o "$root/$uuid.zip" -d "$XDG_DATA_HOME/gnome-shell/extensions/$uuid"
glib-compile-schemas "$XDG_DATA_HOME/gnome-shell/extensions/$uuid/schemas"

dbus-run-session -- "$root/tests/integration/smoke-session.sh"
