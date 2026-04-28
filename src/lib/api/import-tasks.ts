import { apiRequest } from "@/lib/api/http-client";
import type { CreateImportTaskResponse, ImportTaskDetail } from "@/lib/api/image-workflow.types";

export const createImportTask = (formData: FormData) =>
  apiRequest<CreateImportTaskResponse>({
    url: "/api/v1/import/parse",
    method: "POST",
    data: formData,
  });

export const getImportTaskDetail = (taskId: string) =>
  apiRequest<ImportTaskDetail>({
    url: `/api/v1/import/parse/${taskId}`,
    method: "GET",
  });
