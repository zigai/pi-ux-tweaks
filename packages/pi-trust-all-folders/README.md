# Pi Trust All Folders

[![npm version](https://img.shields.io/npm/v/@zigai/pi-trust-all-folders.svg?color=blue)](https://www.npmjs.com/package/@zigai/pi-trust-all-folders)
[![npm downloads](https://img.shields.io/npm/dm/@zigai/pi-trust-all-folders.svg)](https://www.npmjs.com/package/@zigai/pi-trust-all-folders)
[![license](https://img.shields.io/npm/l/@zigai/pi-trust-all-folders.svg)](../../LICENSE)

This Pi extension automatically approves project trust prompts for project-local inputs.

## Install

```sh
pi install npm:@zigai/pi-trust-all-folders
```

Or install the full tweak bundle:

```sh
pi install git:github.com/zigai/pi-tweaks
```

## Behavior

When Pi asks whether to trust a project folder, this extension answers yes for the current Pi process. This allows Pi to load project-local instructions, settings, resources, packages, and extensions without showing the built-in trust prompt.

Use this only for machines and project folders you trust.

## License

MIT
