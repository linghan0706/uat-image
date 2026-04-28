"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useCreateTask } from "@/hooks/useCreateTask";
import { ImportSection } from "./ImportSection";
import { CapabilitySelector } from "./CapabilitySelector";
import { PortraitParams } from "./PortraitParams";
import { ThreeViewParams } from "./ThreeViewParams";
import { PromptPreview } from "./PromptPreview";
import { ImportTaskStatus } from "./ImportTaskStatus";
import { SelectedPortraitSourcePanel } from "./SelectedPortraitSourcePanel";
import { StyleSelector } from "./StyleSelector";

function PanelSection({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-cyan-400/80">{eyebrow}</div>
        <h3 className="mt-1 text-sm font-semibold text-zinc-100">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function CreateTaskForm() {
  const {
    refreshJobs,
    setSelectedJobId,
    setPanelMode,
    selectedPortraitImages,
    characterNameByItemId,
  } = useWorkspace();
  const [excludedSourcePortraitIds, setExcludedSourcePortraitIds] = useState<Set<string>>(() => new Set());

  const task = useCreateTask({
    onJobCreated: (jobId) => {
      setSelectedJobId(jobId);
      setPanelMode("detail");
    },
    refreshJobs,
  });

  const { loadModelOptions } = task;

  useEffect(() => {
    void loadModelOptions();
  }, [loadModelOptions]);

  const activeSourcePortraitIds = useMemo(
    () => selectedPortraitImages
      .filter((image) => !excludedSourcePortraitIds.has(image.id))
      .map((image) => image.id),
    [excludedSourcePortraitIds, selectedPortraitImages],
  );
  const hasSelectedPortraitSources = task.capability === "THREE_VIEW" && selectedPortraitImages.length > 0;
  const createFromPortraitSources = task.capability === "THREE_VIEW" && activeSourcePortraitIds.length > 0;
  // 解析结果存在被丢弃的行时（如 missing_character_profile / placeholder_name_rejected），
  // 这些行不会进入最终提交的 prompts；放任用户继续提交会造成"少了几个人物而不自知"，
  // 下游三视图阶段才弹出 character_profile 缺失错误。这里在提交阶段硬阻塞。
  // 走 source_portrait_ids 的三视图链路无需依赖 parseResult，豁免此规则。
  const parseErrorsCount = task.importTask.parseResult?.errors.length ?? 0;
  const blockedByParseErrors = !createFromPortraitSources && parseErrorsCount > 0;
  const blockedByMissingScene = !createFromPortraitSources && task.missingSceneDescriptionCount > 0;
  const canSubmitCreate = (task.canSubmitCreate || createFromPortraitSources) && !blockedByParseErrors && !blockedByMissingScene;
  const submitLabel = task.submitLoading
    ? "提交中..."
    : blockedByParseErrors
      ? `请先修复 ${parseErrorsCount} 行解析错误`
      : blockedByMissingScene
        ? `请补全 ${task.missingSceneDescriptionCount} 条场景描述`
      : createFromPortraitSources
        ? `创建三视图（${activeSourcePortraitIds.length} 张定妆照）`
        : task.importTask.prompts.length > 0
          ? `创建批任务（${task.importTask.prompts.length} 条）`
          : "开始创建批任务";

  return (
    <div className="space-y-3 p-3">
      {task.errorText && (
        <div className="rounded-lg border border-rose-400/25 bg-rose-500/10 p-2.5 text-sm text-rose-200">
          {task.errorText}
          <button
            type="button"
            className="ml-2 text-xs text-rose-300 underline"
            onClick={() => task.setErrorText("")}
          >
            关闭
          </button>
        </div>
      )}

      <PanelSection eyebrow="01 setup" title="任务信息">
        <div className="grid grid-cols-1 gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-zinc-400">任务名称</span>
          <input
            className="h-10 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10"
            value={task.taskName}
            onChange={(e) => task.setTaskName(e.target.value)}
            placeholder="可选，用于识别任务"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-zinc-400">Nas 子文件夹名称</span>
          <input
            className="h-10 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10"
            value={task.folderName}
            onChange={(e) => task.setFolderName(e.target.value)}
            placeholder="用于归档输出目录"
          />
        </label>
        </div>
      </PanelSection>

      <PanelSection eyebrow="02 mode" title="生成能力">
        <CapabilitySelector
          value={task.capability}
          onChange={(cap) => task.setCapability(cap)}
        />
      </PanelSection>

      <PanelSection eyebrow="03 style" title="美术风格">
        <StyleSelector value={task.styleKey} onChange={task.setStyleKey} />
      </PanelSection>

      <PanelSection eyebrow="04 input" title="输入来源">
        {hasSelectedPortraitSources && (
          <SelectedPortraitSourcePanel
            images={selectedPortraitImages}
            characterNameByItemId={characterNameByItemId}
            excludedIds={excludedSourcePortraitIds}
            onRemove={(imageId) => {
              setExcludedSourcePortraitIds((prev) => new Set(prev).add(imageId));
            }}
            onRestoreAll={() => setExcludedSourcePortraitIds(new Set())}
          />
        )}
        {task.capability === "THREE_VIEW" && !createFromPortraitSources && (
          <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
            三视图只能从已选定的定妆照生成。请先在结果中选择定妆照，再回到这里创建三视图。
          </div>
        )}
        {task.capability === "PORTRAIT" && (!hasSelectedPortraitSources || activeSourcePortraitIds.length === 0) && (
          <ImportSection
            importTab={task.importTab}
            setImportTab={task.setImportTab}
            textInput={task.textInput}
            setTextInput={task.setTextInput}
            uploadFile={task.uploadFile}
            setUploadFile={task.setUploadFile}
            fileInputRef={task.fileInputRef}
            dedupe={task.dedupe}
            setDedupe={task.setDedupe}
            parseLoading={task.importTask.parseLoading}
            onParseText={() => void task.submitAsyncImportTask("text", "PARSE_ONLY")}
            onParseFile={() => void task.submitAsyncImportTask("file", "PARSE_ONLY")}
          />
        )}
      </PanelSection>

      {task.importTask.importTaskDetail && (
        <ImportTaskStatus detail={task.importTask.importTaskDetail} />
      )}

      <PanelSection eyebrow="05 params" title="生成参数">
        {task.capability === "PORTRAIT" && (
          <PortraitParams
            count={task.portraitCount}
            setCount={task.setPortraitCount}
            backgroundMode={task.portraitBackgroundMode}
            setBackgroundMode={task.setPortraitBackgroundMode}
            negative={task.portraitNegative}
            setNegative={task.setPortraitNegative}
            seed={task.portraitSeed}
            setSeed={task.setPortraitSeed}
            modelKey={task.portraitModelKey}
            setModelKey={task.setPortraitModelKey}
            modelOptions={task.portraitModelOptions}
          />
        )}
        {task.capability === "THREE_VIEW" && (
          <ThreeViewParams
            modelKey={task.threeModelKey}
            setModelKey={task.setThreeModelKey}
            modelOptions={task.threeModelOptions}
            size={task.threeSize}
            setSize={task.setThreeSize}
            negative={task.threeNegative}
            setNegative={task.setThreeNegative}
            seed={task.threeSeed}
            setSeed={task.setThreeSeed}
          />
        )}
      </PanelSection>

      {task.importTask.parseResult && (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-zinc-300">
          <div className="flex flex-wrap items-center gap-3">
            <span>来源: {task.importTask.parseResult.source_type}</span>
            <span>原始: {task.importTask.parseResult.raw_count}</span>
            <span className="text-emerald-300">有效: {task.importTask.parseResult.valid_count}</span>
            <span className="text-rose-300">错误: {task.importTask.parseResult.invalid_count}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-cyan-300">模板: {task.sourceModeStats.template}</span>
          </div>
          {task.importTask.parseResult.errors.length > 0 && (
            <div className="mt-2 max-h-32 overflow-auto rounded-lg border border-rose-400/25 bg-rose-500/10 p-2 text-xs text-rose-200">
              <div className="mb-1 text-sm font-semibold text-rose-100">
                有 {task.importTask.parseResult.errors.length} 行解析失败，提交已被阻止
              </div>
              <div className="mb-2 text-[11px] text-rose-300/80">
                这些行不会进入最终提交。请先手工编辑源文本补全姓名/性别/角色档案，或移除这些行后重新解析。
              </div>
              {task.importTask.parseResult.errors.slice(0, 40).map((err) => (
                <div key={`${err.line_no}-${err.reason}`}>
                  行 {err.line_no}: {err.reason}
                </div>
              ))}
            </div>
          )}
          {blockedByMissingScene && (
            <div className="mt-2 rounded-lg border border-amber-400/25 bg-amber-400/10 p-2 text-xs leading-5 text-amber-100">
              CSV/XLSX 的场景背景模式要求每条定妆照都有场景描述。请补全“场景描述”列后重新解析。
            </div>
          )}
        </div>
      )}

      <PanelSection eyebrow="06 prompt" title="Prompt 预览">
        {createFromPortraitSources ? (
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm leading-6 text-cyan-100">
            三视图 Prompt 将由服务端根据所选定妆照的原始角色设定自动生成，并绑定来源定妆照。
          </div>
        ) : task.capability === "PORTRAIT" ? (
          <PromptPreview
            prompts={task.importTask.prompts}
            onUpdatePrompt={task.importTask.updatePromptRow}
            onRemovePrompt={task.importTask.removePromptRow}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-zinc-500">
            三视图不接收文本 Prompt；最终 Prompt 只由固定三视图模板和来源定妆照参考图组成。
          </div>
        )}
        {task.capability === "PORTRAIT" && !createFromPortraitSources && task.importTask.prompts.length === 0 && (
          <div className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-zinc-500">
            解析文本或文件后，可在这里审阅并微调最终 Prompt。
          </div>
        )}
      </PanelSection>

      <button
        type="button"
        className="sticky bottom-3 h-11 w-full rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-zinc-950 shadow-xl shadow-cyan-950/30 transition-colors hover:bg-cyan-300 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
        disabled={task.submitLoading || !canSubmitCreate}
        onClick={() => void task.submitBatch(activeSourcePortraitIds)}
      >
        {submitLabel}
      </button>
    </div>
  );
}
