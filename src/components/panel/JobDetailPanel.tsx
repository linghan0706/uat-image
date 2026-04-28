"use client";

import { useWorkspace } from "@/contexts/WorkspaceContext";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { IconDownload, IconRefresh, IconWarning } from "@/components/icons";
import { CAPABILITY_DISPLAY } from "@/lib/constants";
import { formatDateTime, formatDuration } from "@/lib/format";
import { JobItemDualPane } from "./JobItemDualPane";

export function JobDetailPanel() {
  const {
    jobDetail,
    jobItems,
    failedCount,
    retryFailed,
    createExport,
    actionLoading,
    selectedJobId,
  } = useWorkspace();

  if (!selectedJobId || !jobDetail) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-zinc-500">
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
        <span className="text-sm">从左侧选择任务查看详情</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-3 border-b border-white/10 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={jobDetail.status} />
          <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-xs text-zinc-400 ring-1 ring-white/10">
            {CAPABILITY_DISPLAY[jobDetail.capability] ?? jobDetail.capability}
          </span>
          {jobDetail.task_name && (
            <span className="min-w-0 truncate text-sm font-medium text-zinc-100">{jobDetail.task_name}</span>
          )}
          <span className="ml-auto truncate font-mono text-xs text-zinc-600">{jobDetail.job_no}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span>目录: {jobDetail.folder_name || "-"}</span>
          <span>创建: {formatDateTime(jobDetail.created_at)}</span>
          <span>用时: {formatDuration(jobDetail.started_at, jobDetail.finished_at)}</span>
          <span>
            导出: <StatusBadge status={jobDetail.export_status} />
            {jobDetail.export_file?.download_url && (
              <a
                className="ml-1 inline-flex items-center gap-0.5 text-cyan-300 underline hover:text-cyan-200"
                href={jobDetail.export_file.download_url}
              >
                <IconDownload className="h-3 w-3" />
                下载
              </a>
            )}
          </span>
        </div>

        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
              <span>生成进度</span>
              <span>{jobDetail.success_count + jobDetail.failed_count} / {jobDetail.total_count}</span>
            </div>
            <ProgressBar
              success={jobDetail.success_count}
              failed={jobDetail.failed_count}
              total={jobDetail.total_count}
            />
          </div>
          <div className="flex shrink-0 gap-1.5">
            {failedCount > 0 && (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-500/15 disabled:opacity-50"
                disabled={actionLoading}
                onClick={() => void retryFailed()}
              >
                <IconRefresh className="h-3.5 w-3.5" />
                重试 ({failedCount})
              </button>
            )}
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
              disabled={actionLoading}
              onClick={() => void createExport()}
            >
              <IconDownload className="h-3.5 w-3.5" />
              导出
            </button>
          </div>
        </div>

        {failedCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-400/25 bg-rose-500/10 p-2 text-xs text-rose-200">
            <IconWarning className="h-4 w-4 shrink-0" />
            当前失败子任务: {failedCount}
          </div>
        )}
      </div>

      <JobItemDualPane items={jobItems} jobDetail={jobDetail} />
    </div>
  );
}
