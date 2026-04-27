import { cn } from "@/lib/utils";

type Status = "ACTIVE" | "PAUSED" | "DELETED" | string;

const styles: Record<string, string> = {
  ACTIVE: "bg-success/15 text-success border-success/30",
  PAUSED: "bg-warning/15 text-warning border-warning/30",
  DELETED: "bg-destructive/15 text-destructive border-destructive/30",
};

const labels: Record<string, string> = {
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  DELETED: "Excluído",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        styles[status] ?? "bg-muted text-muted-foreground border-border"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {labels[status] ?? status}
    </span>
  );
}
