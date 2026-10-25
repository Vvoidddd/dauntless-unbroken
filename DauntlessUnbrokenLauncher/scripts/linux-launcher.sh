#!/bin/sh
set -eu
# Steam's overlay crashes Electron's zygote on some Deck runtimes. Keep its
# original preload for the game; filter only the launcher before Electron loads.
if [ "${DR_GAME_LD_PRELOAD+x}" != x ]; then
    DR_GAME_LD_PRELOAD=${LD_PRELOAD-}
    export DR_GAME_LD_PRELOAD
fi
preload=
old_ifs=$IFS
IFS=' :	
'
set -f
for library in ${LD_PRELOAD-}; do
    case "$library" in
        gameoverlayrenderer.so|*/gameoverlayrenderer.so) ;;
        *) preload=${preload:+$preload:}$library ;;
    esac
done
IFS=$old_ifs
if [ -n "$preload" ]; then
    export LD_PRELOAD=$preload
else
    unset LD_PRELOAD
fi
exec "$(dirname "$(readlink -f -- "$0")")/DauntlessUnbrokenLauncher.bin" "$@"
