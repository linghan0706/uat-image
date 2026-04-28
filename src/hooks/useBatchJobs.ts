import { useCallback, useEffect, useRef, useState } from "react";
import { listBatchJobs } from "@/lib/api/batch-jobs";
import type { BatchJob } from "@/lib/api/image-workflow.types";

export function useBatchJobs() {
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [errorText, setErrorText] = useState("");
  const listPollingRef = useRef<number | null>(null);

  const refreshJobs = useCallback(async () => {
    try {
      setLoadingJobs(true);
      const jobs = await listBatchJobs();
      setBatchJobs(jobs);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "任务列表加载失败");
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refreshJobs();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refreshJobs]);

  useEffect(() => {
    if (listPollingRef.current) {
      window.clearInterval(listPollingRef.current);
    }
    listPollingRef.current = window.setInterval(() => {
      void refreshJobs();
    }, document.hidden ? 15_000 : 10_000);
    return () => {
      if (listPollingRef.current) {
        window.clearInterval(listPollingRef.current);
      }
    };
  }, [refreshJobs]);

  return { batchJobs, loadingJobs, refreshJobs, jobsError: errorText, setJobsError: setErrorText };
}
