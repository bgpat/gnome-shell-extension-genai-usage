#!/bin/sh
set -eu

mkdir -p "${1:?Usage: preferences-screenshots.sh OUTPUT_DIRECTORY}"
output=$(CDPATH= cd -- "$1" && pwd)
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

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

timeout 45s xvfb-run -a -s '-screen 0 1280x800x24' dbus-run-session -- \
    gjs -m scripts/prefs-dev-entry.js "$work/extension" "$output"
