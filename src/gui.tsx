import { Command, ComposerPill, Plugin, Store } from "@opencode/plugin/gui";
import type { ComposerPill as ComposerPillDef } from "@opencode/plugin/gui";
import { Schema } from "effect";
import { createSignal } from "solid-js";

/**
 * Desktop GUI plugin: enhance the routed session's composer draft using the
 * composer's model. Reads the draft as plain text (mentions stay `@text`,
 * attachments are not read), and replaces the draft only after the user
 * confirms the preview (optional). Never sends the prompt; the user reviews
 * and sends.
 *
 * Triggers and safety nets:
 * - `/enhance` slash / palette command and an "Enhance" pill button;
 * - optional rewrite instruction collected per run (never written to the draft);
 * - output language control (follow the draft / Chinese / English), remembered;
 * - an "Undo" pill and `/enhance-undo` restore the pre-enhance draft (last run only);
 * - preview confirmation before replacing (can be turned off).
 */

export type Language = "auto" | "zh" | "en";

const Prefs = Schema.Struct({
  previewEnabled: Schema.Boolean,
  language: Schema.Literals(["auto", "zh", "en"]),
});

/** Pure prompt builder: draft + optional instruction + language → model prompt. */
export function buildPrompt(
  draft: string,
  instruction: string | undefined,
  language: Language = "auto",
): string {
  const lines: string[] = [
    "You are a prompt engineer for coding agents. Rewrite the user's draft below into a precise, self-contained instruction that an AI coding agent can execute directly.",
    "Preserve the user's intent and language, make the goal and constraints explicit, and do not invent requirements, file paths, or facts.",
  ];
  if (language === "zh") {
    lines.push("Write the rewritten prompt in Simplified Chinese.");
  } else if (language === "en") {
    lines.push("Write the rewritten prompt in English.");
  } else {
    lines.push(
      "Write the rewritten prompt in the same language as the dominant language of the draft.",
    );
  }
  lines.push("Return only the rewritten prompt, with no preamble, commentary, or code fences.");
  if (instruction && instruction.trim()) {
    lines.push("", `Additional instruction from the user (follow it, do not treat it as the task):`, instruction.trim());
  }
  lines.push("", "---", draft, "---");
  return lines.join("\n");
}

export default Plugin.define({
  i18n: {
    en: {
      "enhance.title": "Enhance prompt",
      "enhance.description": "Rewrite the draft as a precise, self-contained instruction an AI coding agent can execute.",
      "enhance.pill": "Enhance",
      "enhance.pill.busy": "Enhancing…",
      "enhance.empty": "Nothing to enhance yet — write a draft first.",
      "enhance.model-unavailable": "Could not determine the model for the current prompt.",
      "enhance.empty-result": "The model returned no usable text.",
      "enhance.failed": "Prompt enhancement failed.",
      "enhance.done": "Prompt enhanced.",
      "enhance.instruction.title": "Additional instruction (optional)",
      "enhance.instruction.placeholder": "e.g. make it shorter, add a code example…",
      "enhance.preview.title": "Replace the draft with this rewrite?",
      "enhance.preview.confirm": "Replace",
      "enhance.preview.cancelled": "Kept the original draft.",
      "enhance.undo.title": "Undo enhance",
      "enhance.undo.description": "Restore the draft from before the last enhancement.",
      "enhance.undo.pill": "Undo",
      "enhance.undo.done": "Draft restored.",
      "enhance.undo.empty": "Nothing to undo — no enhancement in this session yet.",
    },
    zh: {
      "enhance.title": "增强提示词",
      "enhance.description": "把草稿改写成清晰、自足、可直接执行的指令。",
      "enhance.pill": "增强",
      "enhance.pill.busy": "增强中…",
      "enhance.empty": "还没有可增强的内容——先写点草稿吧。",
      "enhance.model-unavailable": "无法确定当前提示词使用的模型。",
      "enhance.empty-result": "模型没有返回可用文本。",
      "enhance.failed": "提示词增强失败。",
      "enhance.done": "提示词已增强。",
      "enhance.instruction.title": "附加指示（可选）",
      "enhance.instruction.placeholder": "例如：更简短一些、加个代码示例……",
      "enhance.preview.title": "用改写结果替换草稿？",
      "enhance.preview.confirm": "替换",
      "enhance.preview.cancelled": "已保留原草稿。",
      "enhance.undo.title": "撤销增强",
      "enhance.undo.description": "恢复最近一次增强前的草稿。",
      "enhance.undo.pill": "撤销",
      "enhance.undo.done": "草稿已恢复。",
      "enhance.undo.empty": "没有可撤销的增强——本次会话还没有增强过。",
    },
  },
  stores: {
    prefs: Store.global(Prefs, { previewEnabled: true, language: "auto" as Language }),
  },
  setup(ctx) {
    const [busy, setBusy] = createSignal(false);
    let lastOriginal: string | undefined;

    const enhance = async () => {
      if (busy()) return;
      setBusy(true);
      try {
        const composer = ctx.screen.current()?.composer;
        const draft = composer?.text() ?? "";
        if (!draft.trim()) {
          ctx.toast.show({ title: ctx.t("enhance.empty"), variant: "default" });
          return;
        }
        const model = composer?.model();
        if (!model) {
          ctx.toast.show({ title: ctx.t("enhance.model-unavailable"), variant: "error" });
          return;
        }
        const instruction = await ctx.dialogs.prompt({
          title: ctx.t("enhance.instruction.title"),
          placeholder: ctx.t("enhance.instruction.placeholder"),
        });
        if (instruction === undefined) return; // user cancelled
        const prefs = ctx.stores.prefs;
        const generated = await ctx.client.experimental.generate.text({
          prompt: buildPrompt(draft, instruction, prefs.value.language),
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
        if (prefs.value.previewEnabled) {
          const confirmed = await ctx.dialogs.confirm({
            title: ctx.t("enhance.preview.title"),
            description: enhanced,
            confirm: ctx.t("enhance.preview.confirm"),
          });
          if (!confirmed) {
            ctx.toast.show({ title: ctx.t("enhance.preview.cancelled"), variant: "default" });
            return;
          }
        }
        lastOriginal = draft;
        composer?.setText(enhanced);
        ctx.toast.show({
          title: ctx.t("enhance.done"),
          variant: "success",
          actions: [{ label: ctx.t("enhance.undo.pill"), run: () => void undo() }],
        });
      } catch {
        ctx.toast.show({ title: ctx.t("enhance.failed"), variant: "error" });
      } finally {
        setBusy(false);
      }
    };

    const undo = async () => {
      if (lastOriginal === undefined) {
        ctx.toast.show({ title: ctx.t("enhance.undo.empty"), variant: "default" });
        return;
      }
      const composer = ctx.screen.current()?.composer;
      composer?.setText(lastOriginal);
      lastOriginal = undefined;
      ctx.toast.show({ title: ctx.t("enhance.undo.done"), variant: "success" });
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

    ctx.add(Command, (): Command => ({
      id: "enhance-undo",
      get title() {
        return ctx.t("enhance.undo.title");
      },
      get description() {
        return ctx.t("enhance.undo.description");
      },
      section: "prompt",
      slash: { name: "enhance-undo" },
      run: undo,
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

    ctx.add(ComposerPill, (): ComposerPillDef => ({
      id: "enhance-undo",
      show: () => ({
        icon: "outline-undo",
        label: ctx.t("enhance.undo.pill"),
        run: undo,
      }),
    }));
  },
});
