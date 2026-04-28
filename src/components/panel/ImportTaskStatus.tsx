import type { ImportTaskDetail } from "@/lib/api/image-workflow.types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime } from "@/lib/format";

interface ImportTaskStatusProps {
  detail: ImportTaskDetail;
}

export function ImportTaskStatus({ detail }: ImportTaskStatusProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-zinc-200">导入任务</span>
        <StatusBadge status={detail.status} />
        <span className="text-zinc-500">{detail.file_name}</span>
        <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-xs text-zinc-400">
          {detail.submit_mode === "CREATE_BATCH" ? "解析+创建" : "仅解析"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-zinc-400">
        <div><span className="text-zinc-600">创建: </span>{formatDateTime(detail.created_at)}</div>
        <div><span className="text-zinc-600">开始: </span>{formatDateTime(detail.started_at)}</div>
        <div><span className="text-zinc-600">完成: </span>{formatDateTime(detail.finished_at)}</div>
        <div><span className="text-zinc-600">重试: </span>{detail.retry_count}/{detail.max_retry}</div>
      </div>
      {detail.error_message && (
        <div className="mt-2 rounded-lg border border-rose-400/25 bg-rose-500/10 p-2 text-xs text-rose-200">
          {detail.error_message}
        </div>
      )}
      {detail.batch_job_id && (
        <div className="mt-2 text-xs text-cyan-300">
          已自动创建批任务: {detail.batch_job_id}
        </div>
      )}
    </div>
  );
}
