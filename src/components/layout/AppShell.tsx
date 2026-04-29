"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  IconBolt,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconGrid,
  IconImage,
  IconList,
  IconPanelRight,
  IconPlus,
  IconSettings,
} from "@/components/icons";
import { type PanelMode, useWorkspace } from "@/contexts/WorkspaceContext";

interface AppShellProps {
  sidebar: ReactNode;
  main: ReactNode;
  panel: ReactNode;
}

type MobileSurface = "gallery" | "queue" | "inspector";

const layoutStorageKey = "image-workbench-layout";

function readStoredLayout() {
  if (typeof window === "undefined") {
    return { queueCollapsed: false, panelCollapsed: false };
  }

  try {
    const stored = window.localStorage.getItem(layoutStorageKey);
    if (!stored) return { queueCollapsed: false, panelCollapsed: false };
    const parsed = JSON.parse(stored) as Partial<{
      queueCollapsed: boolean;
      panelCollapsed: boolean;
    }>;
    return {
      queueCollapsed: Boolean(parsed.queueCollapsed),
      panelCollapsed: Boolean(parsed.panelCollapsed),
    };
  } catch {
    return { queueCollapsed: false, panelCollapsed: false };
  }
}

function writeStoredLayout(layout: { queueCollapsed: boolean; panelCollapsed: boolean }) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(layoutStorageKey, JSON.stringify(layout));
}

