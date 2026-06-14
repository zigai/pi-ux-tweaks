import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Type, type Static, type TSchema } from "typebox";
import { Value } from "typebox/value";

import type { AliasConfig, LoadedConfig, RuntimeState } from "./types.ts";

export const CONFIG_FILE = join(getAgentDir(), "model-aliases.json");

const NonBlankString = Type.String({ pattern: "\\S" });

const AliasConfigSchema = Type.Object({
    provider: NonBlankString,
    model: NonBlankString,
    alias: NonBlankString,
    name: Type.Optional(NonBlankString),
});

const ModelAliasesConfigSchema = Type.Object({
    $schema: Type.Optional(Type.String()),
    aliases: Type.Optional(Type.Array(AliasConfigSchema)),
});

type ParsedAliasConfig = Static<typeof AliasConfigSchema>;
type ParsedModelAliasesConfig = Static<typeof ModelAliasesConfigSchema>;

function formatSchemaPath(instancePath: string): string {
    if (instancePath.length === 0) return "root";
    return instancePath
        .slice(1)
        .split("/")
        .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
        .join(".");
}

function parseSchema(schema: TSchema, value: unknown, label: string): unknown {
    const errors = [...Value.Errors(schema, value)];
    if (errors.length > 0) {
        const messages = errors
            .slice(0, 5)
            .map((error) => `${formatSchemaPath(error.instancePath)} ${error.message}`);
        let suffix = "";
        if (errors.length > messages.length) {
            suffix = `; and ${errors.length - messages.length} more`;
        }
        throw new Error(`${label} is invalid: ${messages.join("; ")}${suffix}`);
    }
    const parsed: unknown = Value.Parse(schema, value);
    return parsed;
}

function normalizeAliasConfig(entry: ParsedAliasConfig): AliasConfig {
    const normalized: AliasConfig = {
        provider: entry.provider.trim(),
        model: entry.model.trim(),
        alias: entry.alias.trim(),
    };
    if (entry.name !== undefined) {
        normalized.name = entry.name.trim();
    }
    return normalized;
}

function validateUniqueAliases(aliases: AliasConfig[]): void {
    const seenAliases = new Map<string, number>();
    aliases.forEach((entry, index) => {
        const aliasKey = `${entry.provider}\0${entry.alias}`;
        const duplicateIndex = seenAliases.get(aliasKey);
        if (duplicateIndex !== undefined) {
            throw new Error(
                `aliases[${index}] duplicates aliases[${duplicateIndex}] for provider "${entry.provider}" and alias "${entry.alias}".`,
            );
        }
        seenAliases.set(aliasKey, index);
    });
}

function parseModelAliasesConfig(config: unknown): { aliases: AliasConfig[] } {
    const parsed = parseSchema(
        ModelAliasesConfigSchema,
        config,
        "model-aliases.json",
    ) as ParsedModelAliasesConfig;
    const aliases = (parsed.aliases ?? []).map(normalizeAliasConfig);
    validateUniqueAliases(aliases);
    return { aliases };
}

export function safeReadConfig(state: RuntimeState): LoadedConfig {
    let mtimeMs = -1;
    try {
        try {
            mtimeMs = statSync(CONFIG_FILE).mtimeMs;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                const loaded: LoadedConfig = {
                    path: CONFIG_FILE,
                    mtimeMs: -1,
                    aliases: [],
                };
                state.configCache = loaded;
                return loaded;
            }
            throw error;
        }
        if (state.configCache?.mtimeMs === mtimeMs) {
            return state.configCache;
        }

        const raw = readFileSync(CONFIG_FILE, "utf8");
        const parsed = parseModelAliasesConfig(JSON.parse(raw));
        const loaded: LoadedConfig = {
            path: CONFIG_FILE,
            mtimeMs,
            aliases: parsed.aliases,
        };
        state.configCache = loaded;
        return loaded;
    } catch (error) {
        let message: string;
        if (error instanceof Error) {
            message = error.message;
        } else {
            message = String(error);
        }
        const loaded: LoadedConfig = {
            path: CONFIG_FILE,
            mtimeMs,
            aliases: [],
            error: `Failed to load ${CONFIG_FILE}: ${message}`,
        };
        state.configCache = loaded;
        return loaded;
    }
}
