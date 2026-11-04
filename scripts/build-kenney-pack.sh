#!/usr/bin/env bash
# Merge the Kenney buildings the map places into public/models/kenney-pack.glb:
# one request instead of one per building, one shared texture (copied as-is, not re-encoded),
# meshopt-compressed geometry. Add a name here when a new building is placed on the map.
set -euo pipefail
NAMES="building-a building-b building-c building-d building-e building-f building-g building-h building-i building-j building-k building-l building-m building-n building-skyscraper-a building-skyscraper-c building-skyscraper-d"
TMP=$(mktemp -d)
X="npx -y @gltf-transform/cli@4"
$X merge $(for n in $NAMES; do printf "public/models/kenney/%s.glb " "$n"; done) "$TMP/merged.glb" --merge-scenes
$X dedup "$TMP/merged.glb" "$TMP/dedup.glb"
$X prune "$TMP/dedup.glb" "$TMP/pruned.glb"
$X meshopt "$TMP/pruned.glb" public/models/kenney-pack.glb
rm -rf "$TMP"
