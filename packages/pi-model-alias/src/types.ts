export type ModelLike = {
    provider: string;
    id: string;
    name?: string;
};

export type AliasConfig = {
    provider: string;
    model: string;
    alias: string;
    name?: string;
};

export type ModelAliasesConfig = {
    aliases?: AliasConfig[];
};

export type LoadedConfig = {
    path: string;
    mtimeMs: number;
    aliases: AliasConfig[];
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
