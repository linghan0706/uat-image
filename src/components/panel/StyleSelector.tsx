"use client";

import { useEffect, useState } from "react";
import { getStylePresets, type StylePresetOption } from "@/lib/api/style-presets";

const CATEGORY_LABEL: Record<StylePresetOption["category"], string> = {
  realistic: "写实",
  anime: "动画",
  cdrama: "古装",
  concept: "概念",
};

interface StyleSelectorProps {
  value: string | null;
  onChange: (key: string | null) => void;
}

export function StyleSelector({ value, onChange }: StyleSelectorProps) {
  const [presets, setPresets] = useState<StylePresetOption[]>([]);
  const [defaultKey, setDefaultKey] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getStylePresets()
      .then((data) => {
        if (cancelled) return;
        setPresets(data.presets);
        setDefaultKey(data.default_key);
        setError("");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "加载风格失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeKey = value ?? defaultKey;
  const activeBrief = presets.find((preset) => preset.key === activeKey)?.brief ?? "";

  if (loading) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-zinc-500">
        加载风格中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-400/25 bg-rose-500/10 p-3 text-xs text-rose-200">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const isActive = preset.key === activeKey;
          return (
            <button
              type="button"
              key={preset.key}
              onClick={() => onChange(preset.key)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                isActive
                  ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                  : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/25 hover:text-zinc-100"
              }`}
            >
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                  isActive ? "bg-cyan-400/25 text-cyan-50" : "bg-white/5 text-zinc-500"
                }`}
              >
                {CATEGORY_LABEL[preset.category]}
              </span>
              {preset.label}
            </button>
          );
        })}
      </div>
      {activeBrief && (
        <div className="rounded-lg border border-white/5 bg-zinc-950/60 p-2.5 text-[11px] leading-5 text-zinc-400">
          {activeBrief}
        </div>
      )}
    </div>
  );
}
