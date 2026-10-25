#!/bin/sh
# Maple Route in Steam Deck Gaming Mode: installs a USER service (no root, no system changes) that
# starts Maple Route with each Gaming Mode session. It stays idle, showing a QR code in a small
# pop-up (bottom-right), until you press "Start reading" on your phone. Remove with --remove.
set -eu
unit="$HOME/.config/systemd/user/maple-route-deck.service"
app="$HOME/Applications/Maple-Route.AppImage"
if [ "${1:-}" = "--remove" ]; then
  systemctl --user disable --now maple-route-deck.service 2>/dev/null || true
  rm -f "$unit"; systemctl --user daemon-reload
  echo "Maple Route Gaming Mode service removed."; exit 0
fi
src="${1:-}"
[ -z "$src" ] && src=$(ls -t "$HOME"/Applications/Maple-Route-*.AppImage "$HOME"/Downloads/Maple-Route-*.AppImage 2>/dev/null | head -1 || true)
[ -n "$src" ] && [ -f "$src" ] || { echo "Put Maple-Route-<version>-linux-x86_64.AppImage in ~/Applications or ~/Downloads first (or pass its path)."; exit 1; }
mkdir -p "$HOME/Applications" "$(dirname "$unit")"
[ "$src" = "$app" ] || cp -f "$src" "$app"
chmod +x "$app"
cat > "$unit" <<UNIT
[Unit]
Description=Maple Route (Steam Deck Gaming Mode)
After=gamescope-session.target
PartOf=gamescope-session.target

[Service]
Environment=DISPLAY=:0
ExecStart=$app --deck-service --lan
Restart=on-failure
RestartSec=5

[Install]
WantedBy=gamescope-session.target
UNIT
systemctl --user daemon-reload
systemctl --user enable maple-route-deck.service
echo "Installed. In Gaming Mode a small Maple Route pop-up (bottom-right) shows a QR code: scan it with your phone, then press Start reading."
echo "Start it now (only while in Gaming Mode): systemctl --user start maple-route-deck.service"
