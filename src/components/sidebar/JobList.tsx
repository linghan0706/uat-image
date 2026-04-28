"use client";

import { useWorkspace } from "@/contexts/WorkspaceContext";
import { JobCard } from "./JobCard";
import { useState } from "react";
import { IconSpinner } from "@/components/icons";

const filterOptions = [
  { value: "all", label: "全部" },
  { value: "active", label: "进行中" },
  { value: "done", label: "已完成" },
  { value: "failed", label: "失败" },
] as const;

type FilterValue = (typeof filterOptions)[number]["value"];

const statusGroups: Record<FilterValue, Set<string> | null> = {
  all: null,
  active: new Set(["QUEUED", "RUNNING", "PENDING"]),
  done: new Set(["SUCCESS", "PARTIAL_SUCCESS", "EXPORTED"]),
  failed: new Set(["FAILED"]),
};

export function JobList() {
  const { batchJobs, selectedJobId, setSelectedJobId, loadingJobs } = useWorkspace();
  const [filter, setFilter] = useState<FilterValue>("all");

  const filtered = statusGroups[filter]
    ? batchJobs.filter((j) => statusGroups[filter]!.has(j.status))
    : batchJobs;

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="rounded-lg border border-white/10 bg-zinc-900/70 p-1">
        <div className="grid grid-cols-4 gap-1">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`h-8 rounded-md px-2 text-xs font-medium transition-colors ${
              filter === opt.value
                ? "bg-cyan-400 text-zinc-950"
                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
            }`}
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
        </div>
      </div>
      {loadingJobs && (
        <div className="flex items-center gap-2 px-1 text-xs text-zinc-500">
          <IconSpinner className="h-3 w-3" />
          队列更新中
        </div>
      )}

      {filtered.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          selected={selectedJobId === job.id}
          onClick={() => setSelectedJobId(job.id)}
        />
      ))}

      {filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-white/10 py-10 text-center text-sm text-zinc-500">
          {batchJobs.length === 0 ? "暂无任务" : "无匹配任务"}
        </div>
      )}
    </div>
  );
}
