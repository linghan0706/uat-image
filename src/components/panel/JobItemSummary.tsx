import type { JobItem } from "@/lib/api/image-workflow.types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { sourceModeLabel } from "@/lib/format";
import { IconInfo } from "@/components/icons";
import { deriveCharacterNameFromProfileInput, isPlaceholderName } from "@/lib/prompt/character-profile";

interface JobItemSummaryProps {
  items: JobItem[];
}

const getDisplayCharacterName = (item: JobItem) => {
  const derived = deriveCharacterNameFromProfileInput(item.character_profile, item.prompt);
  if (derived) return derived;
  const raw = item.character_name?.trim();
  return raw && !isPlaceholderName(raw) ? raw : null;
};

export function JobItemSummary({ items }: JobItemSummaryProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">子任务摘要</h3>
        {items.length > 0 && <span className="text-xs text-slate-400">{items.length} 项</span>}
      </div>
      <div className="max-h-80 space-y-1.5 overflow-auto">
        {items.slice(0, 50).map((item) => (
          <div
            key={item.id}
            className={`rounded-lg border p-2.5 text-xs ${
              item.status === "FAILED"
                ? "border-l-2 border-l-rose-400 border-t-slate-200 border-r-slate-200 border-b-slate-200"
                : item.status === "RUNNING"
                  ? "border-l-2 border-l-blue-400 border-t-slate-200 border-r-slate-200 border-b-slate-200"
                  : "border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-slate-700">{item.item_no}</span>
                {getDisplayCharacterName(item) && (
                  <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">{getDisplayCharacterName(item)}</span>
                )}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                  {sourceModeLabel[item.source_mode]}
                </span>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <div className="mt-1 line-clamp-2 whitespace-pre-wrap text-slate-600">{item.prompt}</div>
            {item.error_message && (
              <div className="mt-1 flex items-start gap-1 text-rose-700">
                <IconInfo className="mt-0.5 h-3 w-3 shrink-0" />
                {item.error_message}
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="py-4 text-center text-sm text-slate-400">暂无子任务</div>
        )}
      </div>
    </div>
  );
}
