# Pi Submit Mode

Deprecated compatibility package. Use [`@zigai/pi-keymap-tweaks`](../pi-keymap-tweaks) for new installs.

This package still applies the original submit behavior:

- `Enter` queues a follow-up while a run is busy.
- `Alt+Enter` steers the current run while a run is busy.
- SSH/TMUX `LF` Enter input is normalized to submit correctly.

## Install

```sh
pi install npm:@zigai/pi-keymap-tweaks
```
