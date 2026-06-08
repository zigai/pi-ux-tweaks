# Pi Mention Skill

This Pi extension moves skill selection out of the regular slash autocomplete menu and into `$` mentions.

## Install

```sh
pi install git:github.com/zigai/pi-tweaks
```

## Features

- Hides `/skill:*` entries from the interactive slash autocomplete menu.
- Adds `$` autocomplete for loaded skills, with fuzzy matching by skill name and description.
- Expands `$skill-name` mentions anywhere in a prompt into the corresponding skill instructions before the model sees the message.

## Usage

Type `$` in the prompt editor to open skill suggestions, then select a skill.

The selected mention loads the same skill content that `/skill:name` would have loaded, while keeping skills out of the normal slash command picker.
