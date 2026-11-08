#!/usr/bin/env bash
# Host firewall for the headless renderer (docker-compose service "render", subnet 172.30.99.0/24).
# Chromium runs untrusted pages; this stops it from OPENING connections to private, loopback, CGNAT and link-local
# (cloud metadata, 169.254.169.254) ranges. Replies to `web` (which opened the connection) still flow. Safe to re-run.
#   sudo bash scripts/deploy/render-firewall.sh
set -euo pipefail
SUBNET=172.30.99.0/24
for dst in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10 127.0.0.0/8; do
  iptables -C DOCKER-USER -s "$SUBNET" -d "$dst" -m conntrack --ctstate NEW -j DROP 2>/dev/null \
    || iptables -I DOCKER-USER -s "$SUBNET" -d "$dst" -m conntrack --ctstate NEW -j DROP
done
echo "render firewall rules:"
iptables -S DOCKER-USER | grep "$SUBNET" || true
