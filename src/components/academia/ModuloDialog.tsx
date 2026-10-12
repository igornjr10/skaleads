import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/utils";
import { CATEGORIAS, type CategoriaAcademia, type ModuloAcademia } from "@/lib/academia";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modulo: ModuloAcademia | null;
  ordemSugerida: number;
  onSalvo: () => void;
}

export function ModuloDialog({ open, onOpenChange, modulo, ordemSugerida, onSalvo }: Props) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<CategoriaAcademia>("operacao");
  const [ordem, setOrdem] = useState("1");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitulo(modulo?.titulo ?? "");
    setDescricao(modulo?.descricao ?? "");
    setCategoria(modulo?.categoria ?? "operacao");
    setOrdem(String(modulo?.ordem ?? ordemSugerida));
  }, [open, modulo, ordemSugerida]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) {
      toast.error("Dê um título ao módulo");
      return;
    }
    setSalvando(true);
    const dados = {
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      categoria,
      ordem: Number.parseInt(ordem, 10) || 0,
    };
    const { error } = modulo
      ? await supabase.from("academia_modulos").update(dados).eq("id", modulo.id)
      : await supabase.from("academia_modulos").insert(dados);
    setSalvando(false);
    if (error) {
      toast.error(errorMessage(error, "Não foi possível salvar o módulo"));
      return;
    }
    toast.success(modulo ? "Módulo atualizado" : "Módulo criado");
    onOpenChange(false);
    onSalvo();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{modulo ? "Editar módulo" : "Novo módulo"}</DialogTitle>
          <DialogDescription>Agrupe aulas de um mesmo tema. A ordem define a sequência da trilha.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mod-titulo">Título</Label>
            <Input id="mod-titulo" value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={120} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mod-desc">Descrição</Label>
            <Textarea id="mod-desc" value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} />
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={v => setCategoria(v as CategoriaAcademia)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mod-ordem">Ordem</Label>
              <Input id="mod-ordem" type="number" inputMode="numeric" value={ordem} onChange={e => setOrdem(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
