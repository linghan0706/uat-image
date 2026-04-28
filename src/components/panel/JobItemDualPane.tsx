"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { JobDetail, JobItem, PromptRow } from "@/lib/api/image-workflow.types";
import { createBatchJob } from "@/lib/api/batch-jobs";
import { deriveCharacterNameFromProfileInput, isPlaceholderName } from "@/lib/prompt/character-profile";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { sourceModeLabel } from "@/lib/format";
import { IconClose, IconEdit, IconInfo, IconRefresh } from "@/components/icons";

interface JobItemDualPaneProps {
  items: JobItem[];
  jobDetail: JobDetail;
}

const getDisplayCharacterName = (item: JobItem) => {
  const derived = deriveCharacterNameFromProfileInput(item.character_profile, item.prompt);
  if (derived) return derived;
  const raw = item.character_name?.trim();
  return raw && !isPlaceholderName(raw) ? raw : null;
};

const formatGender = (gender: "male" | "female" | "nonbinary" | "unknown" | undefined | null) => {
  switch (gender) {
    case "male":
      return "男";
    case "female":
      return "女";
    case "nonbinary":
      return "非二元";
    default:
      return "";
  }
};

function PromptBlock({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "neutral" | "role";
  value?: string | null;
}) {
  if (!value) return null;

  return (
    <div
      className={`rounded-lg border p-3.5 ${
        tone === "role"
          ? "border-violet-400/25 bg-violet-400/10"
          : "border-white/10 bg-zinc-950"
      }`}
    >
      <div className={tone === "role" ? "text-xs font-semibold text-violet-200" : "text-xs font-semibold text-zinc-300"}>
        {label}
      </div>
      <div className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-zinc-400">
        {value}
      </div>
    </div>
  );
}

