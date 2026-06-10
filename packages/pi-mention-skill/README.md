# Pi Mention Skill

This Pi extension moves skill selection out of the regular slash autocomplete menu and into configurable mentions that default to `$`.

## Install

```sh
pi install git:github.com/zigai/pi-tweaks
```

## Features

- Hides `/skill:*` entries from the interactive slash autocomplete menu by default.
- Adds mention autocomplete for loaded skills, with fuzzy matching by skill name and description.
- Uses Pi's native autocomplete trigger-character support when available, so typing the configured mention character opens skill suggestions naturally.
- Expands mentions such as `$skill-name` anywhere in a prompt into the corresponding skill instructions before the model sees the message.

## Usage

Type `$` in the prompt editor to open skill suggestions, then select a skill.

The selected mention loads the same skill content that `/skill:name` would have loaded, while keeping skills out of the normal slash command picker.

## Configuration

Configuration lives in Pi's main settings file at `~/.pi/agent/settings.json`.

The mention character defaults to `$`. To change it, set `mentionSkillTrigger` to a single non-whitespace character:

```json
{
  "mentionSkillTrigger": "#"
}
```

Skills are hidden from Pi's default slash autocomplete menu by default. To keep `/skill:*` entries visible, set `mentionSkillHideSlashSkills` to `false`:

```json
{
  "mentionSkillHideSlashSkills": false
}
```
