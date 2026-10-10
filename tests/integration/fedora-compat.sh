#!/bin/sh
# Packaging and GJS checks that run in Fedora containers (no systemd / headless Shell).
set -eu

uuid=genai-usage@bgpat.github.io
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)

cd "$root"
bun run pack
bun test

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
unzip -q -o "$root/$uuid.zip" -d "$tmpdir/ext"
glib-compile-schemas --strict "$tmpdir/ext/schemas"
gjs -m tests/gjs/subprocess.js

echo "Fedora compatibility checks passed"
