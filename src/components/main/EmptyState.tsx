import { IconImage, IconCursor, IconInbox } from "@/components/icons";

interface EmptyStateProps {
  icon: "image" | "cursor" | "inbox";
  title: string;
  description: string;
}

const iconMap = {
  image: IconImage,
  cursor: IconCursor,
  inbox: IconInbox,
};

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  const Icon = iconMap[icon];
  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-white/10 bg-zinc-950/35 p-8 text-zinc-500">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-400 ring-1 ring-white/10">
        <Icon className="h-8 w-8" />
      </div>
      <div className="text-center">
        <div className="text-sm font-medium text-zinc-200">{title}</div>
        <div className="mt-1 max-w-xs text-xs leading-5 text-zinc-500">{description}</div>
      </div>
    </div>
  );
}
