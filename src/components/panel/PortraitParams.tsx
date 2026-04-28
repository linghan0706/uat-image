import type {
  ModelOption,
  PortraitBackgroundMode,
} from "@/lib/api/image-workflow.types";

interface PortraitParamsProps {
  count: number;
  setCount: (n: number) => void;
  backgroundMode: PortraitBackgroundMode;
  setBackgroundMode: (mode: PortraitBackgroundMode) => void;
  negative: string;
  setNegative: (s: string) => void;
  seed: string;
  setSeed: (s: string) => void;
  modelKey: string;
  setModelKey: (s: string) => void;
  modelOptions: ModelOption[];
}

export function PortraitParams({
  count,
  setCount,
  backgroundMode,
  setBackgroundMode,
  negative,
  setNegative,
  seed,
  setSeed,
  modelKey,
  setModelKey,
  modelOptions,
}: PortraitParamsProps) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-zinc-400">模型（文生图）</span>
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
        <div className="text-sm">
          <span className="text-zinc-400">画面</span>
          <div className="mt-1 grid h-9 grid-cols-2 rounded-lg border border-white/10 bg-zinc-950 p-0.5">
            {([
              ["studio", "影棚"],
              ["scene", "场景"],
            ] as const).map(([mode, label]) => {
              const isActive = backgroundMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setBackgroundMode(mode)}
                  className={`rounded-md px-2 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-cyan-400 text-zinc-950"
                      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <label className="text-sm">
          <span className="text-zinc-400">生成张数</span>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none focus:border-cyan-400/50"
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>{n} 张</option>
            ))}
          </select>
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
