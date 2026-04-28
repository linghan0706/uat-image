"use client";

import { useWorkspace } from "@/contexts/WorkspaceContext";
import { CreateTaskForm } from "@/components/panel/CreateTaskForm";
import { JobDetailPanel } from "@/components/panel/JobDetailPanel";

export function RightPanel() {
  const { panelMode, setPanelMode } = useWorkspace();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 p-3" role="tablist">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-zinc-900 p-1">
        <button
          type="button"
          role="tab"
          aria-selected={panelMode === "create"}
          className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
            panelMode === "create"
              ? "bg-cyan-400 text-zinc-950"
              : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
          }`}
          onClick={() => setPanelMode("create")}
        >
          创建任务
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={panelMode === "detail"}
          className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
            panelMode === "detail"
              ? "bg-cyan-400 text-zinc-950"
              : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
          }`}
          onClick={() => setPanelMode("detail")}
        >
          任务详情
        </button>
        </div>
      </div>

      <div className={`flex-1 ${panelMode === "create" ? "overflow-y-auto" : "overflow-hidden"}`}>
        {panelMode === "create" ? <CreateTaskForm /> : <JobDetailPanel />}
      </div>
    </div>
  );
}
