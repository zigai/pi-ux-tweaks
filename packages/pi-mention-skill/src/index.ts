import {
    CustomEditor,
    getAgentDir,
    type ExtensionAPI,
    type ExtensionContext,
    type SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import {
    type AutocompleteItem,
    type AutocompleteProvider,
    type AutocompleteSuggestions,
    fuzzyFilter,
} from "@earendil-works/pi-tui";
import { existsSync, readFileSync, statSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const MAX_SUGGESTIONS = 20;
const DEFAULT_MENTION_TRIGGER = "$";
const TRIGGER_SETTINGS_KEY = "mentionSkillTrigger";
const HIDE_SLASH_SKILLS_SETTINGS_KEY = "mentionSkillHideSlashSkills";
const SKILL_COMMAND_PREFIX = "skill:";
const MENTION_FACTORY_BASE = Symbol.for("zigai.pi-mention-skill.editor-factory-base");

type SkillCommand = SlashCommandInfo & {
    name: `skill:${string}`;
    description: string;
};

type EditorFactory = NonNullable<ReturnType<ExtensionContext["ui"]["getEditorComponent"]>>;

type EditorLike = {
    getText(): string;
    handleInput(data: string): void;
    render(width: number): string[];
    isShowingAutocomplete?(): boolean;
    tryTriggerAutocomplete?(explicitTab?: boolean): void;
};

type WrappedEditorFactory = EditorFactory & {
    [MENTION_FACTORY_BASE]?: EditorFactory | undefined;
};

type SkillExpansion = {
    name: string;
    location: string;
    body: string;
    baseDir: string;
};

type MentionSkillSettings = {
    trigger: string;
    hideSlashSkills: boolean;
};

type SettingsCache = MentionSkillSettings & {
    mtimeMs: number | undefined;
};

let settingsCache: SettingsCache | undefined;

function agentSettingsPath(): string {
    return path.join(getAgentDir(), "settings.json");
}

function isValidMentionTrigger(value: unknown): value is string {
    return typeof value === "string" && value.length === 1 && value !== "/" && !/\s/.test(value);
}

function configuredMentionSkillSettings(): MentionSkillSettings {
    const defaults: MentionSkillSettings = {
        trigger: DEFAULT_MENTION_TRIGGER,
        hideSlashSkills: true,
    };

    const settingsPath = agentSettingsPath();
    if (!existsSync(settingsPath)) {
        settingsCache = { mtimeMs: undefined, ...defaults };
        return defaults;
    }

    const stat = statSync(settingsPath);
    if (settingsCache !== undefined && settingsCache.mtimeMs === stat.mtimeMs) {
        return settingsCache;
    }

    const loaded: SettingsCache = { mtimeMs: stat.mtimeMs, ...defaults };
    try {
        const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
        if (isValidMentionTrigger(settings[TRIGGER_SETTINGS_KEY])) {
            loaded.trigger = settings[TRIGGER_SETTINGS_KEY];
        }
        if (typeof settings[HIDE_SLASH_SKILLS_SETTINGS_KEY] === "boolean") {
            loaded.hideSlashSkills = settings[HIDE_SLASH_SKILLS_SETTINGS_KEY];
        }
    } catch {
        // Ignore malformed settings and fall back to defaults.
    }

    settingsCache = loaded;
    return loaded;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripFrontmatter(content: string): string {
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

function getSkillCommands(pi: ExtensionAPI): SkillCommand[] {
    return pi.getCommands().filter((command): command is SkillCommand => {
        return command.source === "skill" && command.name.startsWith(SKILL_COMMAND_PREFIX);
    });
}

function skillName(command: SkillCommand): string {
    return command.name.slice(SKILL_COMMAND_PREFIX.length);
}

function skillToItem(command: SkillCommand, trigger = DEFAULT_MENTION_TRIGGER): AutocompleteItem {
    const name = skillName(command);
    return {
        value: `${trigger}${name}`,
        label: `${trigger}${name}`,
        description: command.description,
    };
}

function extractSkillToken(textBeforeCursor: string, trigger: string): string | undefined {
    const escapedTrigger = escapeRegExp(trigger);
    const match = new RegExp(`(?:^|\\s)${escapedTrigger}([a-z0-9-]*)$`).exec(textBeforeCursor);
    return match?.[1];
}

function filterSkills(skills: SkillCommand[], query: string, trigger: string): AutocompleteItem[] {
    if (query.length === 0) {
        return skills.slice(0, MAX_SUGGESTIONS).map((skill) => skillToItem(skill, trigger));
    }

    return fuzzyFilter(skills, query, (skill) => `${skillName(skill)} ${skill.description}`)
        .slice(0, MAX_SUGGESTIONS)
        .map((skill) => skillToItem(skill, trigger));
}

function filterSlashSkillSuggestions(
    suggestions: AutocompleteSuggestions | null,
    hideSlashSkills: boolean,
): AutocompleteSuggestions | null {
    if (!hideSlashSkills || suggestions === null || !suggestions.prefix.startsWith("/")) {
        return suggestions;
    }

    const items = suggestions.items.filter((item) => !item.value.startsWith(SKILL_COMMAND_PREFIX));
    if (items.length === suggestions.items.length) return suggestions;
    if (items.length === 0) return null;
    return { ...suggestions, items };
}

function createSkillMentionProvider(
    pi: ExtensionAPI,
    current: AutocompleteProvider,
    settings: MentionSkillSettings,
): AutocompleteProvider {
    const { trigger, hideSlashSkills } = settings;
    const getFallbackSuggestions = async (
        lines: string[],
        cursorLine: number,
        cursorCol: number,
        options: { signal: AbortSignal; force?: boolean },
    ): Promise<AutocompleteSuggestions | null> => {
        const suggestions = await current.getSuggestions(lines, cursorLine, cursorCol, options);
        return filterSlashSkillSuggestions(suggestions, hideSlashSkills);
    };

    const provider = {
        triggerCharacters: [trigger],

        async getSuggestions(
            lines: string[],
            cursorLine: number,
            cursorCol: number,
            options: { signal: AbortSignal; force?: boolean },
        ): Promise<AutocompleteSuggestions | null> {
            const line = lines[cursorLine] ?? "";
            const beforeCursor = line.slice(0, cursorCol);
            const token = extractSkillToken(beforeCursor, trigger);
            if (token === undefined) {
                return getFallbackSuggestions(lines, cursorLine, cursorCol, options);
            }

            const items = filterSkills(getSkillCommands(pi), token, trigger);
            if (items.length === 0) {
                return getFallbackSuggestions(lines, cursorLine, cursorCol, options);
            }
            return { prefix: `${trigger}${token}`, items };
        },

        applyCompletion(
            lines: string[],
            cursorLine: number,
            cursorCol: number,
            item: AutocompleteItem,
            prefix: string,
        ) {
            if (!prefix.startsWith(trigger)) {
                return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
            }

            const currentLine = lines[cursorLine] ?? "";
            const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
            const afterCursor = currentLine.slice(cursorCol);
            const needsSpace = afterCursor.length === 0 || !/^\s/.test(afterCursor);
            let suffix = "";
            if (needsSpace) {
                suffix = " ";
            }
            const newLines = [...lines];
            newLines[cursorLine] = `${beforePrefix}${item.value}${suffix}${afterCursor}`;
            return {
                lines: newLines,
                cursorLine,
                cursorCol: beforePrefix.length + item.value.length + suffix.length,
            };
        },

        shouldTriggerFileCompletion(lines: string[], cursorLine: number, cursorCol: number) {
            return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
        },
    };

    return provider;
}

function isSkillMentionContext(text: string, trigger: string): boolean {
    return new RegExp(`(?:^|\\s)${escapeRegExp(trigger)}[a-z0-9-]*$`).test(text);
}

function colorSkillMentions(
    line: string,
    pi: ExtensionAPI,
    ctx: ExtensionContext,
    trigger: string,
): string {
    const skillNames = new Set(getSkillCommands(pi).map(skillName));
    if (skillNames.size === 0 || !line.includes(trigger)) return line;

    const mentionPattern = new RegExp(`${escapeRegExp(trigger)}([a-z0-9][a-z0-9-]{0,63})`, "g");
    return line.replace(mentionPattern, (match: string, name: string) => {
        if (!skillNames.has(name)) return match;
        return ctx.ui.theme.fg("accent", match);
    });
}

const ANSI_ESCAPE_PATTERN = new RegExp(
    `${String.fromCharCode(27)}(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])`,
    "g",
);

function stripAnsi(value: string): string {
    return value.replace(ANSI_ESCAPE_PATTERN, "");
}

function autocompleteStartIndex(renderedLines: string[]): number {
    for (let index = renderedLines.length - 1; index >= 0; index -= 1) {
        const line = renderedLines[index];
        if (line !== undefined && stripAnsi(line).startsWith("─")) return index + 1;
    }
    return renderedLines.length;
}

function enhanceEditor(
    editor: EditorLike,
    pi: ExtensionAPI,
    ctx: ExtensionContext,
    trigger: string,
): EditorLike {
    const originalHandleInput = editor.handleInput.bind(editor);
    editor.handleInput = (data: string) => {
        originalHandleInput(data);

        if (!/^[a-z0-9-]$/i.test(data) && data !== trigger) return;

        const text = editor.getText();
        const lines = text.split("\n");
        const lastLine = lines[lines.length - 1];
        let currentLine = "";
        if (lastLine !== undefined) {
            currentLine = lastLine;
        }
        if (!isSkillMentionContext(currentLine, trigger)) return;
        if (editor.isShowingAutocomplete?.() === true) return;
        editor.tryTriggerAutocomplete?.();
    };

    const originalRender = editor.render.bind(editor);
    editor.render = (width: number) => {
        const renderedLines = originalRender(width);
        let colorThrough = renderedLines.length;
        if (editor.isShowingAutocomplete?.() === true) {
            colorThrough = autocompleteStartIndex(renderedLines);
        }
        return renderedLines.map((line, index) => {
            if (index >= colorThrough) return line;
            return colorSkillMentions(line, pi, ctx, trigger);
        });
    };

    return editor;
}

function applyMentionSkillEditor(pi: ExtensionAPI, ctx: ExtensionContext, trigger: string): void {
    if (!ctx.hasUI) return;

    const existing = ctx.ui.getEditorComponent() as WrappedEditorFactory | undefined;
    const baseFactory = existing?.[MENTION_FACTORY_BASE] ?? existing;
    const factory = ((tui, theme, keybindings) => {
        const editor = (baseFactory?.(tui, theme, keybindings) ??
            new CustomEditor(tui, theme, keybindings)) as unknown as EditorLike;
        return enhanceEditor(editor, pi, ctx, trigger);
    }) as WrappedEditorFactory;
    factory[MENTION_FACTORY_BASE] = baseFactory;

    ctx.ui.setEditorComponent(factory);
}

async function loadSkillExpansion(command: SkillCommand): Promise<SkillExpansion> {
    const content = await fs.readFile(command.sourceInfo.path, "utf8");
    const body = stripFrontmatter(content).trim();
    const baseDir = command.sourceInfo.baseDir ?? path.dirname(command.sourceInfo.path);
    const name = skillName(command);
    return { name, location: command.sourceInfo.path, body, baseDir };
}

function formatSkillBlock(expansion: SkillExpansion): string {
    return `<skill name="${expansion.name}" location="${expansion.location}">\nReferences are relative to ${expansion.baseDir}.\n\n${expansion.body}\n</skill>`;
}

function formatCombinedSkillBlock(expansions: SkillExpansion[]): string {
    if (expansions.length === 1) {
        const expansion = expansions[0];
        if (expansion !== undefined) return formatSkillBlock(expansion);
    }

    const names = expansions.map((expansion) => expansion.name).join(", ");
    const content = expansions
        .map((expansion) => {
            return `## ${expansion.name}\n\nReferences are relative to ${expansion.baseDir}.\n\n${expansion.body}`;
        })
        .join("\n\n---\n\n");
    return `<skill name="${names}" location="multiple">\n${content}\n</skill>`;
}

function skillMentionPattern(trigger: string): RegExp {
    return new RegExp(
        `(^|\\s)${escapeRegExp(trigger)}([a-z0-9][a-z0-9-]{0,63})(?=$|\\s|[.,;:!?)}\\]])`,
        "g",
    );
}

function removeSkillMentionSigils(text: string, names: Set<string>, trigger: string): string {
    return text
        .replace(skillMentionPattern(trigger), (match: string, leading: string, name: string) => {
            if (!names.has(name)) return match;
            return `${leading}${name}`;
        })
        .trim();
}

async function expandSkillMentions(
    text: string,
    skills: SkillCommand[],
    trigger: string,
): Promise<string> {
    const byName = new Map(skills.map((skill) => [skillName(skill), skill]));
    const names = new Set<string>();

    for (const match of text.matchAll(skillMentionPattern(trigger))) {
        const name = match[2];
        if (name !== undefined && byName.has(name)) {
            names.add(name);
        }
    }

    if (names.size === 0) return text;

    const expansions = await Promise.all(
        [...names].map(async (name) => {
            const skill = byName.get(name);
            if (skill === undefined) return undefined;
            return loadSkillExpansion(skill);
        }),
    );
    const loaded = expansions.filter((expansion): expansion is SkillExpansion => {
        return expansion !== undefined;
    });
    if (loaded.length === 0) return text;

    const skillBlock = formatCombinedSkillBlock(loaded);
    const userMessage = removeSkillMentionSigils(text, names, trigger);
    if (userMessage.length === 0) return skillBlock;
    return `${skillBlock}\n\n${userMessage}`;
}

export default function (pi: ExtensionAPI): void {
    pi.on("session_start", async (_event, ctx) => {
        if (!ctx.hasUI) return;
        const settings = configuredMentionSkillSettings();
        applyMentionSkillEditor(pi, ctx, settings.trigger);
        ctx.ui.addAutocompleteProvider((current) =>
            createSkillMentionProvider(pi, current, settings),
        );
    });

    pi.on("input", async (event) => {
        const { trigger } = configuredMentionSkillSettings();
        if (!event.text.includes(trigger)) return { action: "continue" };

        const expanded = await expandSkillMentions(event.text, getSkillCommands(pi), trigger);
        if (expanded === event.text) return { action: "continue" };
        return { action: "transform", text: expanded, images: event.images };
    });
}
