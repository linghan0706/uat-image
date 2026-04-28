const statusConfig: Record<string, { label: string; bg: string; text: string; ring: string; pulse?: boolean }> = {
  PENDING: { label: "等待中", bg: "bg-zinc-800", text: "text-zinc-300", ring: "ring-zinc-700" },
  QUEUED: { label: "排队中", bg: "bg-amber-500/10", text: "text-amber-300", ring: "ring-amber-400/25" },
  RUNNING: { label: "运行中", bg: "bg-cyan-500/10", text: "text-cyan-300", ring: "ring-cyan-400/25", pulse: true },
  PARTIAL_SUCCESS: { label: "部分成功", bg: "bg-amber-500/10", text: "text-amber-300", ring: "ring-amber-400/25" },
  SUCCESS: { label: "已完成", bg: "bg-emerald-500/10", text: "text-emerald-300", ring: "ring-emerald-400/25" },
  FAILED: { label: "失败", bg: "bg-rose-500/10", text: "text-rose-300", ring: "ring-rose-400/25" },
  EXPORTING: { label: "导出中", bg: "bg-violet-500/10", text: "text-violet-300", ring: "ring-violet-400/25", pulse: true },
  EXPORTED: { label: "已导出", bg: "bg-emerald-500/10", text: "text-emerald-300", ring: "ring-emerald-400/25" },
  RETRYING: { label: "重试中", bg: "bg-amber-500/10", text: "text-amber-300", ring: "ring-amber-400/25", pulse: true },
  IDLE: { label: "未导出", bg: "bg-zinc-800", text: "text-zinc-300", ring: "ring-zinc-700" },
  PARSE_SUCCESS: { label: "解析完成", bg: "bg-emerald-500/10", text: "text-emerald-300", ring: "ring-emerald-400/25" },
  PARSE_FAILED: { label: "解析失败", bg: "bg-rose-500/10", text: "text-rose-300", ring: "ring-rose-400/25" },
  BATCH_CREATING: { label: "创建任务中", bg: "bg-violet-500/10", text: "text-violet-300", ring: "ring-violet-400/25", pulse: true },
  BATCH_CREATED: { label: "任务已创建", bg: "bg-emerald-500/10", text: "text-emerald-300", ring: "ring-emerald-400/25" },
  BATCH_CREATE_FAILED: { label: "任务创建失败", bg: "bg-rose-500/10", text: "text-rose-300", ring: "ring-rose-400/25" },
};

function pulseColor(textClass: string) {
  if (textClass === "text-cyan-300") return { ping: "bg-cyan-400", dot: "bg-cyan-300" };
  if (textClass === "text-violet-300") return { ping: "bg-violet-400", dot: "bg-violet-300" };
  return { ping: "bg-amber-400", dot: "bg-amber-500" };
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? { label: status, bg: "bg-zinc-800", text: "text-zinc-300", ring: "ring-zinc-700" };
  const pulse = cfg.pulse ? pulseColor(cfg.text) : null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cfg.bg} ${cfg.text} ${cfg.ring}`}>
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${pulse.ping}`} />
          <span className={`relative inline-flex h-2 w-2 rounded-full ${pulse.dot}`} />
        </span>
      )}
      {cfg.label}
    </span>
  );
}
