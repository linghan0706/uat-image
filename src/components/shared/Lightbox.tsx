"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { IconClose, IconChevronLeft, IconChevronRight, IconUser, IconDownload } from "@/components/icons";
import { CAPABILITY_DISPLAY } from "@/lib/constants";
import { formatFileSize } from "@/lib/format";

export function Lightbox() {
  const {
    lightboxIndex,
    imageResults,
    characterNameByItemId,
    closeLightbox,
    goToLightbox,
    zoomScale,
    panOffset,
    isDragging,
    resetZoom,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  } = useWorkspace();

  /* Track the image's natural (intrinsic) size so we can compute a
     layout-affecting scaled size instead of relying on CSS scale(). */
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImgLoad = useCallback(() => {
    const el = imgRef.current;
    if (el) setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
  }, []);

  // Reset natural size when switching images
  useEffect(() => {
    setNaturalSize(null);
  }, [lightboxIndex]);

  if (lightboxIndex === null || !imageResults[lightboxIndex]) return null;

  const img = imageResults[lightboxIndex];
  const charName = characterNameByItemId.get(img.job_item_id);
  const hasPrev = lightboxIndex > 0;
  const hasNext = lightboxIndex < imageResults.length - 1;

  /* ---------- Two-phase zoom ----------
     Phase 1 (zoomScale ≤ 1.5): image + dialog grow together via real
       width/height so the dialog expands in both axes.
     Phase 2 (zoomScale > 1.5): dialog size freezes at the 1.5× size;
       extra zoom is applied as CSS scale() inside the container so the
       user can pan around to inspect details. */
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  // Threshold where we switch from layout-zoom to transform-zoom
  const LAYOUT_CAP = 1.5;
  const layoutScale = Math.min(zoomScale, LAYOUT_CAP);
  const extraScale = zoomScale > LAYOUT_CAP ? zoomScale / LAYOUT_CAP : 1;

  let imgW: number | undefined;
  let imgH: number | undefined;

  if (naturalSize) {
    const ar = naturalSize.w / naturalSize.h;

    // Base fit at scale=1: contain inside 88vw × 70vh
    const maxW1 = vw * 0.88;
    const maxH1 = vh * 0.70;
    const fitRatio = Math.min(maxW1 / naturalSize.w, maxH1 / naturalSize.h, 1);
    const baseW = naturalSize.w * fitRatio;
    const baseH = naturalSize.h * fitRatio;

    // Apply layout zoom (phase 1 only)
    let scaledW = baseW * layoutScale;
    let scaledH = baseH * layoutScale;

    // Cap to viewport while preserving aspect ratio
    const capW = vw * 0.96;
    const capH = vh * 0.90;
    if (scaledW > capW) {
      scaledW = capW;
      scaledH = scaledW / ar;
    }
    if (scaledH > capH) {
      scaledH = capH;
      scaledW = scaledH * ar;
    }

    imgW = Math.round(scaledW);
    imgH = Math.round(scaledH);
  }

  // In phase 2, dragging needs grab cursor
  const inDetailZoom = extraScale > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={closeLightbox}
    >
      <div
        className="relative flex max-h-[96vh] max-w-[98vw] flex-col rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
          onClick={closeLightbox}
          aria-label="关闭"
        >
          <IconClose className="h-5 w-5" />
        </button>

        {/* Image area */}
        <div
          className="relative flex items-center justify-center overflow-hidden rounded-t-xl bg-slate-900"
          style={{
            width: imgW ? imgW + 32 : undefined,
            height: imgH ? imgH + 32 : undefined,
            minWidth: 320,
            minHeight: 300,
            cursor: inDetailZoom ? (isDragging ? "grabbing" : "grab") : "default",
            transition: isDragging ? "none" : "width 0.15s ease-out, height 0.15s ease-out",
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={img.access_url ?? img.download_url}
            alt={`${img.capability} #${img.id}`}
            className="select-none"
            style={{
              width: imgW,
              height: imgH,
              maxWidth: imgW ? undefined : "88vw",
              maxHeight: imgH ? undefined : "70vh",
              transform: inDetailZoom
                ? `scale(${extraScale}) translate(${panOffset.x}px, ${panOffset.y}px)`
                : undefined,
              transition: isDragging ? "none" : "width 0.15s ease-out, height 0.15s ease-out, transform 0.15s ease-out",
            }}
            draggable={false}
            onLoad={onImgLoad}
            onDoubleClick={resetZoom}
          />

          {hasPrev && (
            <button
              className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
              onClick={() => goToLightbox(lightboxIndex - 1)}
              aria-label="上一张"
            >
              <IconChevronLeft className="h-6 w-6" />
            </button>
          )}

          {hasNext && (
            <button
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
              onClick={() => goToLightbox(lightboxIndex + 1)}
              aria-label="下一张"
            >
              <IconChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Info panel */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3">
          {charName && (
            <span className="flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-sm font-semibold text-violet-700">
              <IconUser className="h-3.5 w-3.5" />
              {charName}
            </span>
          )}
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
            {CAPABILITY_DISPLAY[img.capability] ?? img.capability}
          </span>
          <span className="text-xs text-slate-500">
            {img.width}x{img.height} &middot; {formatFileSize(Number(img.file_size))}
          </span>
          <button
            className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200"
            onClick={resetZoom}
            title="重置缩放"
          >
            {Math.round(zoomScale * 100)}%
          </button>
          <span className="ml-auto text-xs text-slate-400">
            {lightboxIndex + 1} / {imageResults.length}
          </span>
          <a
            className="inline-flex items-center gap-1 text-xs text-sky-700 underline hover:text-sky-800"
            href={img.download_url}
          >
            <IconDownload className="h-3 w-3" />
            下载原图
          </a>
        </div>
      </div>
    </div>
  );
}
