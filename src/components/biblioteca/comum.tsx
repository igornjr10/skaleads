import { FileText, Globe, HardDrive, Instagram, Lightbulb, Music2, Paperclip, Pin, Facebook, Youtube, type LucideIcon } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

/** Linha de ideias mais a favorita de quem esta logado (vem de ideia_favoritas). */
export type Ideia = Tables<"ideias"> & { favorita: boolean };

export const BUCKET = "biblioteca";

const VISUAL: Record<string, { icone: LucideIcon; cor: string }> = {
  instagram: { icone: Instagram, cor: "text-pink-400 bg-pink-500/10 ring-pink-500/20" },
  tiktok: { icone: Music2, cor: "text-cyan-300 bg-cyan-500/10 ring-cyan-500/20" },
  youtube: { icone: Youtube, cor: "text-red-400 bg-red-500/10 ring-red-500/20" },
  facebook: { icone: Facebook, cor: "text-blue-400 bg-blue-500/10 ring-blue-500/20" },
  drive: { icone: HardDrive, cor: "text-amber-300 bg-amber-500/10 ring-amber-500/20" },
  pinterest: { icone: Pin, cor: "text-rose-400 bg-rose-500/10 ring-rose-500/20" },
  site: { icone: Globe, cor: "text-sky-300 bg-sky-500/10 ring-sky-500/20" },
  arquivo: { icone: Paperclip, cor: "text-primary bg-primary/10 ring-primary/20" },
  outro: { icone: Lightbulb, cor: "text-muted-foreground bg-muted/40 ring-border" },
};

function visualDaPlataforma(plataforma: string) {
  return VISUAL[plataforma] ?? VISUAL.outro;
}

export function PlataformaIcone({ plataforma, className, tamanho = "h-4 w-4" }: { plataforma: string; className?: string; tamanho?: string }) {
  const { icone: Icone, cor } = visualDaPlataforma(plataforma);
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-xl ring-1", cor, className)}>
      <Icone className={tamanho} />
    </span>
  );
}

export const IconeArquivo = FileText;
