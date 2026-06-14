import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { createFooterComponent } from "./footer-rendering.ts";

export default function uiEnhancements(pi: ExtensionAPI) {
    const installFooter = (ctx: ExtensionContext) => {
        ctx.ui.setFooter((tui, _theme, footerData) =>
            createFooterComponent(
                ctx,
                footerData,
                () => pi.getThinkingLevel(),
                () => tui.requestRender(),
            ),
        );
    };

    pi.on("session_start", async (_event, ctx) => {
        installFooter(ctx);
    });

    pi.on("session_shutdown", async (_event, ctx) => {
        ctx.ui.setFooter(undefined);
    });
}
