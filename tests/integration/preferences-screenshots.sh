#!/bin/sh
set -eu

mkdir -p "${1:?Usage: preferences-screenshots.sh OUTPUT_DIRECTORY}"
output=$(CDPATH= cd -- "$1" && pwd)
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
cleanup() {
    # The document portal may still hold its FUSE mount after D-Bus exits.
    if command -v fusermount3 >/dev/null 2>&1; then
        fusermount3 -uz "$work/runtime/doc" 2>/dev/null || true
    fi
    rm -rf "$work"
}
trap cleanup EXIT

cd "$root"
bun run pack
unzip -q genai-usage@bgpat.github.io.zip -d "$work/extension"
glib-compile-schemas --strict "$work/extension/schemas"

export HOME="$work"
export XDG_DATA_HOME="$work/data"
export XDG_CONFIG_HOME="$work/config"
export XDG_CACHE_HOME="$work/cache"
export XDG_RUNTIME_DIR="$work/runtime"
mkdir -m 700 "$XDG_RUNTIME_DIR"
export GSETTINGS_BACKEND=memory
export GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0
export GDK_BACKEND=x11
export GSK_RENDERER=cairo

capture() {
    timeout 45s xvfb-run -a -s '-screen 0 1280x800x24' dbus-run-session -- \
        gjs -m scripts/prefs-dev-entry.js "$work/extension" "$output" "$@"
}

capture
capture narrow
