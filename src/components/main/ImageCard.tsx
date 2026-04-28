import Image from "next/image";
import type { ImageResult } from "@/lib/api/image-workflow.types";
import { CAPABILITY_DISPLAY } from "@/lib/constants";
import { formatFileSize } from "@/lib/format";
import { IconDownload, IconUser } from "@/components/icons";
import { PortraitSelectionButton } from "./PortraitSelectionButton";

interface ImageCardProps {
  image: ImageResult;
  characterName?: string;
  onClick: () => void;
  portraitSelectionLoading?: boolean;
  onTogglePortraitSelection?: (imageId: string, selected: boolean) => void;
}

export function ImageCard({
  image,
  characterName,
  onClick,
  portraitSelectionLoading = false,
  onTogglePortraitSelection,
}: ImageCardProps) {
  const isLandscape = (image.width || 256) >= (image.height || 256);
  const displayName = characterName?.trim() || "未标注角色";
  const canSelectPortrait = image.capability === "PORTRAIT" && onTogglePortraitSelection;

  return (
    <article className="group overflow-hidden rounded-lg border border-white/10 bg-zinc-900/80 shadow-xl shadow-black/20 transition-all hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-zinc-900 hover:shadow-cyan-950/20">
      <div
        className={`relative cursor-pointer bg-zinc-950 ${isLandscape ? "aspect-video" : "aspect-[3/4]"}`}
        onClick={onClick}
      >
        <Image
          src={image.access_url ?? image.download_url}
          alt={`${image.capability} #${image.id}`}
          fill
          className="object-contain transition-transform duration-200 group-hover:scale-[1.015]"
          unoptimized
          onError={(e) => {
            const target = e.currentTarget;
            target.style.display = "none";
            const fallback = target.parentElement?.querySelector("[data-fallback]") as HTMLElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
        <div
          data-fallback=""
          className="absolute inset-0 hidden flex-col items-center justify-center gap-1 text-zinc-500"
        >
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
          <span className="text-xs">加载失败</span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/75 via-black/20 to-transparent p-3">
          <div className="flex min-w-0 items-center gap-2 rounded-full bg-zinc-950/80 px-2.5 py-1.5 text-xs font-semibold text-zinc-100 ring-1 ring-white/10 backdrop-blur">
            <IconUser className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
            <span className="truncate">{displayName}</span>
          </div>
          <span className="rounded-full bg-zinc-950/75 px-2 py-1 text-[11px] font-medium text-zinc-400 ring-1 ring-white/10 backdrop-blur">
            #{image.variant_index + 1}
          </span>
        </div>

        {image.capability === "PORTRAIT" && image.is_selected_portrait && (
          <div className="pointer-events-none absolute left-3 top-12 rounded-full bg-emerald-400 px-2.5 py-1 text-[11px] font-semibold text-zinc-950 shadow-lg shadow-black/25">
            已审核入库
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/20 group-hover:opacity-100">
          <span className="rounded-full bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 shadow-lg shadow-black/30">
            查看大图
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-3 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0 text-[11px] text-zinc-300">
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 backdrop-blur">
                {CAPABILITY_DISPLAY[image.capability] ?? image.capability}
              </span>
              <span className="ml-1.5 rounded-md bg-white/10 px-1.5 py-0.5 backdrop-blur">
                {image.width}x{image.height}
              </span>
            </div>
            <a
              className="pointer-events-auto inline-flex h-8 items-center gap-1 rounded-lg bg-zinc-950/80 px-2.5 text-xs font-medium text-cyan-200 ring-1 ring-white/10 backdrop-blur transition-colors hover:bg-cyan-400 hover:text-zinc-950"
              href={image.download_url}
              onClick={(event) => event.stopPropagation()}
            >
              <IconDownload className="h-3.5 w-3.5" />
              下载
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-100">{displayName}</div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
              <span>{CAPABILITY_DISPLAY[image.capability] ?? image.capability}</span>
              <span className="h-1 w-1 rounded-full bg-zinc-700" />
              <span>{formatFileSize(Number(image.file_size))}</span>
            </div>
          </div>
          <div className="shrink-0 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-400">
            {image.width}x{image.height}
          </div>
        </div>
        {canSelectPortrait && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <PortraitSelectionButton
              selected={image.is_selected_portrait}
              loading={portraitSelectionLoading}
              onToggle={() => onTogglePortraitSelection(image.id, !image.is_selected_portrait)}
            />
            {image.selected_at && (
              <span className="truncate text-[11px] text-zinc-600">
                {image.selected_at}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
