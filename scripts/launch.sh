#!/bin/bash
# Launch script for TreeLine - detects environment and applies necessary flags
export ELECTRON_DISABLE_SANDBOX=1
export ELECTRON_OZONE_PLATFORM_HINT=auto
export QT_QPA_PLATFORMTHEME=gtk2

# Detect if we're in a Wayland session
if [ -n "$DESKTOP_SESSION" ] || [ -n "$XDG_SESSION_TYPE" ]; then
  # Try running with ozone platform hint
  exec electron-vite "$@" --ozone-platform=auto
else
  # Fallback for headless/CLI environments
  exec electron-vite "$@"
fi
