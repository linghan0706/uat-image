import { useCallback, useEffect, useRef, useState } from "react";
import { createImportTask, getImportTaskDetail } from "@/lib/api/import-tasks";
import type { ImportTaskDetail, ParseResult, PromptRow } from "@/lib/api/image-workflow.types";
import { TERMINAL_IMPORT_STATUSES } from "@/lib/constants";

export function useImportTask() {
  const [importTaskId, setImportTaskId] = useState<string | null>(null);
  const [importTaskDetail, setImportTaskDetail] = useState<ImportTaskDetail | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [parseLoading, setParseLoading] = useState(false);
  const importPollingRef = useRef<number | null>(null);
  const importTaskStatusRef = useRef<string>("");

  const syncImportTaskResult = useCallback((task: ImportTaskDetail) => {
    if (!task.result_payload) return;
    setParseResult(task.result_payload);
    setPrompts(task.result_payload.prompts);
  }, []);

  const loadImportTask = useCallback(
    async (taskIdOverride?: string) => {
      const targetTaskId = taskIdOverride ?? importTaskId;
      if (!targetTaskId) return;
      try {
        const detail = await getImportTaskDetail(targetTaskId);
        setImportTaskDetail(detail);
        if (detail.result_payload) {
          syncImportTaskResult(detail);
        }
        return detail;
      } catch {
        // silently handle
        return null;
      }
    },
    [importTaskId, syncImportTaskResult],
  );

  useEffect(() => {
    importTaskStatusRef.current = importTaskDetail?.status ?? "";
  }, [importTaskDetail]);

  useEffect(() => {
    if (!importTaskId) return;

    const immediateTimer = window.setTimeout(() => {
      void loadImportTask(importTaskId);
    }, 0);
    if (importPollingRef.current) {
      window.clearInterval(importPollingRef.current);
    }
    importPollingRef.current = window.setInterval(() => {
      if (!TERMINAL_IMPORT_STATUSES.has(importTaskStatusRef.current)) {
        void loadImportTask(importTaskId);
      }
    }, document.hidden ? 15_000 : 1_500);

    return () => {
      window.clearTimeout(immediateTimer);
      if (importPollingRef.current) {
        window.clearInterval(importPollingRef.current);
      }
    };
  }, [importTaskId, loadImportTask]);

  const submitImportTask = useCallback(
    async (formData: FormData) => {
      setParseLoading(true);
      setParseResult(null);
      setPrompts([]);
      setImportTaskDetail(null);
      try {
        const created = await createImportTask(formData);
        setImportTaskId(created.import_task_id);
        await loadImportTask(created.import_task_id);
        return created;
      } finally {
        setParseLoading(false);
      }
    },
    [loadImportTask],
  );

  const updatePromptRow = useCallback((index: number, prompt: string) => {
    setPrompts((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, prompt, source_mode: "custom" as const } : item,
      ),
    );
  }, []);

  const removePromptRow = useCallback((index: number) => {
    setPrompts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    importTaskId,
    importTaskDetail,
    parseResult,
    prompts,
    parseLoading,
    submitImportTask,
    updatePromptRow,
    removePromptRow,
    setPrompts,
  };
}
