import { Command, ComposerPill, Plugin } from "@opencode/plugin/gui";
import type { ComposerPill as ComposerPillDef } from "@opencode/plugin/gui";
import { createSignal } from "solid-js";

/**
 * Desktop GUI plugin: enhance the routed session's composer draft using the
 * composer's model. Reads the draft as plain text (mentions stay `@text`,
 * attachments are not read), and replaces the draft only on a non-empty
 * successful result. Never sends the prompt; the user reviews and sends.
 *
 * Two triggers share one action:
 * - `/enhance` slash / palette command;
 * - an "Enhance" pill button in the row above the composer (ComposerPill).
 */

function buildPrompt(draft: string): string {
  return [
    "You are a prompt engineer for coding agents. Rewrite the user's draft below into a precise, self-contained instruction that an AI coding agent can execute directly.",
    "Preserve the user's intent and language, make the goal and constraints explicit, and do not invent requirements, file paths, or facts.",
    "Return only the rewritten prompt, with no preamble, commentary, or code fences.",
    "",
    "---",
    draft,
    "---",
  ].join("\n");
}

export default Plugin.define({
  i18n: {
    en: {
      "enhance.title": "Enhance prompt",
      "enhance.description": "Rewrite the draft as a precise, self-contained instruction an AI coding agent can execute.",
      "enhance.pill": "Enhance",
      "enhance.pill.busy": "Enhancing…",
      "enhance.empty": "Nothing to enhance — the prompt is empty.",
      "enhance.model-unavailable": "Could not determine the model for the current prompt.",
      "enhance.empty-result": "The model returned no usable text.",
      "enhance.failed": "Prompt enhancement failed.",
      "enhance.done": "Prompt enhanced.",
    },
    zh: {
      "enhance.title": "增强提示词",
      "enhance.description": "把草稿改写成清晰、自足、可直接执行的指令。",
      "enhance.pill": "增强",
      "enhance.pill.busy": "增强中…",
      "enhance.empty": "没有可增强的内容——提示词是空的。",
      "enhance.model-unavailable": "无法确定当前提示词使用的模型。",
      "enhance.empty-result": "模型没有返回可用文本。",
      "enhance.failed": "提示词增强失败。",
      "enhance.done": "提示词已增强。",
    },
  },
  setup(ctx) {
    const [busy, setBusy] = createSignal(false);

    const enhance = async () => {
      if (busy()) return;
      setBusy(true);
      try {
        const composer = ctx.screen.current()?.composer;
        const draft = composer?.text() ?? "";
        if (!draft.trim()) {
          ctx.toast.show({ title: ctx.t("enhance.empty"), variant: "error" });
          return;
        }
        const model = composer?.model();
        if (!model) {
          ctx.toast.show({ title: ctx.t("enhance.model-unavailable"), variant: "error" });
          return;
        }
        const generated = await ctx.client.experimental.generate.text({
          prompt: buildPrompt(draft),
          model: {
            id: model.modelID,
            providerID: model.providerID,
            ...(model.variant !== undefined ? { variant: model.variant } : {}),
          },
        });
        const enhanced = (generated?.text ?? "").trim();
        if (!enhanced) {
          ctx.toast.show({ title: ctx.t("enhance.empty-result"), variant: "error" });
          return;
        }
        composer?.setText(enhanced);
        ctx.toast.show({ title: ctx.t("enhance.done"), variant: "success" });
      } catch {
        ctx.toast.show({ title: ctx.t("enhance.failed"), variant: "error" });
      } finally {
        setBusy(false);
      }
    };

    ctx.add(Command, (): Command => ({
      id: "enhance",
      get title() {
        return ctx.t("enhance.title");
      },
      get description() {
        return ctx.t("enhance.description");
      },
      get enabled() {
        return !busy();
      },
      section: "prompt",
      slash: { name: "enhance" },
      run: enhance,
    }));

    ctx.add(ComposerPill, (): ComposerPillDef => ({
      id: "enhance",
      show: () => ({
        icon: "prompt",
        get label() {
          return busy() ? ctx.t("enhance.pill.busy") : ctx.t("enhance.pill");
        },
        run: enhance,
      }),
    }));
  },
});
