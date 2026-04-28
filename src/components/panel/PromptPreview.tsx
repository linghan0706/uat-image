import { useMemo } from "react";
import type { PromptRow } from "@/lib/api/image-workflow.types";
import { deriveCharacterNameFromProfileInput, isPlaceholderName } from "@/lib/prompt/character-profile";

interface PromptPreviewProps {
  prompts: PromptRow[];
  onUpdatePrompt: (index: number, prompt: string) => void;
  onRemovePrompt: (index: number) => void;
}

const getDisplayCharacterName = (item: PromptRow) => {
  const derived = deriveCharacterNameFromProfileInput(item.character_profile, item.prompt);
  if (derived) return derived;
  const raw = item.character_name?.trim();
  return raw && !isPlaceholderName(raw) ? raw : null;
};

export function PromptPreview({ prompts, onUpdatePrompt, onRemovePrompt }: PromptPreviewProps) {
  const previewPrompts = useMemo(() => prompts.slice(0, 120), [prompts]);

  if (prompts.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-200">提示词预览（最多120条）</h3>
        <span className="text-xs text-zinc-500">共 {prompts.length} 条</span>
      </div>
      <div className="max-h-[28rem] space-y-2 overflow-auto">
        {previewPrompts.map((item, idx) => (
          <div key={`${item.line_no}-${idx}`} className="rounded-lg border border-white/10 bg-zinc-950 p-2.5">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-zinc-400">行 {item.line_no}</span>
              {getDisplayCharacterName(item) && (
                <span className="rounded-md bg-violet-400/10 px-1.5 py-0.5 text-violet-300">{getDisplayCharacterName(item)}</span>
              )}
              {item.style_key && (
                <span className="rounded-md bg-cyan-400/10 px-1.5 py-0.5 text-cyan-300">风格: {item.style_key}</span>
              )}
            </div>
            <textarea
              className="min-h-20 w-full rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100 outline-none focus:border-cyan-400/50"
              value={item.prompt}
              onChange={(e) => onUpdatePrompt(idx, e.target.value)}
            />
            {item.character_profile && (
              <div className="mt-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-1.5 text-[11px] text-zinc-500">
                <div>姓名: {item.character_profile.name}｜性别: {item.character_profile.gender}</div>
                {item.character_profile.outfit && <div>服装: {item.character_profile.outfit.slice(0, 80)}</div>}
                {item.character_profile.hair && <div>发型: {item.character_profile.hair.slice(0, 80)}</div>}
              </div>
            )}
            {item.prompt_blocks?.part4 && (
              <div className="mt-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-1.5 text-[11px] text-zinc-500">
                参考: {item.prompt_blocks.part4.slice(0, 100)}
              </div>
            )}
            {item.scene_description && (
              <div className="mt-1.5 rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-1.5 text-[11px] text-cyan-100">
                场景: {item.scene_description.slice(0, 120)}
              </div>
            )}
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                className="text-xs text-rose-300 hover:text-rose-200"
                onClick={() => onRemovePrompt(idx)}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
