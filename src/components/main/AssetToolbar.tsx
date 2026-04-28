"use client";

import { useWorkspace } from "@/contexts/WorkspaceContext";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { IconRefresh, IconDownload } from "@/components/icons";
import { CAPABILITY_DISPLAY } from "@/lib/constants";

export function AssetToolbar() {
  const {
    jobDetail,
    imageResults,
    jobItems,
    failedCount,
    retryFailed,
    createExport,
    actionLoading,
    selectedJobId,
  } = useWorkspace();

  if (!selectedJobId || !jobDetail) {
    return (
      <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-5">
        <div>
          <div className="text-sm font-semibold text-zinc-200">Creation Feed</div>
          <div className="mt-0.5 text-xs text-zinc-500">选择左侧任务开始审阅生成结果</div>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-white/10 bg-zinc-950/70 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-zinc-100">
              {jobDetail.task_name || jobDetail.job_no}
            </h2>
            <StatusBadge status={jobDetail.status} />
            <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-xs text-zinc-400 ring-1 ring-white/10">
              {CAPABILITY_DISPLAY[jobDetail.capability] ?? jobDetail.capability}
            </span>
          </div>
          <div className="mt-1 truncate font-mono text-xs text-zinc-600">{jobDetail.job_no}</div>
        </div>

        <div className="hidden grid-cols-2 gap-2 sm:grid">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[11px] text-zinc-500">图片</div>
            <div className="text-sm font-semibold text-zinc-100">{imageResults.length}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[11px] text-zinc-500">子任务</div>
            <div className="text-sm font-semibold text-zinc-100">{jobItems.length}</div>
          </div>
        </div>

        <div className="flex gap-1.5">
          {failedCount > 0 && (
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-500/15 disabled:opacity-50"
              disabled={actionLoading}
              onClick={() => void retryFailed()}
            >
              <IconRefresh className="h-3.5 w-3.5" />
              重试失败 ({failedCount})
            </button>
          )}
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
            disabled={actionLoading}
            onClick={() => void createExport()}
          >
            <IconDownload className="h-3.5 w-3.5" />
            导出 ZIP
          </button>
        </div>
      </div>

      <div className="px-5 pb-3">
        <ProgressBar
          success={jobDetail.success_count}
          failed={jobDetail.failed_count}
          total={jobDetail.total_count}
        />
      </div>
    </div>
  );
}
