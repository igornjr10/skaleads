import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage } from "@/lib/utils";
import type { Etapa, Lead } from "@/lib/comercial";

type Linha = { id: string | null; nome: string; tipo: Etapa["tipo"] };

/** Editor das etapas de um funil: renomear, reordenar, criar e tirar (so as vazias). */
export function EtapasDialog({ open, onOpenChange, funilId, etapas, leads, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funilId: string | null;
  etapas: Etapa[];
  leads: Lead[];
  onSaved: () => void;
}) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLinhas(etapas.filter(e => e.funil_id === funilId).sort((a, b) => a.posicao - b.posicao)
      .map(e => ({ id: e.id, nome: e.nome, tipo: e.tipo })));
  }, [open, funilId, etapas]);

  const emUso = (id: string | null) => !!id && leads.some(l => l.etapa_id === id);

  function mover(i: number, passo: -1 | 1) {
    const j = i + passo;
    if (j < 0 || j >= linhas.length) return;
    const nova = [...linhas];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setLinhas(nova);
  }

  async function salvar() {
    if (!funilId) return;
    if (linhas.some(l => !l.nome.trim())) return toast.error("Toda etapa precisa de nome");
    if (!linhas.some(l => l.tipo === "ganho")) return toast.error("O funil precisa de uma etapa de ganho");
    if (!linhas.some(l => l.tipo === "aberta")) return toast.error("O funil precisa de pelo menos uma etapa aberta");
    setSalvando(true);
    try {
      const atuais = etapas.filter(e => e.funil_id === funilId);
      const removidas = atuais.filter(e => !linhas.some(l => l.id === e.id));
      if (removidas.length) {
        const { error } = await supabase.from("crm_etapas").delete().in("id", removidas.map(e => e.id));
        if (error) throw error;
      }
      for (const [i, l] of linhas.entries()) {
        const dados = { funil_id: funilId, nome: l.nome.trim(), tipo: l.tipo, posicao: i + 1 };
        const { error } = l.id
          ? await supabase.from("crm_etapas").update(dados).eq("id", l.id)
          : await supabase.from("crm_etapas").insert(dados);
        if (error) throw error;
      }
      toast.success("Etapas salvas");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível salvar as etapas"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Etapas do funil</DialogTitle>
          <DialogDescription>
            A ordem aqui é a ordem das colunas. Etapa com lead não pode ser tirada: mova os leads antes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {linhas.map((l, i) => (
            <div key={l.id ?? `nova-${i}`} className="flex items-center gap-2">
              <div className="flex flex-col">
                <button type="button" aria-label="Subir" onClick={() => mover(i, -1)} className="text-muted-foreground hover:text-foreground"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label="Descer" onClick={() => mover(i, 1)} className="text-muted-foreground hover:text-foreground"><ArrowDown className="h-3.5 w-3.5" /></button>
              </div>
              <Input value={l.nome} onChange={e => setLinhas(linhas.map((x, k) => (k === i ? { ...x, nome: e.target.value } : x)))} />
              <Select value={l.tipo} onValueChange={tipo => setLinhas(linhas.map((x, k) => (k === i ? { ...x, tipo: tipo as Etapa["tipo"] } : x)))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberta">Em andamento</SelectItem>
                  <SelectItem value="ganho">Ganho</SelectItem>
                  <SelectItem value="perdido">Perdido</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                disabled={emUso(l.id)}
                title={emUso(l.id) ? "Tem lead nesta etapa" : "Tirar etapa"}
                onClick={() => setLinhas(linhas.filter((_, k) => k !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLinhas([...linhas, { id: null, nome: "", tipo: "aberta" }])}>
            <Plus className="mr-1.5 h-4 w-4" /> Etapa
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
