import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { aplicarCorDaMarca, hexParaHsl } from "@/lib/marca";
import { MarketProLogo } from "@/components/MarketProLogo";

const TAMANHO_MAXIMO = 1024 * 1024;
const TIPOS = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

export function EmpresaCard() {
  const { empresa, recarregarAcesso } = useAuth();
  const [nome, setNome] = useState("");
  const [nomeExibicao, setNomeExibicao] = useState("");
  const [cor, setCor] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNome(empresa?.name ?? "");
    setNomeExibicao(empresa?.nome_exibicao ?? "");
    setCor(empresa?.cor_primaria ?? "");
    setLogoUrl(empresa?.logo_url ?? null);
  }, [empresa]);

  // Previa ao vivo: a cor muda o app enquanto a pessoa escolhe; sair sem salvar
  // devolve a cor gravada.
  useEffect(() => {
    if (cor === "") aplicarCorDaMarca(null);
    else if (hexParaHsl(cor)) aplicarCorDaMarca(cor);
    return () => aplicarCorDaMarca(empresa?.cor_primaria ?? null);
  }, [cor, empresa?.cor_primaria]);

  if (!empresa) return null;

  const corInvalida = cor !== "" && !hexParaHsl(cor);

  async function enviarLogo(file: File) {
    if (!TIPOS.includes(file.type)) return toast.error("Use PNG, JPG, SVG ou WEBP");
    if (file.size > TAMANHO_MAXIMO) return toast.error("O logo precisa ter até 1 MB");
    setEnviandoLogo(true);
    const extensao = file.name.split(".").pop()?.toLowerCase() || "png";
    // Nome novo a cada envio: o arquivo e publico e cacheado pela CDN, trocar
    // o conteudo no mesmo caminho deixaria o logo antigo aparecendo.
    const caminho = `${empresa!.id}/logo-${Date.now()}.${extensao}`;
    const { error } = await supabase.storage.from("branding").upload(caminho, file, { contentType: file.type });
    setEnviandoLogo(false);
    if (error) return toast.error(error.message);
    setLogoUrl(supabase.storage.from("branding").getPublicUrl(caminho).data.publicUrl);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return toast.error("A empresa precisa de um nome");
    if (corInvalida) return toast.error("Cor inválida: use o formato #RRGGBB");
    setSalvando(true);
    const { error } = await supabase
      .from("companies")
      .update({
        name: nome.trim(),
        nome_exibicao: nomeExibicao.trim() || null,
        cor_primaria: cor || null,
        logo_url: logoUrl,
      })
      .eq("id", empresa!.id);
    setSalvando(false);
    if (error) return toast.error(error.message);
    await recarregarAcesso();
    toast.success("Empresa atualizada");
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Empresa</CardTitle>
        <CardDescription>Nome, logo e cor que a sua equipe vê no sistema.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={salvar} className="grid gap-6 md:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/30">
              {logoUrl
                ? <img src={logoUrl} alt="Logo da empresa" className="h-full w-full object-contain" />
                : <MarketProLogo size={64} />}
            </div>
            <input
              ref={arquivo}
              type="file"
              accept={TIPOS.join(",")}
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) enviarLogo(f); e.target.value = ""; }}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => arquivo.current?.click()} disabled={enviandoLogo}>
                {enviandoLogo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageUp className="mr-2 h-4 w-4" />}
                Logo
              </Button>
              {logoUrl && (
                <Button type="button" variant="ghost" size="icon" title="Tirar logo" onClick={() => setLogoUrl(null)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="empresa-nome">Razão / nome interno</Label>
                <Input id="empresa-nome" value={nome} onChange={e => setNome(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="empresa-exibicao">Nome no sistema</Label>
                <Input
                  id="empresa-exibicao"
                  placeholder={nome || "Como aparece no menu"}
                  value={nomeExibicao}
                  onChange={e => setNomeExibicao(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="empresa-cor">Cor principal</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Escolher cor"
                  value={hexParaHsl(cor) ? cor : "#10b981"}
                  onChange={e => setCor(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-md border border-border bg-transparent p-1"
                />
                <Input
                  id="empresa-cor"
                  className="w-32 font-mono"
                  placeholder="#10b981"
                  value={cor}
                  onChange={e => setCor(e.target.value.trim())}
                />
                {cor && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCor("")}>
                    Usar a padrão
                  </Button>
                )}
              </div>
              {corInvalida && <p className="text-xs text-destructive">Use o formato #RRGGBB</p>}
            </div>
            <Button type="submit" disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
