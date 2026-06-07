# Pi Mode

This Pi extension adds prompt modes for model and thinking-level switching.

## Install

```sh
pi install git:github.com/zigai/pi-tweaks
```

## Features

- Adds `/mode` for selecting and configuring prompt modes.
- Adds `Ctrl+Shift+M` to select a mode.
- Adds `Ctrl+Space` to cycle modes.
- Can show the current mode in the prompt editor border when enabled.
- Colors the prompt editor border from the active mode or thinking level.

Modes can store a provider, model, thinking level, and optional color. Project-local modes live in `.pi/modes.json` when present; otherwise global modes live in `~/.pi/agent/modes.json`.

By default, Pi Mode does not print the mode name in the editor border. To opt in, toggle `Show mode name` from `/mode` → `Configure modes…`, or set `"modeShowName": true` in `~/.pi/agent/settings.json`.
