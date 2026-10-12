import type { LinhaGrupo } from "./grupos-logica";

const TOM_AMBER_FORTE = "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300";
const TOM_AMBER = "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-400";
const TOM_EMERALD = "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
const TOM_SLATE = "border-border/70 bg-muted/40 text-muted-foreground";

export function statusDaLinha(l: LinhaGrupo): { rotulo: string; classe: string; ponto: string } {
  if (l.situacao === "sem_grupo") return { rotulo: "Sem grupo", classe: TOM_SLATE, ponto: "bg-muted-foreground/60" };
  if (l.situacao === "sem_cliente") return { rotulo: "Sem cliente", classe: TOM_SLATE, ponto: "bg-muted-foreground/60" };
  if (!l.triagem) return { rotulo: "Sem leitura", classe: TOM_SLATE, ponto: "bg-muted-foreground/60" };
  switch (l.triagem.atencao) {
    case "urgente": return { rotulo: "Urgente", classe: TOM_AMBER_FORTE, ponto: "bg-amber-500" };
    case "atencao": return { rotulo: "Esperando", classe: TOM_AMBER, ponto: "bg-amber-400/80" };
    default: return { rotulo: "Respondido", classe: TOM_EMERALD, ponto: "bg-emerald-500" };
  }
}

/** Faixa lateral do card: so acende quando ha algo a fazer, para o olho achar rapido. */
export function faixaDaLinha(l: LinhaGrupo) {
  if (l.triagem?.atencao === "urgente") return "before:bg-amber-500";
  if (l.triagem?.atencao === "atencao") return "before:bg-amber-400/50";
  if (l.triagem?.atencao === "ok") return "before:bg-emerald-500/50";
  return "before:bg-border";
}
