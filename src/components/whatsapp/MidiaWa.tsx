import { useState } from "react";
import { FileText, Image as ImageIcon, Loader2, Mic, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TipoMidia } from "@/lib/whatsapp-midia";

const ROTULO: Record<TipoMidia, { texto: string; Icone: typeof Mic }> = {
  audio: { texto: "Ouvir áudio", Icone: Mic },
  imagem: { texto: "Ver imagem", Icone: ImageIcon },
  video: { texto: "Ver vídeo", Icone: Video },
  documento: { texto: "Abrir documento", Icone: FileText },
  figurinha: { texto: "Ver figurinha", Icone: ImageIcon },
};

// A URL da uazapi vale 2 dias: guardar na sessao evita pedir de novo a cada
// troca de conversa, sem guardar nada no banco.
const cache = new Map<string, string>();

// So busca no clique: abrir uma conversa com 50 audios nao pode virar 50
// downloads na uazapi.
export function MidiaWa({ mensagemId, tipo }: { mensagemId: string; tipo: TipoMidia }) {
  const [url, setUrl] = useState<string | null>(cache.get(mensagemId) ?? null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    const { data, error } = await supabase.functions.invoke("wa-midia", { body: { id: mensagemId } });
    setCarregando(false);
    if (error || !data?.url) {
      const detalhe = await (error as { context?: { json?: () => Promise<{ error?: string }> } } | null)
        ?.context?.json?.().catch(() => null);
      setErro(detalhe?.error ?? data?.error ?? "Arquivo indisponível");
      return;
    }
    cache.set(mensagemId, data.url);
    setUrl(data.url);
  }

  if (!url) {
    const { texto, Icone } = ROTULO[tipo];
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs font-medium hover:bg-background"
        >
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icone className="h-4 w-4" />}
          {texto}
        </button>
        {erro && <p className="text-[11px] text-destructive">{erro}</p>}
      </div>
    );
  }

  if (tipo === "audio") return <audio controls autoPlay src={url} className="h-10 max-w-[260px]" />;
  if (tipo === "video") return <video controls src={url} className="max-h-72 max-w-full rounded-lg" />;
  if (tipo === "documento") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs font-medium text-primary underline">
        <FileText className="h-4 w-4" /> Abrir documento
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="" className={tipo === "figurinha" ? "h-28 w-28 object-contain" : "max-h-72 max-w-full rounded-lg"} />
    </a>
  );
}
