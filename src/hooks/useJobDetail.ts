import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBatchJobDetail,
  listBatchJobImages,
  listBatchJobItems,
  retryFailedBatchJob,
  exportBatchJob,
  updatePortraitSelection,
} from "@/lib/api/batch-jobs";
import type { JobDetail, JobItem, ImageResult } from "@/lib/api/image-workflow.types";
import { TERMINAL_BATCH_STATUSES } from "@/lib/constants";

export function useJobDetail(selectedJobId: string | null) {
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [jobItems, setJobItems] = useState<JobItem[]>([]);
  const [imageResults, setImageResults] = useState<ImageResult[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const detailPollingRef = useRef<number | null>(null);
  const jobStatusRef = useRef<string>("");

  const loadSelectedJob = useCallback(async (jobId: string) => {
    try {
      const [detail, items, images] = await Promise.all([
        getBatchJobDetail(jobId),
        listBatchJobItems(jobId),
        listBatchJobImages(jobId),
      ]);
      setJobDetail(detail);
      setJobItems(items);
      setImageResults(images);
    } catch {
      // silently handle — polling will retry
    }
  }, []);

  useEffect(() => {
    // Clear polling
    if (detailPollingRef.current) {
      window.clearInterval(detailPollingRef.current);
      detailPollingRef.current = null;
    }

    if (!selectedJobId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- cleanup on deselect
      setJobDetail(() => null);
      setJobItems(() => []);
      setImageResults(() => []);
      return;
    }

    // Reset before loading new job
    setJobDetail(() => null);
    setJobItems(() => []);
    setImageResults(() => []);

    const immediateTimer = window.setTimeout(() => {
      void loadSelectedJob(selectedJobId);
    }, 0);

    detailPollingRef.current = window.setInterval(() => {
      if (!TERMINAL_BATCH_STATUSES.has(jobStatusRef.current)) {
        void loadSelectedJob(selectedJobId);
      }
    }, document.hidden ? 15_000 : 3_000);

    return () => {
      window.clearTimeout(immediateTimer);
      if (detailPollingRef.current) {
        window.clearInterval(detailPollingRef.current);
      }
    };
  }, [loadSelectedJob, selectedJobId]);

  useEffect(() => {
    jobStatusRef.current = jobDetail?.status ?? "";
  }, [jobDetail]);

  const reloadCurrentJob = useCallback(async () => {
    if (selectedJobId) await loadSelectedJob(selectedJobId);
  }, [selectedJobId, loadSelectedJob]);

  const retryFailed = useCallback(async () => {
    if (!selectedJobId) return;
    setActionLoading(true);
    try {
      await retryFailedBatchJob(selectedJobId);
      await loadSelectedJob(selectedJobId);
    } finally {
      setActionLoading(false);
    }
  }, [selectedJobId, loadSelectedJob]);

  const createExport = useCallback(async () => {
    if (!selectedJobId) return;
    setActionLoading(true);
    try {
      await exportBatchJob(selectedJobId);
      await loadSelectedJob(selectedJobId);
    } finally {
      setActionLoading(false);
    }
  }, [selectedJobId, loadSelectedJob]);

  const setPortraitSelection = useCallback(async (imageId: string, selected: boolean) => {
    if (!selectedJobId) return;
    await updatePortraitSelection(imageId, selected);
    await loadSelectedJob(selectedJobId);
  }, [loadSelectedJob, selectedJobId]);

  return {
    jobDetail,
    jobItems,
    imageResults,
    actionLoading,
    retryFailed,
    createExport,
    setPortraitSelection,
    reloadJob: reloadCurrentJob,
  };
}
