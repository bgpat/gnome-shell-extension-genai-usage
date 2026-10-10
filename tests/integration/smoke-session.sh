#!/bin/sh
set -eu

uuid=${UUID:?}
gsettings set org.gnome.shell disable-user-extensions false
gnome-extensions enable "$uuid"
gnome-shell --headless --virtual-monitor 1280x720 &
shell_pid=$!
i=0
while [ "$i" -lt 30 ]; do
  if busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell.Extensions GetExtensionInfo s "$uuid" > /tmp/genai-usage-extension-info.txt 2>/tmp/genai-usage-extension-error.txt; then
    if grep -q '"state" d 1' /tmp/genai-usage-extension-info.txt && grep -q '"error" s ""' /tmp/genai-usage-extension-info.txt; then
      echo "headless GNOME Shell loaded $uuid"
      kill "$shell_pid"
      wait "$shell_pid" || true
      exit 0
    fi
    if grep -q '"state" d 3' /tmp/genai-usage-extension-info.txt || grep -q '"state" d 4' /tmp/genai-usage-extension-info.txt; then
      echo "extension failed to load"
      cat /tmp/genai-usage-extension-info.txt
      kill "$shell_pid"
      exit 1
    fi
  fi
  i=$((i + 1))
  sleep 1
done
echo "timed out waiting for extension info"
cat /tmp/genai-usage-extension-error.txt || true
kill "$shell_pid" || true
exit 1
