import Image from "next/image";

import type { ImageResult } from "@/lib/api/image-workflow.types";

interface SelectedPortraitSourcePanelProps {
  images: ImageResult[];
  characterNameByItemId: Map<string, string>;
  excludedIds: Set<string>;
  onRemove: (imageId: string) => void;
  onRestoreAll: () => void;
}

export function SelectedPortraitSourcePanel({
  images,
  characterNameByItemId,
  excludedIds,
  onRemove,
  onRestoreAll,
}: SelectedPortraitSourcePanelProps) {
  const activeImages = images.filter((image) => !excludedIds.has(image.id));
  const removedCount = images.length - activeImages.length;

  if (images.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-zinc-500">
        当前任务还没有已选定妆照。请先在画廊中把候选定妆照标记为已选，再创建三视图。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-zinc-300">
          将基于 <span className="font-semibold text-cyan-200">{activeImages.length}</span> 张已选定妆照创建三视图
        </div>
        {removedCount > 0 && (
          <button
            type="button"
            className="rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            onClick={onRestoreAll}
          >
            恢复全部
          </button>
        )}
      </div>

      {activeImages.length === 0 ? (
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
          本次创建来源已全部移除；恢复来源或改用手动 Prompt 创建。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {activeImages.map((image) => {
            const characterName = characterNameByItemId.get(image.job_item_id)?.trim() || "未标注角色";
            return (
              <div
                key={image.id}
                className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-2"
              >
                <div className="relative h-14 w-14 overflow-hidden rounded-md bg-zinc-950">
                  <Image
                    src={image.access_url ?? image.download_url}
                    alt={`定妆照 ${image.id}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-100">{characterName}</div>
                  <div className="mt-1 truncate text-xs text-zinc-500">
                    #{image.id} · {image.width}x{image.height}
                    {image.selected_at ? ` · ${image.selected_at}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="h-8 rounded-lg border border-white/10 px-2.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  onClick={() => onRemove(image.id)}
                  aria-label={`从本次三视图创建移除 ${characterName}`}
                >
                  移除
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
