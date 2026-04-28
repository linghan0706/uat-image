import type { BatchJob } from "@/lib/api/image-workflow.types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { CAPABILITY_DISPLAY } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";

interface JobCardProps {
  job: BatchJob;
  selected: boolean;
  onClick: () => void;
}

export function JobCard({ job, selected, onClick }: JobCardProps) {
  const completed = job.success_count + job.failed_count;
  return (
    <button
      type="button"
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        selected
          ? "border-cyan-400/40 bg-cyan-400/10 text-zinc-100 shadow-lg shadow-cyan-950/15"
          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06]"
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{job.task_name || job.job_no}</div>
          {job.task_name && <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-600">{job.job_no}</div>}
        </div>
        <StatusBadge status={job.status} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-zinc-500">
        <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-zinc-400 ring-1 ring-white/10">
          {CAPABILITY_DISPLAY[job.capability] ?? job.capability}
        </span>
        <span>{formatDateTime(job.created_at)}</span>
      </div>
      <div className="mt-2">
        <ProgressBar success={job.success_count} failed={job.failed_count} total={job.total_count} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-600">
        <span>{completed}/{job.total_count} 已处理</span>
        <span>{job.failed_count > 0 ? `${job.failed_count} 失败` : "运行正常"}</span>
      </div>
    </button>
  );
}