export function AppShell({ sidebar, main, panel }: AppShellProps) {
  const { panelMode, setPanelMode, openPanelRequest } = useWorkspace();
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [mobileSurface, setMobileSurface] = useState<MobileSurface>("gallery");
  const [animating, setAnimating] = useState(false);
  const animateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inspectorPaneClassName = panelCollapsed
    ? "workbench-inspector-pane hidden shrink-0 flex-col overflow-hidden border-l border-white/10 bg-zinc-950/95"
    : "workbench-inspector-pane hidden shrink-0 flex-col overflow-hidden border-l border-white/10 bg-zinc-950/95 xl:flex";

  const triggerAnimating = useCallback(() => {
    if (animateTimerRef.current) clearTimeout(animateTimerRef.current);
    setAnimating(true);
    animateTimerRef.current = setTimeout(() => setAnimating(false), 420);
  }, []);

  useEffect(() => {
    return () => {
      if (animateTimerRef.current) clearTimeout(animateTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const storedLayout = readStoredLayout();
      setQueueCollapsed(storedLayout.queueCollapsed);
      setPanelCollapsed(storedLayout.panelCollapsed);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const openInspector = useCallback(
    (mode?: PanelMode) => {
      if (mode) setPanelMode(mode);
      writeStoredLayout({ queueCollapsed, panelCollapsed: false });
      setPanelCollapsed((prev) => {
        if (prev) triggerAnimating();
        return false;
      });
      setMobileSurface("inspector");
    },
    [queueCollapsed, setPanelMode, triggerAnimating],
  );

  const openQueue = useCallback(() => {
    writeStoredLayout({ queueCollapsed: false, panelCollapsed });
    setQueueCollapsed((prev) => {
      if (prev) triggerAnimating();
      return false;
    });
    setMobileSurface("queue");
  }, [panelCollapsed, triggerAnimating]);

  const focusGallery = useCallback(() => {
    writeStoredLayout({ queueCollapsed: true, panelCollapsed: true });
    setQueueCollapsed((prev) => {
      if (!prev) triggerAnimating();
      return true;
    });
    setPanelCollapsed((prev) => {
      if (!prev) triggerAnimating();
      return true;
    });
    setMobileSurface("gallery");
  }, [triggerAnimating]);

  const restoreWorkspace = useCallback(() => {
    writeStoredLayout({ queueCollapsed: false, panelCollapsed: false });
    setQueueCollapsed((prev) => {
      if (prev) triggerAnimating();
      return false;
    });
    setPanelCollapsed((prev) => {
      if (prev) triggerAnimating();
      return false;
    });
    setMobileSurface("gallery");
  }, [triggerAnimating]);

  const collapseQueue = useCallback(() => {
    writeStoredLayout({ queueCollapsed: true, panelCollapsed });
    triggerAnimating();
    setQueueCollapsed(true);
  }, [panelCollapsed, triggerAnimating]);

  const collapsePanel = useCallback(() => {
    writeStoredLayout({ queueCollapsed, panelCollapsed: true });
    triggerAnimating();
    setPanelCollapsed(true);
  }, [queueCollapsed, triggerAnimating]);

  useEffect(() => {
    if (openPanelRequest === 0) return;
    writeStoredLayout({ queueCollapsed, panelCollapsed: false });
    setPanelCollapsed((prev) => {
      if (prev) triggerAnimating();
      return false;
    });
    setMobileSurface("inspector");
  }, [openPanelRequest, queueCollapsed, triggerAnimating]);

  const navItems = [
    { label: "创建", icon: IconPlus, onClick: () => openInspector("create"), active: !panelCollapsed && panelMode === "create" },
    { label: "队列", icon: IconList, onClick: openQueue, active: !queueCollapsed },
    { label: "画廊", icon: IconImage, onClick: focusGallery, active: queueCollapsed && panelCollapsed },
  ];

  return (
    <div
      className="workbench-shell flex h-dvh overflow-hidden bg-zinc-950 text-zinc-100"
      data-queue-collapsed={queueCollapsed}
      data-panel-collapsed={panelCollapsed}
      data-mobile-surface={mobileSurface}
      data-animating={animating ? "true" : undefined}
    >
      <nav className="hidden w-16 shrink-0 flex-col items-center border-r border-white/10 bg-zinc-950/95 py-3 md:flex">
        <button
          type="button"
          className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400 text-zinc-950 shadow-lg shadow-cyan-950/40"
          onClick={() => openInspector("create")}
          aria-label="新建任务"
          title="新建任务"
        >
          <IconBolt className="h-5 w-5" />
        </button>

        <div className="flex flex-1 flex-col gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                  item.active
                    ? "bg-white/10 text-cyan-200 ring-1 ring-white/10"
                    : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
                }`}
                onClick={item.onClick}
                aria-label={item.label}
                title={item.label}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
          onClick={restoreWorkspace}
          aria-label="恢复工作区"
          title="恢复工作区"
        >
          <IconSettings className="h-4 w-4" />
        </button>
      </nav>

      <aside
        className="workbench-queue-pane hidden shrink-0 overflow-hidden border-r border-white/10 bg-zinc-950 lg:block"
        aria-hidden={queueCollapsed}
        inert={queueCollapsed ? true : undefined}
      >
        <div className="workbench-queue-content flex h-full w-[300px] flex-col bg-zinc-950">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-100">幻希赛隆</div>
              <div className="mt-0.5 text-xs text-zinc-500">资产生成任务</div>
            </div>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
              onClick={collapseQueue}
              aria-label="收起任务队列"
            >
              <IconChevronLeft className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">{sidebar}</div>
        </div>
      </aside>

      <button
        type="button"
        className="workbench-queue-reveal hidden shrink-0 items-center justify-center overflow-hidden border-r border-white/10 bg-zinc-950 text-zinc-500 transition-colors hover:text-zinc-200 lg:flex"
        onClick={() => {
          writeStoredLayout({ queueCollapsed: false, panelCollapsed });
          triggerAnimating();
          setQueueCollapsed(false);
        }}
        aria-label="展开任务队列"
        title="展开任务队列"
        tabIndex={queueCollapsed ? 0 : -1}
        aria-hidden={!queueCollapsed}
      >
        <IconChevronRight className="h-4 w-4" />
      </button>

      <main className="workbench-main flex min-w-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_34rem),#09090b]">
        {main}
      </main>

      <aside
        className={inspectorPaneClassName}
        aria-hidden={panelCollapsed}
        inert={panelCollapsed ? true : undefined}
      >
        <div className="workbench-inspector-content flex h-full w-[680px] flex-col 2xl:w-[760px]">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
            <div>
              <div className="text-sm font-semibold text-zinc-100">Inspector</div>
              <div className="mt-0.5 text-xs text-zinc-500">创建参数与任务详情</div>
            </div>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
              onClick={collapsePanel}
              aria-label="收起检查器"
            >
              <IconChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">{panel}</div>
        </div>
      </aside>

      <button
        type="button"
        className="inspector-reveal-tab fixed right-0 top-1/2 z-10 hidden -translate-y-1/2 flex-col items-center gap-2 rounded-l-xl border border-r-0 border-cyan-300/40 bg-zinc-950/95 px-2.5 py-4 text-cyan-100 shadow-2xl shadow-cyan-950/50 backdrop-blur transition-[transform,background-color,border-color,color,opacity] duration-300 hover:-translate-x-1 hover:border-cyan-200/70 hover:bg-cyan-400 hover:text-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 xl:flex"
        onClick={() => {
          writeStoredLayout({ queueCollapsed, panelCollapsed: false });
          triggerAnimating();
          setPanelCollapsed(false);
        }}
        aria-label="展开检查器"
        title="展开检查器"
        tabIndex={panelCollapsed ? 0 : -1}
        aria-hidden={!panelCollapsed}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_14px_currentColor]" />
        <IconChevronLeft className="h-5 w-5" />
        <span className="h-8 w-px rounded-full bg-current/45" />
      </button>

      {mobileSurface === "queue" && (
        <div className="fixed inset-x-3 bottom-16 top-3 z-30 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/60 lg:hidden">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-3">
            <span className="text-sm font-semibold text-zinc-100">任务队列</span>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
              onClick={() => setMobileSurface("gallery")}
              aria-label="关闭任务队列"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{sidebar}</div>
        </div>
      )}

      {mobileSurface === "inspector" && (
        <div className="fixed inset-x-3 bottom-16 top-3 z-30 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/60 xl:hidden">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-3">
            <span className="text-sm font-semibold text-zinc-100">Inspector</span>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
              onClick={() => setMobileSurface("gallery")}
              aria-label="关闭检查器"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{panel}</div>
        </div>
      )}

      <div className="fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-full border border-white/10 bg-zinc-950/90 p-1 shadow-2xl shadow-black/50 backdrop-blur md:hidden">
        <button
          type="button"
          className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
            mobileSurface === "queue" ? "bg-cyan-400 text-zinc-950" : "text-zinc-300"
          }`}
          onClick={openQueue}
        >
          <IconList className="h-3.5 w-3.5" />
          队列
        </button>
        <button
          type="button"
          className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
            mobileSurface === "gallery" ? "bg-cyan-400 text-zinc-950" : "text-zinc-300"
          }`}
          onClick={() => setMobileSurface("gallery")}
        >
          <IconGrid className="h-3.5 w-3.5" />
          画廊
        </button>
        <button
          type="button"
          className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
            mobileSurface === "inspector" && panelMode === "create" ? "bg-cyan-400 text-zinc-950" : "text-zinc-300"
          }`}
          onClick={() => openInspector("create")}
        >
          <IconPlus className="h-3.5 w-3.5" />
          创建
        </button>
        <button
          type="button"
          className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
            mobileSurface === "inspector" && panelMode === "detail" ? "bg-cyan-400 text-zinc-950" : "text-zinc-300"
          }`}
          onClick={() => openInspector("detail")}
        >
          <IconPanelRight className="h-3.5 w-3.5" />
          详情
        </button>
      </div>
    </div>
  );
}
