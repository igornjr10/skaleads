import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/utils";
import { TextoComVariaveis } from "./TextoComVariaveis";

interface Modelo { id: string; nome: string; texto: string; created_by: string | null }

export function ModelosTab({ meuId, isAdmin }: { meuId: string | undefined; isAdmin: boolean }) {
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [editando, setEditando] = useState<{ id: string | null; nome: string; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    const { data } = await supabase.from("wa_modelos").select("id, nome, texto, created_by").order("nome");
    setModelos((data ?? []) as Modelo[]);
  }
  useEffect(() => { carregar(); }, []);

  async function salvar() {
    if (!editando) return;
    if (!editando.nome.trim() || !editando.texto.trim()) return toast.error("Dê um nome e escreva o texto");
    setSalvando(true);
    const dados = { nome: editando.nome.trim(), texto: editando.texto.trim() };
    const { error } = editando.id
      ? await supabase.from("wa_modelos").update(dados).eq("id", editando.id)
      : await supabase.from("wa_modelos").insert(dados);
    setSalvando(false);
    if (error) return toast.error(errorMessage(error, "Não foi possível salvar"));
    setEditando(null);
    carregar();
  }

  async function apagar(m: Modelo) {
    const { error } = await supabase.from("wa_modelos").delete().eq("id", m.id);
    if (error) return toast.error(errorMessage(error, "Não foi possível apagar"));
    setModelos(atual => atual?.filter(x => x.id !== m.id) ?? null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Mensagens prontas para responder rápido, disparar e montar sequências.</p>
        <Button onClick={() => setEditando({ id: null, nome: "", texto: "" })}><Plus className="mr-1.5 h-4 w-4" /> Modelo</Button>
      </div>
      {modelos === null ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {modelos.map(m => {
            const meu = isAdmin || m.created_by === meuId;
            return (
              <Card key={m.id} className="shadow-card">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{m.nome}</span>
                    {meu && (
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditando({ id: m.id, nome: m.nome, texto: m.texto })}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => apagar(m)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </div>
                  <p className="line-clamp-5 whitespace-pre-wrap text-sm text-muted-foreground">{m.texto}</p>
                </CardContent>
              </Card>
            );
          })}
          {modelos.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">Nenhum modelo ainda.</p>
          )}
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={open => !open && setEditando(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editando?.id ? "Editar modelo" : "Novo modelo"}</DialogTitle></DialogHeader>
          {editando && (
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={editando.nome} onChange={e => setEditando({ ...editando, nome: e.target.value })} placeholder="Ex.: Primeiro contato — padaria" />
              </div>
              <TextoComVariaveis valor={editando.texto} onChange={texto => setEditando({ ...editando, texto })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
