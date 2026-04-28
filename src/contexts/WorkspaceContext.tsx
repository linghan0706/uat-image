"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useBatchJobs } from "@/hooks/useBatchJobs";
import { useJobDetail } from "@/hooks/useJobDetail";
import { useLightbox } from "@/hooks/useLightbox";
import type { BatchJob, ImageResult, JobDetail, JobItem } from "@/lib/api/image-workflow.types";
import { deriveCharacterNameFromProfileInput, isPlaceholderName } from "@/lib/prompt/character-profile";

export type PanelMode = "create" | "detail";

interface WorkspaceContextValue {
  batchJobs: BatchJob[];
  loadingJobs: boolean;
  refreshJobs: () => Promise<void>;

  selectedJobId: string | null;
  setSelectedJobId: (id: string | null) => void;
  jobDetail: JobDetail | null;
  jobItems: JobItem[];
  imageResults: ImageResult[];
  selectedPortraitImages: ImageResult[];
  reloadCurrentJob: () => Promise<void>;
  setPortraitSelection: (imageId: string, selected: boolean) => Promise<void>;

  panelMode: PanelMode;
  setPanelMode: (mode: PanelMode) => void;
  openPanelRequest: number;
  requestOpenPanel: (mode?: PanelMode) => void;

  retryFailed: () => Promise<void>;
  createExport: () => Promise<void>;
  actionLoading: boolean;

  errorText: string;
  setErrorText: (msg: string) => void;

  lightboxIndex: number | null;
  setLightboxIndex: (idx: number | null) => void;
  openLightbox: (idx: number) => void;
  closeLightbox: () => void;
  goToLightbox: (idx: number) => void;
  zoomScale: number;
  panOffset: { x: number; y: number };
  isDragging: boolean;
  resetZoom: () => void;
  handleWheel: (e: React.WheelEvent) => void;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: () => void;

  characterNameByItemId: Map<string, string>;
  failedCount: number;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { batchJobs, loadingJobs, refreshJobs, jobsError, setJobsError } = useBatchJobs();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("create");
  const [openPanelRequest, setOpenPanelRequest] = useState(0);
  const [errorText, setErrorTextState] = useState("");

  const requestOpenPanel = useCallback((mode?: PanelMode) => {
    if (mode) setPanelMode(mode);
    setOpenPanelRequest((n) => n + 1);
  }, []);

  // Auto-select first job if nothing selected
  const handleSetSelectedJobId = useCallback(
    (id: string | null) => {
      setSelectedJobId(id);
      if (id) setPanelMode("detail");
    },
    [],
  );

  const {
    jobDetail,
    jobItems,
    imageResults,
    actionLoading,
    retryFailed: retryFailedRaw,
    createExport: createExportRaw,
    setPortraitSelection: setPortraitSelectionRaw,
    reloadJob,
  } = useJobDetail(selectedJobId);

  const lightbox = useLightbox(imageResults.length);

  const retryFailed = useCallback(async () => {
    try {
      await retryFailedRaw();
      await refreshJobs();
    } catch (err) {
      setErrorTextState(err instanceof Error ? err.message : "重试失败");
    }
  }, [retryFailedRaw, refreshJobs]);

  const createExport = useCallback(async () => {
    try {
      await createExportRaw();
      await refreshJobs();
    } catch (err) {
      setErrorTextState(err instanceof Error ? err.message : "导出任务创建失败");
    }
  }, [createExportRaw, refreshJobs]);

  const reloadCurrentJob = useCallback(async () => {
    await reloadJob();
  }, [reloadJob]);

  const setPortraitSelection = useCallback(async (imageId: string, selected: boolean) => {
    try {
      await setPortraitSelectionRaw(imageId, selected);
    } catch (err) {
      setErrorTextState(err instanceof Error ? err.message : "定妆照选择更新失败");
      throw err;
    }
  }, [setPortraitSelectionRaw]);

  const setErrorText = useCallback(
    (msg: string) => {
      setErrorTextState(msg);
      setJobsError("");
    },
    [setJobsError],
  );

  const combinedError = errorText || jobsError;

  const characterNameByItemId = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of jobItems) {
      const derived = deriveCharacterNameFromProfileInput(item.character_profile, item.prompt);
      const raw = item.character_name?.trim();
      const displayName = derived ?? (raw && !isPlaceholderName(raw) ? raw : null);
      if (displayName) map.set(item.id, displayName);
    }
    return map;
  }, [jobItems]);

  const failedCount = useMemo(() => jobItems.filter((item) => item.status === "FAILED").length, [jobItems]);
  const selectedPortraitImages = useMemo(
    () => imageResults.filter((image) => image.capability === "PORTRAIT" && image.is_selected_portrait),
    [imageResults],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      batchJobs,
      loadingJobs,
      refreshJobs,
      selectedJobId,
      setSelectedJobId: handleSetSelectedJobId,
      jobDetail,
      jobItems,
      imageResults,
      selectedPortraitImages,
      reloadCurrentJob,
      setPortraitSelection,
      panelMode,
      setPanelMode,
      openPanelRequest,
      requestOpenPanel,
      retryFailed,
      createExport,
      actionLoading,
      errorText: combinedError,
      setErrorText,
      lightboxIndex: lightbox.lightboxIndex,
      setLightboxIndex: lightbox.setLightboxIndex,
      openLightbox: lightbox.openLightbox,
      closeLightbox: lightbox.closeLightbox,
      goToLightbox: lightbox.goTo,
      zoomScale: lightbox.zoomScale,
      panOffset: lightbox.panOffset,
      isDragging: lightbox.isDragging,
      resetZoom: lightbox.resetZoom,
      handleWheel: lightbox.handleWheel,
      handleMouseDown: lightbox.handleMouseDown,
      handleMouseMove: lightbox.handleMouseMove,
      handleMouseUp: lightbox.handleMouseUp,
      characterNameByItemId,
      failedCount,
    }),
    [
      batchJobs, loadingJobs, refreshJobs,
      selectedJobId, handleSetSelectedJobId,
      jobDetail, jobItems, imageResults, selectedPortraitImages, reloadCurrentJob, setPortraitSelection,
      panelMode,
      retryFailed, createExport, actionLoading,
      combinedError, setErrorText,
      lightbox,
      characterNameByItemId, failedCount,
      openPanelRequest, requestOpenPanel,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
