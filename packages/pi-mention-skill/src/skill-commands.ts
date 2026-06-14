import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { SkillCommand } from "./types.ts";

const SKILL_COMMAND_PREFIX = "skill:";

export function stripFrontmatter(content: string): string {
    if (!content.startsWith("---")) return content;

    const end = content.indexOf("\n---", 3);
    if (end === -1) return content;

    const afterMarker = end + "\n---".length;
    if (content[afterMarker] === "\r" && content[afterMarker + 1] === "\n") {
        return content.slice(afterMarker + 2);
    }
    if (content[afterMarker] === "\n") {
        return content.slice(afterMarker + 1);
    }
    return content.slice(afterMarker);
}

export function getSkillCommands(pi: ExtensionAPI): SkillCommand[] {
    return pi.getCommands().filter((command): command is SkillCommand => {
        return command.source === "skill" && command.name.startsWith(SKILL_COMMAND_PREFIX);
    });
}

export function skillName(command: SkillCommand): string {
    return command.name.slice(SKILL_COMMAND_PREFIX.length);
}
