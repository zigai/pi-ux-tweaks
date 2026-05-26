import { Loader } from "@earendil-works/pi-tui";

const LOADER_TIME_PATCH_KEY = Symbol.for("zigai.pi-ui-tweaks.loader-time-patched");

const loaderStartTimes = new WeakMap<object, number>();

type PatchState = typeof globalThis & {
    [LOADER_TIME_PATCH_KEY]?: boolean;
};

type PatchedLoader = Loader & {
    ui?: { requestRender(): void } | null;
    intervalId?: ReturnType<typeof setInterval> | null;
    setText(text: string): void;
    message: string;
    messageColorFn(text: string): string;
    spinnerColorFn(text: string): string;
    frames: string[];
    currentFrame: number;
    renderIndicatorVerbatim: boolean;
};

function getPatchState(): PatchState {
    return globalThis as PatchState;
}

function formatElapsed(seconds: number): string {
    if (seconds < 60) {
        return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
        return `${minutes}m ${remainingSeconds}s`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
}

function updateDisplay(loader: PatchedLoader): void {
    const frame = loader.frames[loader.currentFrame] ?? "";
    let renderedFrame = loader.spinnerColorFn(frame);
    if (loader.renderIndicatorVerbatim === true) {
        renderedFrame = frame;
    }

    let indicator = "";
    if (frame.length > 0) {
        indicator = `${renderedFrame} `;
    }

    let startedAt = loaderStartTimes.get(loader);
    if (startedAt === undefined) {
        startedAt = Date.now();
        loaderStartTimes.set(loader, startedAt);
    }
    const elapsedSeconds = Math.floor(Math.max(0, Date.now() - startedAt) / 1000);
    const message = `${loader.message} (${formatElapsed(elapsedSeconds)})`;
    loader.setText(`${indicator}${loader.messageColorFn(message)}`);
    loader.ui?.requestRender();
}

function patchLoaderTime(): void {
    const state = getPatchState();
    if (state[LOADER_TIME_PATCH_KEY] === true) {
        return;
    }
    state[LOADER_TIME_PATCH_KEY] = true;

    const prototype = Loader.prototype as PatchedLoader & {
        start(): void;
        stop(): void;
        updateDisplay(): void;
    };
    const originalStart = Reflect.get(prototype, "start") as (this: PatchedLoader) => void;
    const originalStop = Reflect.get(prototype, "stop") as (this: PatchedLoader) => void;

    prototype.start = function patchedStart(this: PatchedLoader): void {
        loaderStartTimes.set(this, Date.now());
        originalStart.call(this);
    };

    prototype.stop = function patchedStop(this: PatchedLoader): void {
        loaderStartTimes.delete(this);
        originalStop.call(this);
    };

    prototype.updateDisplay = function patchedUpdateDisplay(this: PatchedLoader): void {
        updateDisplay(this);
    };
}

export default function loaderTimeExtension(): void {
    patchLoaderTime();
}
