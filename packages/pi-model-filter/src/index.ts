import {
    getAgentDir,
    ModelRegistry,
    type ExtensionAPI,
    type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Type, type Static, type TSchema } from "typebox";
import { Value } from "typebox/value";

const CONFIG_FILE = join(getAgentDir(), "model-filters.json");
const PATCH_MARKER = "__providerModelFilterPatched";
const RUNTIME_KEY = "__providerModelFilterRuntime";
const ORIGINAL_GET_ALL_KEY = "__providerModelFilterOriginalGetAll";
const ORIGINAL_GET_AVAILABLE_KEY = "__providerModelFilterOriginalGetAvailable";
const ORIGINAL_FIND_KEY = "__providerModelFilterOriginalFind";

export type ModelLike = {
    provider: string;
    id: string;
};

export type FilterRuleConfig = {
    provider: string;
    models: string[];
};

export type FilterConfig = {
    include?: FilterRuleConfig[];
    exclude?: FilterRuleConfig[];
};

export type NormalizedRule = {
    providerPattern: string;
    providerRegex: RegExp;
    modelPatterns: string[];
    modelRegexes: RegExp[];
};

export type LoadedConfig = {
    path: string;
    mtimeMs: number;
    includeRules: NormalizedRule[];
    excludeRules: NormalizedRule[];
    error?: string;
};

export type RuntimeState = {
    configCache?: LoadedConfig;
    reportedErrorKey?: string;
    loadConfig: () => LoadedConfig;
};

export type BasicModelRegistry = {
    getAll(): ModelLike[];
    getAvailable(): ModelLike[];
    find(provider: string, modelId: string): ModelLike | undefined;
};

export type PatchedModelRegistry = BasicModelRegistry & {
    [PATCH_MARKER]?: boolean;
    [RUNTIME_KEY]?: RuntimeState;
    [ORIGINAL_GET_ALL_KEY]?: () => ModelLike[];
    [ORIGINAL_GET_AVAILABLE_KEY]?: () => ModelLike[];
    [ORIGINAL_FIND_KEY]?: (provider: string, modelId: string) => ModelLike | undefined;
};

export function globToRegex(pattern: string): RegExp {
    let regex = "";
    for (const character of pattern) {
        if (character === "*") {
            regex += ".*";
        } else if (character === "?") {
            regex += ".";
        } else {
            regex += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
        }
    }
    return new RegExp(`^${regex}$`);
}

const NonBlankString = Type.String({ pattern: "\\S" });

const FilterRuleSchema = Type.Object({
    provider: NonBlankString,
    models: Type.Array(NonBlankString, { minItems: 1 }),
});

const FilterConfigSchema = Type.Object({
    $schema: Type.Optional(Type.String()),
    include: Type.Optional(Type.Array(FilterRuleSchema)),
    exclude: Type.Optional(Type.Array(FilterRuleSchema)),
});

type ParsedFilterRuleConfig = Static<typeof FilterRuleSchema>;
type ParsedFilterConfig = Static<typeof FilterConfigSchema>;

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

function normalizeRule(rule: ParsedFilterRuleConfig): FilterRuleConfig {
    return {
        provider: rule.provider.trim(),
        models: rule.models.map((model) => model.trim()),
    };
}

function parseFilterConfig(config: unknown): FilterConfig {
    const parsed = parseSchema(
        FilterConfigSchema,
        config,
        "model-filters.json",
    ) as ParsedFilterConfig;
    return {
        include: (parsed.include ?? []).map(normalizeRule),
        exclude: (parsed.exclude ?? []).map(normalizeRule),
    };
}

export function normalizeRules(rules: FilterRuleConfig[]): NormalizedRule[] {
    return rules.map((rule) => ({
        providerPattern: rule.provider,
        providerRegex: globToRegex(rule.provider),
        modelPatterns: rule.models,
        modelRegexes: rule.models.map((model) => globToRegex(model)),
    }));
}

function findMatchingRule(
    model: ModelLike,
    rules: NormalizedRule[] | undefined,
): NormalizedRule | undefined {
    for (const rule of rules ?? []) {
        if (!rule.providerRegex.test(model.provider)) {
            continue;
        }
        if (rule.modelRegexes.some((regex) => regex.test(model.id))) {
            return rule;
        }
    }
    return undefined;
}

function hasIncludePolicy(model: ModelLike, rules: NormalizedRule[] | undefined): boolean {
    return (rules ?? []).some((rule) => rule.providerRegex.test(model.provider));
}

