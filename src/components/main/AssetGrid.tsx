"use client";

import { useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ImageCard } from "./ImageCard";

export function AssetGrid() {
  const { imageResults, characterNameByItemId, openLightbox, setPortraitSelection, setErrorText } = useWorkspace();
  const [portraitSelectionLoadingId, setPortraitSelectionLoadingId] = useState<string | null>(null);

  const handleTogglePortraitSelection = async (imageId: string, selected: boolean) => {
    setPortraitSelectionLoadingId(imageId);
    try {
      await setPortraitSelection(imageId, selected);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "定妆照选择更新失败");
    } finally {
      setPortraitSelectionLoadingId(null);
    }
  };

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 2xl:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
      {imageResults.map((img, idx) => (
        <ImageCard
          key={img.id}
          image={img}
          characterName={characterNameByItemId.get(img.job_item_id)}
          onClick={() => openLightbox(idx)}
          portraitSelectionLoading={portraitSelectionLoadingId === img.id}
          onTogglePortraitSelection={(imageId, selected) => {
            void handleTogglePortraitSelection(imageId, selected);
          }}
        />
      ))}
    </div>
  );
}