export function JobItemDualPane({ items, jobDetail }: JobItemDualPaneProps) {
  const { refreshJobs, setSelectedJobId, setPanelMode, setErrorText } = useWorkspace();

  const [editedPrompts, setEditedPrompts] = useState<Map<string, string>>(() => new Map());
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
  const [resubmitLoading, setResubmitLoading] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [promptEditor, setPromptEditor] = useState<{ itemId: string; value: string } | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  const activeItem = useMemo(
    () => items.find((item) => item.id === focusedItemId) ?? items[0] ?? null,
    [items, focusedItemId],
  );

  const getEditedPrompt = useCallback(
    (item: JobItem) => editedPrompts.get(item.id) ?? item.prompt,
    [editedPrompts],
  );

  const handlePromptChange = useCallback((itemId: string, value: string) => {
    const originalPrompt = items.find((item) => item.id === itemId)?.prompt;
    setEditedPrompts((prev) => {
      const next = new Map(prev);
      if (value === originalPrompt) {
        next.delete(itemId);
      } else {
        next.set(itemId, value);
      }
      return next;
    });
  }, [items]);

  const openPromptEditor = useCallback(
    (item: JobItem) => {
      setPromptEditor({ itemId: item.id, value: getEditedPrompt(item) });
    },
    [getEditedPrompt],
  );

  const closePromptEditor = useCallback(() => {
    setPromptEditor(null);
  }, []);

  const savePromptEditor = useCallback(() => {
    if (!promptEditor) return;
    handlePromptChange(promptEditor.itemId, promptEditor.value);
    setPromptEditor(null);
  }, [handlePromptChange, promptEditor]);

  const toggleItemSelected = useCallback((itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      setSelectAll(next.size === items.length);
      return next;
    });
  }, [items.length]);

  const handleSelectAll = useCallback(() => {
    if (selectAll) {
      setSelectedItemIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedItemIds(new Set(items.map((item) => item.id)));
      setSelectAll(true);
    }
  }, [selectAll, items]);

  const selectedCount = selectedItemIds.size;

  const resubmitPrompts = useMemo<PromptRow[]>(() => {
    return items
      .filter((item) => selectedItemIds.has(item.id))
      .map((item) => ({
        line_no: item.line_no,
        prompt: getEditedPrompt(item),
        character_name: getDisplayCharacterName(item) ?? item.character_name,
        character_profile: item.character_profile ?? null,
        style_key: item.style_key ?? null,
        scene_description: item.scene_description ?? item.prompt_blocks?.scene_description ?? null,
        prompt_blocks: item.prompt_blocks ?? undefined,
      }));
  }, [items, selectedItemIds, getEditedPrompt]);

  const handleResubmit = useCallback(async () => {
    if (resubmitPrompts.length === 0) return;
    setResubmitLoading(true);
    try {
      const basePayload = {
        task_name: jobDetail.task_name ? `${jobDetail.task_name} (重提交)` : undefined,
        folder_name: jobDetail.folder_name || "batch-output",
        source_type: "text" as const,
        dedupe: false,
        params: jobDetail.params_snapshot ?? {},
      };
      const payload =
        jobDetail.capability === "THREE_VIEW"
          ? {
              ...basePayload,
              capability: "THREE_VIEW" as const,
              prompts: [] as [],
              source_portrait_ids: Array.from(
                new Set(
                  items
                    .filter((item) => selectedItemIds.has(item.id))
                    .map((item) => item.source_portrait_id)
                    .filter((id): id is string => Boolean(id)),
                ),
              ),
              style_key: null,
            }
          : {
              ...basePayload,
              capability: "PORTRAIT" as const,
              prompts: resubmitPrompts,
              style_key: resubmitPrompts.find((p) => p.style_key)?.style_key ?? null,
            };
      if (payload.capability === "THREE_VIEW" && payload.source_portrait_ids.length === 0) {
        throw new Error("三视图重提交需要原始定妆照来源。");
      }
      const data = await createBatchJob(payload);
      await refreshJobs();
      setSelectedJobId(data.id);
      setPanelMode("detail");
      setEditedPrompts(new Map());
      setSelectedItemIds(new Set());
      setSelectAll(false);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "重新提交失败");
    } finally {
      setResubmitLoading(false);
    }
  }, [resubmitPrompts, jobDetail, items, selectedItemIds, refreshJobs, setSelectedJobId, setPanelMode, setErrorText]);

  const activePrompt = activeItem ? getEditedPrompt(activeItem) : "";
  const activeIsEdited = activeItem ? editedPrompts.has(activeItem.id) : false;
  const promptEditorItem = promptEditor ? items.find((item) => item.id === promptEditor.itemId) ?? null : null;
  const promptEditorItemId = promptEditor?.itemId;
  const isPromptEditorOpen = promptEditor !== null;

  useEffect(() => {
    if (!promptEditorItemId) return;

    const frame = window.requestAnimationFrame(() => {
      promptTextareaRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [promptEditorItemId]);

  useEffect(() => {
    if (!isPromptEditorOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePromptEditor();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closePromptEditor, isPromptEditorOpen]);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
        暂无子任务
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-zinc-900/60 px-3 py-2">
        <div className="mr-auto">
          <div className="text-xs font-semibold text-zinc-200">Prompt 修改工作台</div>
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={selectAll}
            onChange={handleSelectAll}
            className="rounded border-white/10 bg-zinc-900"
          />
          全选
        </label>
        <span className="text-xs text-zinc-600">{selectedCount}/{items.length} 已选</span>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-cyan-400 px-3 text-xs font-semibold text-zinc-950 transition-colors hover:bg-cyan-300 disabled:bg-zinc-800 disabled:text-zinc-500"
          disabled={resubmitLoading || selectedCount === 0}
          onClick={() => void handleResubmit()}
        >
          <IconRefresh className="h-3.5 w-3.5" />
          {resubmitLoading ? "提交中..." : `重提交 ${selectedCount || ""}`}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[270px_minmax(0,1fr)] overflow-hidden 2xl:grid-cols-[300px_minmax(0,1fr)]">
        <section className="min-h-0 overflow-y-auto border-r border-white/10 bg-zinc-950/55 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold text-zinc-300">1. 条目与状态</div>
            <span className="text-[11px] text-zinc-600">{items.length} 项</span>
          </div>
          <div className="space-y-2">
            {items.map((item) => {
              const isActive = activeItem?.id === item.id;
              const isSelected = selectedItemIds.has(item.id);
              const isEdited = editedPrompts.has(item.id);

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full rounded-lg border p-2 text-left transition-colors ${
                    isActive
                      ? "border-cyan-400/45 bg-cyan-400/10"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20"
                  }`}
                  onClick={() => setFocusedItemId(item.id)}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(event) => {
                        event.stopPropagation();
                        toggleItemSelected(item.id);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      className="rounded border-white/10 bg-zinc-900"
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300">{item.item_no}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {getDisplayCharacterName(item) && (
                      <span className="max-w-full truncate rounded-md bg-violet-400/10 px-1.5 py-0.5 text-[11px] text-violet-300">
                        {getDisplayCharacterName(item)}
                      </span>
                    )}
                    {isEdited && (
                      <span className="rounded-md bg-amber-400/10 px-1.5 py-0.5 text-[11px] text-amber-300">
                        已修改
                      </span>
                    )}
                  </div>
                  {item.error_message && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-md border border-rose-400/20 bg-rose-500/10 p-2 text-[11px] leading-4 text-rose-200">
                      <IconInfo className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="line-clamp-3">{item.error_message}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="min-h-0 overflow-y-auto p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-zinc-300">2. 结构审阅与最终 Prompt</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className="truncate font-mono text-[11px] text-zinc-600">{activeItem?.item_no}</span>
                {activeItem && (
                  <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-500">
                    {sourceModeLabel[activeItem.source_mode]}
                  </span>
                )}
              </div>
            </div>
            {activeItem && (
              <div className="flex shrink-0 items-center gap-1.5">
                {activeIsEdited && (
                  <button
                    type="button"
                    className="rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                    onClick={() => {
                      setEditedPrompts((prev) => {
                        const next = new Map(prev);
                        next.delete(activeItem.id);
                        return next;
                      });
                    }}
                  >
                    还原
                  </button>
                )}
              </div>
            )}
          </div>

          {activeItem && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2.5">
                <PromptBlock label="P1 场景 / 构图" tone="neutral" value={activeItem.prompt_blocks?.part1} />
                <PromptBlock label="P2 风格 / 全局基础" tone="neutral" value={activeItem.prompt_blocks?.part2} />
                <PromptBlock label="P3 角色独有 / 核心设定" tone="role" value={activeItem.prompt_blocks?.part3} />
                <PromptBlock label="P4 参考 / 画风约束" tone="neutral" value={activeItem.prompt_blocks?.part4} />
                <PromptBlock label="场景背景" tone="neutral" value={activeItem.scene_description ?? activeItem.prompt_blocks?.scene_description} />
                <PromptBlock label="姓名" tone="role" value={activeItem.character_profile?.name} />
                <PromptBlock label="性别" tone="role" value={formatGender(activeItem.character_profile?.gender)} />
                <PromptBlock label="年龄段" tone="role" value={activeItem.character_profile?.age_band} />
                <PromptBlock label="身高体型" tone="role" value={activeItem.character_profile?.build} />
                <PromptBlock label="肤色" tone="role" value={activeItem.character_profile?.complexion} />
                <PromptBlock label="面部五官" tone="role" value={activeItem.character_profile?.face} />
                <PromptBlock label="发型发色" tone="role" value={activeItem.character_profile?.hair} />
                <PromptBlock label="服装造型" tone="role" value={activeItem.character_profile?.outfit} />
                <PromptBlock label="配饰道具" tone="role" value={activeItem.character_profile?.accessories} />
                <PromptBlock label="其它特征" tone="role" value={activeItem.character_profile?.extra_visual} />
              </div>

              <div className="rounded-lg border border-cyan-400/25 bg-cyan-400/5 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-cyan-200">最终 Prompt</div>
                    <div className="mt-0.5 text-[11px] text-zinc-600">实际重提交会使用这里的文本</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[11px] text-zinc-600">{activePrompt.length} 字符</span>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-2.5 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-200/50 hover:bg-cyan-400/20"
                      onClick={() => openPromptEditor(activeItem)}
                    >
                      <IconEdit className="h-3.5 w-3.5" />
                      编辑
                    </button>
                  </div>
                </div>
                <div className="max-h-52 overflow-y-auto rounded-lg border border-white/10 bg-zinc-950 px-3 py-2">
                  <div className="whitespace-pre-wrap font-mono text-xs leading-5 text-zinc-100">
                    {activePrompt || "暂无 Prompt"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {typeof document !== "undefined" && promptEditor && promptEditorItem ? createPortal((
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={closePromptEditor}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-editor-title"
            className="flex h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-cyan-400/25 bg-zinc-950 shadow-2xl shadow-black/70 sm:h-[82dvh] sm:max-h-[52rem]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <div id="prompt-editor-title" className="text-sm font-semibold text-zinc-100">
                  编辑最终 Prompt
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                  <span className="font-mono">{promptEditorItem.item_no}</span>
                  {getDisplayCharacterName(promptEditorItem) && (
                    <span className="rounded-md bg-violet-400/10 px-1.5 py-0.5 text-violet-300">
                      {getDisplayCharacterName(promptEditorItem)}
                    </span>
                  )}
                  <span>{promptEditor.value.length} 字符</span>
                </div>
              </div>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
                onClick={closePromptEditor}
                aria-label="关闭"
                title="关闭"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 p-4">
              <textarea
                ref={promptTextareaRef}
                className="h-full min-h-0 w-full resize-none rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 font-mono text-xs leading-6 text-zinc-100 outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10"
                value={promptEditor.value}
                onChange={(event) => {
                  const value = event.target.value;
                  setPromptEditor((prev) => (prev ? { ...prev, value } : prev));
                }}
              />
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
              <button
                type="button"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
                onClick={() => {
                  setPromptEditor((prev) => (prev ? { ...prev, value: promptEditorItem.prompt } : prev));
                }}
              >
                还原原文
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
                  onClick={closePromptEditor}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-cyan-300"
                  onClick={savePromptEditor}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      ), document.body) : null}
    </div>
  );
}