function isVisibleModel(model: ModelLike, loaded: LoadedConfig): boolean {
    if (hasIncludePolicy(model, loaded.includeRules)) {
        const includeRule = findMatchingRule(model, loaded.includeRules);
        if (includeRule === undefined) {
            return false;
        }
    }

    return findMatchingRule(model, loaded.excludeRules) === undefined;
}

export function filterModels(models: ModelLike[], loaded: LoadedConfig): ModelLike[] {
    return models.filter((model) => isVisibleModel(model, loaded));
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
                    includeRules: [],
                    excludeRules: [],
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
        const parsed = parseFilterConfig(JSON.parse(raw));
        const loaded: LoadedConfig = {
            path: CONFIG_FILE,
            mtimeMs,
            includeRules: normalizeRules(parsed.include ?? []),
            excludeRules: normalizeRules(parsed.exclude ?? []),
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
            includeRules: [],
            excludeRules: [],
            error: `Failed to load ${CONFIG_FILE}: ${message}`,
        };
        state.configCache = loaded;
        return loaded;
    }
}

function reportConfigError(state: RuntimeState, ctx: ExtensionContext, loaded: LoadedConfig): void {
    if (loaded.error === undefined) {
        state.reportedErrorKey = undefined;
        return;
    }

    const errorKey = `${loaded.path}:${loaded.mtimeMs}:${loaded.error}`;
    if (state.reportedErrorKey === errorKey) {
        return;
    }

    state.reportedErrorKey = errorKey;
    ctx.ui.notify(loaded.error, "error");
}

export function installRegistryPatch(registry: PatchedModelRegistry, state: RuntimeState): void {
    registry[RUNTIME_KEY] = state;

    if (
        typeof registry.getAll !== "function" ||
        typeof registry.getAvailable !== "function" ||
        typeof registry.find !== "function"
    ) {
        throw new Error("Pi model registry does not expose the expected methods.");
    }

    if (registry[PATCH_MARKER] === true) {
        return;
    }

    registry[PATCH_MARKER] = true;
    registry[ORIGINAL_GET_ALL_KEY] = Reflect.get(registry, "getAll") as () => ModelLike[];
    registry[ORIGINAL_GET_AVAILABLE_KEY] = Reflect.get(
        registry,
        "getAvailable",
    ) as () => ModelLike[];
    registry[ORIGINAL_FIND_KEY] = Reflect.get(registry, "find") as (
        provider: string,
        modelId: string,
    ) => ModelLike | undefined;

    registry.getAll = function getAll(this: PatchedModelRegistry) {
        const models = this[ORIGINAL_GET_ALL_KEY]?.call(this) ?? [];
        const runtime = this[RUNTIME_KEY] ?? registry[RUNTIME_KEY];
        const loaded = runtime!.loadConfig();
        return filterModels(models, loaded);
    };

    registry.getAvailable = function getAvailable(this: PatchedModelRegistry) {
        const models = this[ORIGINAL_GET_AVAILABLE_KEY]?.call(this) ?? [];
        const runtime = this[RUNTIME_KEY] ?? registry[RUNTIME_KEY];
        const loaded = runtime!.loadConfig();
        return filterModels(models, loaded);
    };

    registry.find = function find(this: PatchedModelRegistry, provider: string, modelId: string) {
        const finder = this[ORIGINAL_FIND_KEY] ?? registry[ORIGINAL_FIND_KEY];
        const model = finder?.call(this, provider, modelId);
        if (model === undefined) {
            return undefined;
        }

        const runtime = this[RUNTIME_KEY] ?? registry[RUNTIME_KEY];
        const loaded = runtime!.loadConfig();
        if (!isVisibleModel(model, loaded)) {
            return undefined;
        }
        return model;
    };
}

export default function providerModelFilterExtension(pi: ExtensionAPI) {
    const state: RuntimeState = {
        loadConfig: () => safeReadConfig(state),
    };

    installRegistryPatch(ModelRegistry.prototype as PatchedModelRegistry, state);

    pi.on("session_start", async (_event, ctx) => {
        installRegistryPatch(ctx.modelRegistry as PatchedModelRegistry, state);
        reportConfigError(state, ctx, state.loadConfig());
    });

    pi.on("turn_start", (_event, ctx) => {
        reportConfigError(state, ctx, state.loadConfig());
    });
}
