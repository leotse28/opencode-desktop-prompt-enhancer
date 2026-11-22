import { Command, ComposerPill, Plugin, Store, createKeyed } from "@opencode/plugin/gui";
import type { ComposerPill as ComposerPillDef } from "@opencode/plugin/gui";
import { Schema } from "effect";
import { createSignal } from "solid-js";

/**
 * Desktop GUI plugin: enhance the routed session's composer draft using the
 * composer's model. Reads the draft as plain text (mentions stay `@text`,
 * attachments are not read), and replaces the draft automatically once the
 * model returns (no confirmation step). Never sends the prompt; the user
 * reviews and sends. The rewritten prompt always uses a fixed four-section
 * structure (Goal / Context / Constraints / Output Requirements).
 *
 * Triggers and safety nets:
 * - `/enhance` slash / palette command and an "Enhance" pill button;
 * - structured output: the rewrite always uses fixed sections
 *   (Goal / Context / Constraints / Output Requirements);
 * - output language control (follow the draft / Chinese / English), remembered;
 * - an "Undo" pill and `/enhance-undo` restore the pre-enhance draft (last run
 *   only, in the session it was enhanced);
 * - the whole run is bound to the session it started in: if the user switches
 *   sessions while it runs, the finished result is kept per-session and
 *   delivered when the user returns to the original session (never written
 *   into another session's draft);
 * - replacement is fully automatic: no confirmation dialog; undo (toast
 *   action / pill / command) is the safety net;
 * - failures surface the underlying reason in the toast.
 */

export type Language = "auto" | "zh" | "en";

const Prefs = Schema.Struct({
  language: Schema.Literals(["auto", "zh", "en"]),
});

/** Extracts a human-readable reason from anything thrown (ClientError, declared API error, plain Error, string). */
export function errorMessage(e: unknown): string {
  const raw =
    e instanceof Error
      ? (e.message ?? "").trim() || e.name
      : typeof e === "string"
        ? e.trim()
        : e === undefined || e === null
          ? "unknown error"
          : String(e ?? "");
  const oneLine = raw.replace(/\s+/g, " ");
  return oneLine.length > 200 ? `${oneLine.slice(0, 197)}…` : oneLine;
}

/** Pure prompt builder: draft + language → structured model prompt. */
export function buildPrompt(draft: string, language: Language = "auto"): string {
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
  lines.push(
    "Structure the rewritten prompt with exactly these four sections, in this order, each starting with its header on its own line:",
    "## Goal",
    "## Context",
    "## Constraints",
    "## Output Requirements",
    "Fill each section with concise prose or bullets; omit a section's content only when it genuinely does not apply, leaving its header in place.",
  );
  lines.push(
    "Return only the rewritten prompt (the four sections above), with no preamble, commentary, or code fences.",
  );
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
      "enhance.held": "Enhanced — it will be delivered when you return to the original session.",
      "enhance.delivered": "Enhanced prompt delivered.",
      "enhance.delivered.description": "The draft you enhanced before switching has been restored here.",
      "enhance.switched": "You switched sessions while enhancing — the result was discarded to protect the other draft.",
      "enhance.done": "Prompt enhanced.",
      "enhance.undo.title": "Undo enhance",
      "enhance.undo.description": "Restore the draft from before the last enhancement.",
      "enhance.undo.pill": "Undo",
      "enhance.undo.done": "Draft restored.",
      "enhance.undo.empty": "Nothing to undo — no enhancement in this session yet.",
      "enhance.undo.wrong-session": "This undo belongs to another session — switch back to it first.",
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
      "enhance.held": "已增强——切回原会话时会自动放入那个对话框。",
      "enhance.delivered": "增强结果已送达。",
      "enhance.delivered.description": "你切换会话前增强的草稿已恢复到这里。",
      "enhance.switched": "增强期间切换了会话——结果已丢弃，以免写进别的对话框。",
      "enhance.done": "提示词已增强。",
      "enhance.undo.title": "撤销增强",
      "enhance.undo.description": "恢复最近一次增强前的草稿。",
      "enhance.undo.pill": "撤销",
      "enhance.undo.done": "草稿已恢复。",
      "enhance.undo.empty": "没有可撤销的增强——本次会话还没有增强过。",
      "enhance.undo.wrong-session": "这条撤销属于另一个会话——请先切回那个会话。",
    },
  },
  stores: {
    prefs: Store.global(Prefs, { language: "auto" as Language }),
  },
  setup(ctx) {
    const [busy, setBusy] = createSignal(false);
    let lastOriginal: string | undefined;
    let lastOriginalKey: string | undefined;
    // Results finished while the user was in another session, keyed by the
    // session they belong to. Delivered when that session is routed again.
    const pending = new Map<string, { original: string; enhanced: string }>();

    // Watch the routed session: whenever it changes (or returns to a session
    // with a pending result), deliver that session's stored result.
    createKeyed(
      () => ctx.sessions.current()?.key,
      (key) => {
        const held = pending.get(key);
        if (held === undefined) return;
        pending.delete(key);
        const composer = ctx.screen.current()?.composer;
        if (composer === undefined) {
          // Screen not mounted (e.g. Home): put it back for the next visit.
          pending.set(key, held);
          return;
        }
        lastOriginal = held.original;
        lastOriginalKey = key;
        composer.setText(held.enhanced);
        ctx.toast.show({
          title: ctx.t("enhance.delivered"),
          description: ctx.t("enhance.delivered.description"),
          variant: "success",
          actions: [{ label: ctx.t("enhance.undo.pill"), run: () => void undo() }],
        });
      },
    );

    const enhance = async () => {
      if (busy()) return;
      setBusy(true);
      try {
        // Bind the whole run to the session it starts in: the screen's composer
        // follows whatever session is routed, so every write below must be
        // guarded by this key (see the checks before setText).
        const sessionKey = ctx.sessions.current()?.key;
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
        const prefs = ctx.stores.prefs;
        const generated = await ctx.client.experimental.generate.text({
          prompt: buildPrompt(draft, prefs.value.language),
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
        // Session changed while the model ran: hold the result for the original
        // session instead of writing into the other session's draft.
        if (ctx.sessions.current()?.key !== sessionKey) {
          if (sessionKey !== undefined) {
            pending.set(sessionKey, { original: draft, enhanced });
            ctx.toast.show({ title: ctx.t("enhance.held"), variant: "default" });
          }
          return;
        }
        // Auto-replace: no confirmation dialog. The session guard above is the
        // safety net; undo (toast action / pill / command) covers regret.
        lastOriginal = draft;
        lastOriginalKey = sessionKey;
        composer?.setText(enhanced);
        ctx.toast.show({
          title: ctx.t("enhance.done"),
          variant: "success",
          actions: [{ label: ctx.t("enhance.undo.pill"), run: () => void undo() }],
        });
      } catch (e) {
        ctx.toast.show({
          title: ctx.t("enhance.failed"),
          description: errorMessage(e),
          variant: "error",
        });
      } finally {
        setBusy(false);
      }
    };

    const undo = async () => {
      if (lastOriginal === undefined) {
        ctx.toast.show({ title: ctx.t("enhance.undo.empty"), variant: "default" });
        return;
      }
      if (ctx.sessions.current()?.key !== lastOriginalKey) {
        ctx.toast.show({ title: ctx.t("enhance.undo.wrong-session"), variant: "error" });
        return;
      }
      const composer = ctx.screen.current()?.composer;
      composer?.setText(lastOriginal);
      lastOriginal = undefined;
      lastOriginalKey = undefined;
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
