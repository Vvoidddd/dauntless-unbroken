#!/bin/sh
set -eu

PIN_EXE=d3d41e614908d2befd518b27046d9822d6130ef12ba3504babbdb786bef9cff4
PIN_DXGI=f792ee4c94320411d0bc73c5ce32b611f72c5de6102831fcd336a9f28c86ff5c
PIN_SERVER=106d50f6baa3bfb4b1283440ef486547b1f30bb4f54f8309ef436f455db286a7

usage() {
  echo "usage: $0 --game-dir <folder containing Archon> [--repo <dauntless-unbroken checkout>]" >&2
  exit 2
}

game=
repo=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
while [ "$#" -gt 0 ]; do
  case "$1" in
    --game-dir) [ "$#" -ge 2 ] || usage; game=$2; shift 2 ;;
    --repo) [ "$#" -ge 2 ] || usage; repo=$2; shift 2 ;;
    *) usage ;;
  esac
done
[ -n "$game" ] || usage

win64="$game/Archon/Binaries/Win64"
exe="$win64/Dauntless-Win64-Shipping.exe"
[ -f "$exe" ] || { echo "game executable not found: $exe" >&2; exit 1; }

hash_file() {
  sha256sum "$1" | awk '{print $1}'
}

[ "$(hash_file "$exe")" = "$PIN_EXE" ] || {
  echo "refusing game build: Dauntless-Win64-Shipping.exe is not pinned 1.4.4" >&2
  exit 1
}

for spec in "dxgi.dll:$PIN_DXGI" "DauntlessUnbroken.dll:$PIN_SERVER"; do
  file=${spec%%:*}
  expected=${spec#*:}
  source="$repo/DauntlessUnbrokenLauncher/assets/$file"
  target="$win64/$file"
  [ -f "$source" ] || { echo "missing pinned asset: $source" >&2; exit 1; }
  [ "$(hash_file "$source")" = "$expected" ] || { echo "repo asset failed pin: $file" >&2; exit 1; }
  if [ ! -f "$target" ] || [ "$(hash_file "$target")" != "$expected" ]; then
    tmp="$target.dr-new"
    cp "$source" "$tmp"
    [ "$(hash_file "$tmp")" = "$expected" ] || { rm -f "$tmp"; echo "copy failed hash check: $file" >&2; exit 1; }
    mv "$tmp" "$target"
  fi
done

echo "game ready for Wine server launch: $game"
