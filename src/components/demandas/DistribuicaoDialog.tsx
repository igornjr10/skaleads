import { useEffect, useState } from "react";
import { Loader2, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SeletorMultiplo } from "@/components/SeletorMultiplo";
import type { Pessoa } from "@/hooks/useDemandas";
import { useDistribuicao, type RegraDistribuicao } from "@/hooks/useDistribuicao";
import { CATEGORIAS } from "@/lib/demandas";
import { rotuloPapel } from "@/lib/permissoes";
import { errorMessage } from "@/lib/utils";

/** ADM define, por categoria, quem recebe as demandas criadas sem responsável. */
export function DistribuicaoDialog({ open, onOpenChange, pessoas }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pessoas: Pessoa[];
}) {
  const { regras, disponivel, salvar } = useDistribuicao(open);
  const [rascunho, setRascunho] = useState<Record<string, RegraDistribuicao>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRascunho(Object.fromEntries(CATEGORIAS.map(c => {
      const r = regras.find(x => x.categoria === c.id);
      return [c.id, { categoria: c.id, pessoas: r?.pessoas ?? [], gestor_do_cliente: r?.gestor_do_cliente ?? false }];
    })));
  }, [open, regras]);

  const opcoes = pessoas.map(p => ({ value: p.id, label: p.nome, detalhe: rotuloPapel(p.role) }));

  async function gravar() {
    setSalvando(true);
    try {
      const mudaram = Object.values(rascunho).filter(r => {
        const antes = regras.find(x => x.categoria === r.categoria);
        return JSON.stringify([...(antes?.pessoas ?? [])].sort()) !== JSON.stringify([...r.pessoas].sort())
          || (antes?.gestor_do_cliente ?? false) !== r.gestor_do_cliente;
      });
      for (const r of mudaram) await salvar(r);
      toast.success("Distribuição salva");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "Não foi possível salvar a distribuição"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Shuffle className="h-5 w-5 text-primary" /> Distribuição automática</DialogTitle>
          <DialogDescription>
            Demanda criada sem responsável vai para quem da categoria estiver com menos demandas abertas.
            A pessoa recebe o aviso no sino e no WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {!disponivel ? (
          <p className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
            A distribuição automática ainda não está ativa neste ambiente.
          </p>
        ) : (
          <div className="divide-y divide-border/50 rounded-2xl border border-border/60">
            {CATEGORIAS.map(c => {
              const r = rascunho[c.id];
              if (!r) return null;
              const set = (m: Partial<RegraDistribuicao>) => setRascunho(atual => ({ ...atual, [c.id]: { ...r, ...m } }));
              return (
                <div key={c.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
                  <span className="text-sm font-medium">{c.label}</span>
                  <div className="min-w-0 space-y-1.5">
                    <SeletorMultiplo
                      opcoes={opcoes}
                      valor={r.pessoas}
                      onChange={v => set({ pessoas: v })}
                      placeholder="Sem distribuição (fica sem responsável)"
                      busca="Buscar pessoa..."
                    />
                    <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Checkbox checked={r.gestor_do_cliente} onCheckedChange={v => set({ gestor_do_cliente: !!v })} />
                      Gestor do cliente primeiro, quando a demanda tem um cliente só
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={gravar} disabled={salvando || !disponivel}>
            {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
