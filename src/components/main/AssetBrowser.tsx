"use client";

import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AssetToolbar } from "./AssetToolbar";
import { AssetGrid } from "./AssetGrid";
import { EmptyState } from "./EmptyState";

export function AssetBrowser() {
  const { selectedJobId, jobDetail, imageResults, errorText, setErrorText } = useWorkspace();

  return (
    <div className="flex h-full flex-col">
      {errorText && (
        <div className="flex items-center justify-between border-b border-rose-400/20 bg-rose-500/10 px-5 py-2.5 text-sm text-rose-200">
          <span>{errorText}</span>
          <button
            type="button"
            className="ml-2 text-xs text-rose-300 hover:text-rose-100"
            onClick={() => setErrorText("")}
          >
            关闭
          </button>
        </div>
      )}

      <AssetToolbar />

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 [scrollbar-gutter:stable]">
        {!selectedJobId ? (
          <EmptyState
            icon="cursor"
            title="选择一个生成任务"
            description="从左侧队列进入创作流，图片、参数和执行状态会在这里汇合。"
          />
        ) : imageResults.length === 0 ? (
          <EmptyState
            icon="image"
            title={jobDetail?.status === "RUNNING" ? "生成中..." : "暂无图片结果"}
            description={
              jobDetail?.status === "RUNNING"
                ? "任务已经进入队列，完成的资产会实时出现在画廊中。"
                : "当前任务还没有生成图片，可以检查右侧任务详情或重新提交。"
            }
          />
        ) : (
          <AssetGrid />
        )}
      </div>
    </div>
  );
}
