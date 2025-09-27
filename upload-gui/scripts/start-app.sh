#!/bin/bash

# CinemaFred Upload GUI Startup Script
# Automatically detects Wayland and sets appropriate environment variables

echo "🎬 Starting CinemaFred Upload GUI..."

# Detect if we're running on Wayland
if [ -n "$WAYLAND_DISPLAY" ] || [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    echo "🔍 Wayland detected - applying compatibility settings"
    
    # Force X11 backend and disable compositing for better compatibility
    export WAYLAND_DISPLAY=""
    export GDK_BACKEND=x11
    export WEBKIT_DISABLE_COMPOSITING_MODE=1
    
    echo "   ✅ Set GDK_BACKEND=x11"
    echo "   ✅ Disabled WebKit compositing"
else
    echo "🔍 X11 detected - using default settings"
fi

# Additional graphics compatibility settings
export WEBKIT_DISABLE_DMABUF_RENDERER=1

echo "🚀 Launching application..."
npm run tauri dev
