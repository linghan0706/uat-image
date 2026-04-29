import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const LAYOUT_CAP = 1.5;

export function useLightbox(totalImages: number) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxIndex(null);
      } else if (e.key === "ArrowLeft") {
        setLightboxIndex((prev) => {
          if (prev !== null && prev > 0) {
            setZoomScale(1);
            setPanOffset({ x: 0, y: 0 });
            return prev - 1;
          }
          return prev;
        });
      } else if (e.key === "ArrowRight") {
        setLightboxIndex((prev) => {
          if (prev !== null && prev < totalImages - 1) {
            setZoomScale(1);
            setPanOffset({ x: 0, y: 0 });
            return prev + 1;
          }
          return prev;
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [lightboxIndex, totalImages]);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const goTo = useCallback((idx: number) => {
    setLightboxIndex(idx);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const next = zoomScale + (e.deltaY < 0 ? 0.25 : -0.25);
      const clamped = Math.min(5, Math.max(0.5, next));
      setZoomScale(clamped);
      if (clamped <= LAYOUT_CAP) setPanOffset({ x: 0, y: 0 });
    },
    [zoomScale],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoomScale <= LAYOUT_CAP) return;          // no drag during phase 1
      e.preventDefault();
      isDraggingRef.current = true;
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      panStartRef.current = { ...panOffset };
    },
    [zoomScale, panOffset],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDraggingRef.current) return;
      const extraScale = zoomScale / LAYOUT_CAP;    // CSS scale factor in phase 2
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPanOffset({
        x: panStartRef.current.x + dx / extraScale,
        y: panStartRef.current.y + dy / extraScale,
      });
    },
    [zoomScale],
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  const resetZoom = useCallback(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handlers = useMemo(
    () => ({
      handleWheel,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
    }),
    [handleWheel, handleMouseDown, handleMouseMove, handleMouseUp],
  );

  return {
    lightboxIndex,
    setLightboxIndex,
    zoomScale,
    panOffset,
    isDragging,
    isDraggingRef,
    openLightbox,
    closeLightbox,
    goTo,
    resetZoom,
    ...handlers,
  };
}
