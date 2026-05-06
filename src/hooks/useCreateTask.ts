import { useCallback, useMemo, useRef, useState } from "react";
import { createBatchJob } from "@/lib/api/batch-jobs";
import { getImportTaskDetail } from "@/lib/api/import-tasks";
import type {
  CreateBatchJobPayload,
  FunctionalCapability,
  ImportParseMode,
  ImportTaskSubmitMode,
  ModelOption,
  PortraitBackgroundMode,
  PromptSourceMode,
} from "@/lib/api/image-workflow.types";
import { getModelOptions } from "@/lib/api/model-options";
import { useImportTask } from "./useImportTask";

export function useCreateTask(callbacks: {
  onJobCreated: (jobId: string) => void;
  refreshJobs: () => Promise<void>;
}) {
  const [capability, setCapability] = useState<FunctionalCapability>("PORTRAIT");
  const [taskName, setTaskName] = useState("");
  const [folderName, setFolderName] = useState("batch-output");
  const [textInput, setTextInput] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [dedupe, setDedupe] = useState(false);
  const [parseMode, setParseMode] = useState<ImportParseMode>("auto");
  const [importTab, setImportTab] = useState<"text" | "file">("text");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [portraitCount, setPortraitCount] = useState(1);
  const [portraitNegative, setPortraitNegative] = useState("");
  const [portraitSeed, setPortraitSeed] = useState("");
  const [portraitModelKey, setPortraitModelKey] = useState("");
  const [portraitModelOptions, setPortraitModelOptions] = useState<ModelOption[]>([]);
  const [portraitBackgroundMode, setPortraitBackgroundMode] = useState<PortraitBackgroundMode>("scene");

  const [threeModelKey, setThreeModelKey] = useState("");
  const [threeModelOptions, setThreeModelOptions] = useState<ModelOption[]>([]);
  const [threeSize, setThreeSize] = useState("1920x1080");
  const [threeResolution, setThreeResolution] = useState("4K");
  const [threeNegative, setThreeNegative] = useState("");
  const [threeSeed, setThreeSeed] = useState("");

  const [submitLoading, setSubmitLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [styleKey, setStyleKey] = useState<string | null>(null);

  const importTask = useImportTask();

  const buildParams = useCallback(() => {
    if (capability === "PORTRAIT") {
      const modelKey = portraitModelKey.trim();
      return {
        ...(modelKey ? { model_key: modelKey } : {}),
        background_mode: portraitBackgroundMode,
        count: portraitCount,
        negative_prompt: portraitNegative || undefined,
        seed: portraitSeed ? Number(portraitSeed) : undefined,
      };
    }
    if (capability === "THREE_VIEW") {
      const modelKey = threeModelKey.trim();
      return {
        ...(modelKey ? { model_key: modelKey } : {}),
        size: threeSize,
        resolution: threeResolution,
        negative_prompt: threeNegative || undefined,
        seed: threeSeed ? Number(threeSeed) : undefined,
      };
    }
    return {};
  }, [capability, portraitBackgroundMode, portraitCount, portraitNegative, portraitSeed, portraitModelKey, threeModelKey, threeNegative, threeResolution, threeSeed, threeSize]);

  const loadModelOptions = useCallback(async () => {
    if (capability === "THREE_VIEW") {
      try {
        const models = await getModelOptions("THREE_VIEW");
        setThreeModelOptions(models);
        const defaultModel = models.find((x) => x.isDefault)?.modelKey ?? models[0]?.modelKey ?? "";
        setThreeModelKey((prev) => (prev && models.some((x) => x.modelKey === prev) ? prev : defaultModel));
      } catch (err) {
        setThreeModelOptions([]);
        setThreeModelKey("");
        setErrorText(err instanceof Error ? err.message : "加载模型列表失败");
      }
      return;
    }
    if (capability === "PORTRAIT") {
      try {
        const models = await getModelOptions("PORTRAIT");
        setPortraitModelOptions(models);
        const defaultModel = models.find((x) => x.isDefault)?.modelKey ?? models[0]?.modelKey ?? "";
        setPortraitModelKey((prev) => (prev && models.some((x) => x.modelKey === prev) ? prev : defaultModel));
      } catch (err) {
        setPortraitModelOptions([]);
        setPortraitModelKey("");
        setErrorText(err instanceof Error ? err.message : "加载模型列表失败");
      }
    }
  }, [capability]);

  const resolveImportSourceMode = useCallback((): "text" | "file" | null => {
    if (uploadFile) return "file";
    if (textInput.trim().length > 0) return "text";
    return null;
  }, [textInput, uploadFile]);

  const submitAsyncImportTask = useCallback(
    async (mode: "text" | "file", submitMode: ImportTaskSubmitMode) => {
      if (mode === "file" && !uploadFile) {
        setErrorText("请先选择文件");
        return;
      }
      if (mode === "text" && textInput.trim().length === 0) {
        setErrorText("请先输入文本");
        return;
      }

      setErrorText("");
      if (submitMode === "CREATE_BATCH") {
        setSubmitLoading(true);
      }

      try {
        const formData = new FormData();
        if (mode === "text") {
          formData.append("text", textInput);
        } else if (uploadFile) {
          formData.append("file", uploadFile);
        }
        formData.append("dedupe", dedupe ? "true" : "false");
        formData.append("parse_mode", parseMode);
        formData.append("submit_mode", submitMode);
        if (styleKey) {
          formData.append("style_key", styleKey);
        }
        if (submitMode === "CREATE_BATCH") {
          formData.append("task_name", taskName);
          formData.append("folder_name", folderName.trim() || "batch-output");
          formData.append("capability", capability);
          formData.append("params", JSON.stringify(buildParams()));
        }

        const created = await importTask.submitImportTask(formData);
        if (created && submitMode === "CREATE_BATCH") {
          // Poll once to check if batch_job_id is ready
          const pollForBatch = async (taskId: string, retries = 10) => {
            for (let i = 0; i < retries; i++) {
              await new Promise((r) => setTimeout(r, 2000));
              try {
                const detail = await getImportTaskDetail(taskId);
                if (detail.batch_job_id) {
                  callbacks.onJobCreated(detail.batch_job_id);
                  await callbacks.refreshJobs();
                  return;
                }
                if (detail.status === "BATCH_CREATE_FAILED" || detail.status === "PARSE_FAILED") {
                  return;
                }
              } catch {
                // continue polling
              }
            }
          };
          void pollForBatch(created.import_task_id);
        }
      } catch (err) {
        setErrorText(
          err instanceof Error
            ? err.message
            : submitMode === "PARSE_ONLY"
              ? "解析任务提交失败"
              : "创建任务提交失败",
        );
      } finally {
        setSubmitLoading(false);
      }
    },
    [uploadFile, textInput, dedupe, parseMode, styleKey, taskName, folderName, capability, buildParams, importTask, callbacks],
  );

  const submitBatch = useCallback(async (sourcePortraitIds: string[] = []) => {
    const shouldCreateFromPortraits = capability === "THREE_VIEW" && sourcePortraitIds.length > 0;
    if (shouldCreateFromPortraits) {
      setErrorText("");
      setSubmitLoading(true);
      try {
        const payload = {
          task_name: taskName || undefined,
          folder_name: folderName.trim() || "batch-output",
          capability,
          source_type: "text" as const,
          dedupe,
          prompts: [],
          source_portrait_ids: sourcePortraitIds,
          params: buildParams(),
          style_key: styleKey,
        } satisfies CreateBatchJobPayload;

        const data = await createBatchJob(payload);
        await callbacks.refreshJobs();
        callbacks.onJobCreated(data.id);
      } catch (err) {
        setErrorText(err instanceof Error ? err.message : "提交任务失败");
      } finally {
        setSubmitLoading(false);
      }
      return;
    }
    if (capability === "THREE_VIEW") {
      setErrorText("三视图必须从已选定的定妆照创建，请先选择定妆照作为来源。");
      return;
    }

    if (importTask.prompts.length === 0) {
      const mode = resolveImportSourceMode();
      if (!mode) {
        setErrorText("请先输入文本或选择文件");
        return;
      }
      await submitAsyncImportTask(mode, "CREATE_BATCH");
      return;
    }
    setErrorText("");
    setSubmitLoading(true);
    try {
      const payload = {
        task_name: taskName || undefined,
        folder_name: folderName.trim() || "batch-output",
        capability,
        source_type: importTask.parseResult?.source_type ?? "text",
        dedupe,
        prompts: importTask.prompts,
        params: buildParams(),
        style_key: styleKey,
      } satisfies CreateBatchJobPayload;

      const data = await createBatchJob(payload);
      await callbacks.refreshJobs();
      callbacks.onJobCreated(data.id);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "提交任务失败");
    } finally {
      setSubmitLoading(false);
    }
  }, [importTask.prompts, importTask.parseResult, resolveImportSourceMode, submitAsyncImportTask, taskName, folderName, capability, dedupe, buildParams, styleKey, callbacks]);

  const sourceModeStats = useMemo(() => {
    return importTask.prompts.reduce<Record<PromptSourceMode, number>>(
      (acc, item) => {
        const key = item.prompt_blocks?.source_mode ?? "template";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      { template: 0 },
    );
  }, [importTask.prompts]);

  const canSubmitCreate =
    capability === "THREE_VIEW"
      ? false
      : importTask.prompts.length > 0 || resolveImportSourceMode() !== null;

  return {
    // Capability
    capability,
    setCapability,
    // Task name / folder
    taskName,
    setTaskName,
    folderName,
    setFolderName,
    // Import tab
    importTab,
    setImportTab,
    textInput,
    setTextInput,
    uploadFile,
    setUploadFile,
    fileInputRef,
    dedupe,
    setDedupe,
    parseMode,
    setParseMode,
    // Portrait params
    portraitCount,
    setPortraitCount,
    portraitNegative,
    setPortraitNegative,
    portraitSeed,
    setPortraitSeed,
    portraitModelKey,
    setPortraitModelKey,
    portraitModelOptions,
    portraitBackgroundMode,
    setPortraitBackgroundMode,
    // Three-view params
    threeModelKey,
    setThreeModelKey,
    threeModelOptions,
    threeSize,
    setThreeSize,
    threeResolution,
    setThreeResolution,
    threeNegative,
    setThreeNegative,
    threeSeed,
    setThreeSeed,
    // Model loading
    loadModelOptions,
    // Style
    styleKey,
    setStyleKey,
    // Import task
    importTask,
    // Submit
    submitLoading,
    submitBatch,
    submitAsyncImportTask,
    canSubmitCreate,
    resolveImportSourceMode,
    // Error
    errorText,
    setErrorText,
    // Stats
    sourceModeStats,
  };
}
