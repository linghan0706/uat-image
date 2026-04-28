export function ProgressBar({ success, failed, total }: { success: number; failed: number; total: number }) {
  const progress = total > 0 ? Math.round(((success + failed) / total) * 100) : 0;
  const successPct = total > 0 ? Math.round((success / total) * 100) : 0;
  const failedPct = total > 0 ? Math.round((failed / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-800 ring-1 ring-white/5">
        {successPct > 0 && (
          <div className="h-2 bg-emerald-400 transition-all duration-300" style={{ width: `${successPct}%` }} />
        )}
        {failedPct > 0 && (
          <div className="h-2 bg-rose-400 transition-all duration-300" style={{ width: `${failedPct}%` }} />
        )}
      </div>
      <div className="text-xs text-zinc-500">
        <span className="text-emerald-300">{success} 成功</span>
        {failed > 0 && <span className="ml-1 text-rose-300">{failed} 失败</span>}
        <span className="ml-1">{total - success - failed} 进行中</span>
        <span className="ml-1 text-zinc-600">&middot; {progress}%</span>
      </div>
    </div>
  );
}
