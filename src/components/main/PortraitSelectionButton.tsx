import { IconCheck, IconSpinner } from "@/components/icons";

interface PortraitSelectionButtonProps {
  selected: boolean;
  loading: boolean;
  onToggle: () => void;
}

export function PortraitSelectionButton({ selected, loading, onToggle }: PortraitSelectionButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
        selected
          ? "bg-emerald-400 text-zinc-950 hover:bg-emerald-300"
          : "bg-zinc-950/80 text-cyan-100 ring-1 ring-cyan-300/30 backdrop-blur hover:bg-cyan-400 hover:text-zinc-950"
      }`}
      disabled={loading}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      aria-pressed={selected}
      aria-label={selected ? "取消选择定妆照" : "选为定妆照"}
    >
      {loading ? (
        <IconSpinner className="h-3.5 w-3.5" />
      ) : (
        <IconCheck className="h-3.5 w-3.5" />
      )}
      {selected ? "已选定妆照" : "选为定妆照"}
    </button>
  );
}
