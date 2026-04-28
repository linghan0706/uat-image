"use client";

import { useWorkspace } from "@/contexts/WorkspaceContext";
import { IconPlus, IconRefresh } from "@/components/icons";
import { JobList } from "@/components/sidebar/JobList";

export function Sidebar() {
  const { batchJobs, loadingJobs, refreshJobs, requestOpenPanel } = useWorkspace();
  const runningCount = batchJobs.filter((job) => ["QUEUED", "RUNNING", "PENDING"].includes(job.status)).length;
  const doneCount = batchJobs.filter((job) => ["SUCCESS", "PARTIAL_SUCCESS", "EXPORTED"].includes(job.status)).length;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-white/10 p-4">
        <button
          type="button"
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-cyan-950/30 transition-colors hover:bg-cyan-300"
          onClick={() => requestOpenPanel("create")}
        >
          <IconPlus className="h-4 w-4" />
          <span>新建任务</span>
        </button>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
            <div className="text-[11px] text-zinc-500">全部</div>
            <div className="mt-0.5 text-sm font-semibold text-zinc-100">{batchJobs.length}</div>
          </div>
          <div className="rounded-lg border border-cyan-400/15 bg-cyan-400/5 p-2">
            <div className="text-[11px] text-cyan-500">运行</div>
            <div className="mt-0.5 text-sm font-semibold text-cyan-200">{runningCount}</div>
          </div>
          <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/5 p-2">
            <div className="text-[11px] text-emerald-500">完成</div>
            <div className="mt-0.5 text-sm font-semibold text-emerald-200">{doneCount}</div>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-50"
          onClick={() => void refreshJobs()}
          disabled={loadingJobs}
        >
          <IconRefresh className="h-3.5 w-3.5" />
          {loadingJobs ? "同步中..." : "刷新队列"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <JobList />
      </div>
    </div>
  );
}
