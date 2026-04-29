import { apiRequest } from "@/lib/api/http-client";
import type {
  BatchJob,
  BatchJobListResponse,
  CreateBatchJobPayload,
  ImageResult,
  JobDetail,
  JobItem,
} from "@/lib/api/image-workflow.types";

const LIST_PAGE_SIZE = 100;
const DETAIL_PAGE_SIZE = 100;

const listBatchJobsPage = (page: number): Promise<BatchJobListResponse> =>
  apiRequest<BatchJobListResponse>({
    url: "/api/v1/batch-jobs",
    method: "GET",
    params: {
      page,
      page_size: LIST_PAGE_SIZE,
    },
  });

export const listBatchJobs = async (): Promise<BatchJob[]> => {
  const firstPage = await listBatchJobsPage(1);
  const jobs = [...firstPage.list];
  const pageSize = firstPage.page_size || LIST_PAGE_SIZE;
  const total = firstPage.total ?? jobs.length;

  for (let page = firstPage.page + 1; jobs.length < total; page += 1) {
    const data = await listBatchJobsPage(page);
    if (data.list.length === 0) break;
    jobs.push(...data.list);
    if (data.list.length < pageSize) break;
  }

  return jobs;
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
