import { useState } from "react";
import { ImagePlus, Loader2, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { type NovaAssessoria, useAssessorias } from "@/hooks/useAssessorias";
import { type Assessoria, PALETAS_SUGERIDAS, type PaletaBase, hexValido, paletaDe, temaDaPaleta } from "@/lib/identidade-relatorio";
import { errorMessage } from "@/lib/utils";

const TIPOS = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const TAMANHO_MAXIMO = 1024 * 1024;

const CAMPOS_COR: Array<{ chave: keyof PaletaBase; coluna: keyof NovaAssessoria; rotulo: string; ajuda: string }> = [
  { chave: "primaria", coluna: "cor_primaria", rotulo: "Primária", ajuda: "Títulos, ícones e destaques" },
  { chave: "secundaria", coluna: "cor_secundaria", rotulo: "Secundária", ajuda: "Capa e faixa de resumo (tom escuro)" },
  { chave: "destaque", coluna: "cor_destaque", rotulo: "Destaque", ajuda: "Trechos em destaque sobre a capa" },
  { chave: "fundo", coluna: "cor_fundo", rotulo: "Fundo", ajuda: "Seções alternadas (tom bem claro)" },
  { chave: "texto", coluna: "cor_texto", rotulo: "Texto", ajuda: "Texto principal" },
];

function vazia(): NovaAssessoria {
  const p = PALETAS_SUGERIDAS[0].paleta;
  return {
    nome: "", aliases: [], logo_url: null, modelo: "padrao",
    cor_primaria: p.primaria, cor_secundaria: p.secundaria, cor_destaque: p.destaque, cor_fundo: p.fundo, cor_texto: p.texto,
  };
}

/** Miniatura da capa do relatorio com as cores escolhidas. */
function Amostra({ paleta, nome, logo }: { paleta: PaletaBase; nome: string; logo: string | null }) {
  const t = temaDaPaleta(paleta);
  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="flex items-center gap-2 px-3 py-3 text-white" style={{ background: `linear-gradient(135deg, ${t.capa1}, ${t.capa2} 55%, ${t.capa3})` }}>
        {logo ? (
          <span className="flex h-9 max-w-[96px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-white px-1.5">
            <img src={logo} alt="" className="max-h-7 w-auto object-contain" />
          </span>
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold" style={{ background: t.primaria }}>
            {nome.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="truncate text-xs font-semibold uppercase tracking-wide">{nome || "Assessoria"}</span>
      </div>
      <div className="flex items-end gap-3 px-3 py-2.5" style={{ background: t.fundo }}>
        <div>
          <div className="text-[10px] font-semibold" style={{ color: t.primaria }}>Visão geral</div>
          <div className="text-sm font-bold" style={{ color: t.forte }}>R$ 10,56</div>
        </div>
        <div className="text-[10px]" style={{ color: t.texto }}>custo por mensagem</div>
      </div>
    </div>
  );
}

/** Cadastro das assessorias (marcas) da empresa: nome, aliases, logo e cores dos relatorios. */
export function AssessoriasCard() {
  const { empresa } = useAuth();
  const { assessorias, disponivel, carregando, salvar, remover } = useAssessorias();
  const [editando, setEditando] = useState<NovaAssessoria | null>(null);
  const [aliasesTexto, setAliasesTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const [logoDireto, setLogoDireto] = useState<string | null>(null);

  if (carregando || !disponivel) return null;

  function abrir(a: NovaAssessoria) {
    setEditando(a);
    setAliasesTexto(a.aliases.join(", "));
  }

  async function subirLogo(file: File): Promise<string | null> {
    if (!empresa) return null;
    if (!TIPOS.includes(file.type)) { toast.error("Use PNG, JPG, SVG ou WEBP"); return null; }
    if (file.size > TAMANHO_MAXIMO) { toast.error("O logo precisa ter até 1 MB"); return null; }
    const extensao = file.name.split(".").pop()?.toLowerCase() || "png";
    // Nome novo a cada envio: a CDN guardaria o logo antigo no mesmo caminho.
    const caminho = `${empresa.id}/assessoria-${Date.now()}.${extensao}`;
    const { error } = await supabase.storage.from("branding").upload(caminho, file, { contentType: file.type });
    if (error) { toast.error(error.message); return null; }
    return supabase.storage.from("branding").getPublicUrl(caminho).data.publicUrl;
  }

  async function enviarLogo(file: File) {
    if (!editando) return;
    setEnviandoLogo(true);
    const url = await subirLogo(file);
    setEnviandoLogo(false);
    if (url) setEditando({ ...editando, logo_url: url });
  }

  async function enviarLogoDireto(a: Assessoria, file: File) {
    setLogoDireto(a.id);
    try {
      const url = await subirLogo(file);
      if (!url) return;
      await salvar({ ...a, logo_url: url });
      toast.success(`Logo da ${a.nome} atualizada`);
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível salvar a logo"));
    } finally {
      setLogoDireto(null);
    }
  }

  async function gravar(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    if (!editando.nome.trim()) return toast.error("A assessoria precisa de um nome");
    const invalida = CAMPOS_COR.find((c) => !hexValido(editando[c.coluna] as string));
    if (invalida) return toast.error(`Cor ${invalida.rotulo.toLowerCase()} inválida: use #RRGGBB`);
    setSalvando(true);
    try {
      await salvar({
        ...editando,
        nome: editando.nome.trim(),
        aliases: aliasesTexto.split(",").map((a) => a.trim()).filter(Boolean),
      });
      toast.success("Assessoria salva");
      setEditando(null);
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível salvar a assessoria"));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string, nome: string) {
    if (!window.confirm(`Excluir ${nome}? Os clientes vinculados ficam sem assessoria; relatórios já gerados não mudam.`)) return;
    try {
      await remover(id);
      toast.success("Assessoria excluída");
    } catch (err) {
      toast.error(errorMessage(err, "Não foi possível excluir"));
    }
  }

  const paletaEditando = editando ? paletaDe(editando) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5 text-primary" /> Assessorias e identidade dos relatórios</CardTitle>
          <CardDescription>
            Cada cliente aponta para uma assessoria; o relatório sai com a logo e as cores dela. Os apelidos ajudam a reconhecer a assessoria escrita em texto.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => abrir(vazia())}><Plus className="mr-1.5 h-4 w-4" /> Nova</Button>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {assessorias.map((a) => (
          <div key={a.id} className="space-y-2 rounded-xl border p-3">
            <Amostra paleta={paletaDe(a)} nome={a.nome} logo={a.logo_url} />
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{a.nome}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {a.aliases.length ? `Também: ${a.aliases.join(", ")}` : "Sem apelidos"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Label className="cursor-pointer" title={a.logo_url ? "Trocar logo" : "Enviar logo"}>
                  <span className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs hover:bg-muted ${a.logo_url ? "" : "border-primary/40 text-primary"}`}>
                    {logoDireto === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                    {a.logo_url ? "Trocar logo" : "Enviar logo"}
                  </span>
                  <input
                    type="file"
                    accept={TIPOS.join(",")}
                    className="hidden"
                    disabled={logoDireto === a.id}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) enviarLogoDireto(a, f);
                    }}
                  />
                </Label>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrir(a)} aria-label={`Editar ${a.nome}`}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => excluir(a.id, a.nome)} aria-label={`Excluir ${a.nome}`}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        ))}
        {assessorias.length === 0 && (
          <p className="text-sm text-muted-foreground sm:col-span-2">Nenhuma assessoria cadastrada. Os relatórios saem com a marca da empresa, no azul padrão.</p>
        )}
      </CardContent>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl sm:max-w-xl">
          {editando && paletaEditando && (
            <form onSubmit={gravar} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{editando.id ? `Editar ${editando.nome}` : "Nova assessoria"}</DialogTitle>
                <DialogDescription>Mudar aqui vale para os próximos relatórios. Os já gerados guardam a identidade que usaram.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Nome oficial</Label>
                  <Input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} placeholder="Ex.: Midsam Log" />
                </div>
                <div className="space-y-1.5">
                  <Label>Apelidos <span className="font-normal text-muted-foreground">(separados por vírgula)</span></Label>
                  <Input value={aliasesTexto} onChange={(e) => setAliasesTexto(e.target.value)} placeholder="Mid Log, MidLog" />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white">
                  {editando.logo_url ? <img src={editando.logo_url} alt="Logo da assessoria" className="h-full w-full object-contain" /> : <ImagePlus className="h-5 w-5 text-muted-foreground" />}
                </span>
                <Label className="cursor-pointer">
                  <span className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                    {enviandoLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    {editando.logo_url ? "Trocar logo" : "Enviar logo"}
                  </span>
                  <input type="file" accept={TIPOS.join(",")} className="hidden" onChange={(e) => e.target.files?.[0] && enviarLogo(e.target.files[0])} />
                </Label>
                {editando.logo_url && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditando({ ...editando, logo_url: null })}>Tirar</Button>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label>Cores</Label>
                  {PALETAS_SUGERIDAS.map((s) => (
                    <Button
                      key={s.nome}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => setEditando({
                        ...editando,
                        cor_primaria: s.paleta.primaria, cor_secundaria: s.paleta.secundaria, cor_destaque: s.paleta.destaque,
                        cor_fundo: s.paleta.fundo, cor_texto: s.paleta.texto,
                      })}
                    >
                      <span className="h-3 w-3 rounded-full" style={{ background: s.paleta.primaria }} /> {s.nome}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CAMPOS_COR.map((c) => (
                    <div key={c.chave} className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={`Cor ${c.rotulo}`}
                        value={paletaEditando[c.chave]}
                        onChange={(e) => setEditando({ ...editando, [c.coluna]: e.target.value })}
                        className="h-9 w-10 shrink-0 cursor-pointer rounded border bg-transparent"
                      />
                      <div className="min-w-0 flex-1">
                        <Input
                          value={editando[c.coluna] as string}
                          onChange={(e) => setEditando({ ...editando, [c.coluna]: e.target.value })}
                          className="h-8 font-mono text-xs"
                        />
                        <span className="block truncate text-[10px] text-muted-foreground">{c.rotulo} · {c.ajuda}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Amostra paleta={paletaEditando} nome={editando.nome} logo={editando.logo_url} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
                <Button type="submit" disabled={salvando}>
                  {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
