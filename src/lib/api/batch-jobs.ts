import { apiRequest } from "@/lib/api/http-client";
import type { BatchJob, CreateBatchJobPayload, ImageResult, JobDetail, JobItem } from "@/lib/api/image-workflow.types";

const LIST_PAGE_SIZE = 20;
const DETAIL_PAGE_SIZE = 100;

export const listBatchJobs = async (): Promise<BatchJob[]> => {
  const data = await apiRequest<{ list: BatchJob[] }>({
    url: "/api/v1/batch-jobs",
    method: "GET",
    params: {
      page: 1,
      page_size: LIST_PAGE_SIZE,
    },
  });
  return data.list;
};

export const getBatchJobDetail = (jobId: string) =>
  apiRequest<JobDetail>({
    url: `/api/v1/batch-jobs/${jobId}`,
    method: "GET",
  });

export const listBatchJobItems = async (jobId: string): Promise<JobItem[]> => {
  const data = await apiRequest<{ list: JobItem[] }>({
    url: `/api/v1/batch-jobs/${jobId}/items`,
    method: "GET",
    params: {
      page: 1,
      page_size: DETAIL_PAGE_SIZE,
    },
  });
  return data.list;
};

export const listBatchJobImages = async (jobId: string): Promise<ImageResult[]> => {
  const data = await apiRequest<{ list: ImageResult[] }>({
    url: `/api/v1/batch-jobs/${jobId}/images`,
    method: "GET",
    params: {
      page: 1,
      page_size: DETAIL_PAGE_SIZE,
    },
  });
  return data.list;
};

export const createBatchJob = (payload: CreateBatchJobPayload) =>
  apiRequest<{ id: string }>({
    url: "/api/v1/batch-jobs",
    method: "POST",
    data: payload,
  });

export const updatePortraitSelection = (imageId: string, selected: boolean) =>
  apiRequest<{
    id: string;
    batch_job_id: string;
    job_item_id: string;
    capability: string;
    is_selected_portrait: boolean;
    selected_at: string | null;
  }>({
    url: `/api/v1/image-results/${imageId}/portrait-selection`,
    method: "PATCH",
    data: { selected },
  });

export const retryFailedBatchJob = async (jobId: string): Promise<void> => {
  await apiRequest({
    url: `/api/v1/batch-jobs/${jobId}/retry-failed`,
    method: "POST",
    data: {},
  });
};

export const exportBatchJob = async (jobId: string): Promise<void> => {
  await apiRequest({
    url: `/api/v1/batch-jobs/${jobId}/export`,
    method: "POST",
  });
};
