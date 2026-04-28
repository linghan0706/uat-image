import type { FunctionalCapability } from "@/lib/api/image-workflow.types";
import { CAPABILITY_OPTIONS } from "@/lib/constants";

interface CapabilitySelectorProps {
  value: FunctionalCapability;
  onChange: (cap: FunctionalCapability) => void;
}

export function CapabilitySelector({ value, onChange }: CapabilitySelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {CAPABILITY_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-lg border p-2.5 text-left transition-colors ${
            value === option.value
              ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100"
              : "border-white/10 bg-zinc-950 text-zinc-200 hover:border-white/20 hover:bg-white/[0.04]"
          }`}
        >
          <div className="text-sm font-semibold">{option.label}</div>
          <div className="mt-0.5 text-xs text-zinc-500">{option.desc}</div>
        </button>
      ))}
    </div>
  );
}
