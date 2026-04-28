import type { ModelOption } from "@/lib/api/image-workflow.types";

interface ThreeViewParamsProps {
  modelKey: string;
  setModelKey: (s: string) => void;
  modelOptions: ModelOption[];
  size: string;
  setSize: (s: string) => void;
  negative: string;
  setNegative: (s: string) => void;
  seed: string;
  setSeed: (s: string) => void;
}

export function ThreeViewParams({
  modelKey,
  setModelKey,
  modelOptions,
  size,
  setSize,
  negative,
  setNegative,
  seed,
  setSeed,
}: ThreeViewParamsProps) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-zinc-400">模型</span>
          <select
            value={modelKey}
            onChange={(e) => setModelKey(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none focus:border-cyan-400/50"
          >
            {modelOptions.map((model) => (
              <option key={model.modelKey} value={model.modelKey}>
                {model.modelKey}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">尺寸</span>
          <input
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none focus:border-cyan-400/50"
          />
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">细节</span>
          <input
            type="number"
            min={0}
            max={4294967295}
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="0 ~ 4294967295，留空随机"
            className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-400/50"
          />
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">
            较小值更平滑规整；较大值更随机。
          </p>
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">反向提示词</span>
          <input
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
            placeholder="不希望出现的内容"
            className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-400/50"
          />
        </label>
      </div>
    </div>
  );
}
