"use client";

import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { AssetBrowser } from "@/components/main/AssetBrowser";
import { RightPanel } from "@/components/layout/RightPanel";
import { Lightbox } from "@/components/shared/Lightbox";

export default function HomePage() {
  return (
    <WorkspaceProvider>
      <AppShell
        sidebar={<Sidebar />}
        main={<AssetBrowser />}
        panel={<RightPanel />}
      />
      <Lightbox />
    </WorkspaceProvider>
  );
}
