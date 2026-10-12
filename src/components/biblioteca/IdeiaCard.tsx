import { useState, type ReactNode } from "react";
import { Play, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ClientAvatar } from "@/components/ClientAvatar";
import { capaDoYoutube, idDoYoutube, rotuloCategoria, rotuloPlataforma, rotuloTipo, tipoDoArquivo } from "@/lib/biblioteca";
import { cn } from "@/lib/utils";
import { IconeArquivo, PlataformaIcone, type Ideia } from "./comum";

export interface ClienteResumo {
  id: string;
  name: string;
  logo_url: string | null;
}

export function IdeiaCard({
  ideia, cliente, urlArquivo, onAbrir, onFavoritar,
}: {
  ideia: Ideia;
  cliente?: ClienteResumo;
  urlArquivo?: string;
  onAbrir: () => void;
  onFavoritar?: () => void;
}) {
  return (
    <div className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-card transition hover:border-primary/40 hover:shadow-lg">
      <button
        type="button"
        onClick={onAbrir}
        className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Previa ideia={ideia} urlArquivo={urlArquivo} />
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
          <div className="flex min-w-0 items-start gap-2">
            <PlataformaIcone plataforma={ideia.plataforma} className="mt-0.5 h-6 w-6 rounded-lg" tamanho="h-3.5 w-3.5" />
            <p className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-semibold leading-snug" title={ideia.titulo}>
              {ideia.titulo}
            </p>
          </div>
          {ideia.descricao && (
            <p className="line-clamp-2 break-words text-xs text-muted-foreground">{ideia.descricao}</p>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
            <Badge variant="secondary" className="text-[10px]">{rotuloCategoria(ideia.categoria)}</Badge>
            <Badge variant="outline" className="text-[10px]">{rotuloTipo(ideia.tipo_criativo)}</Badge>
            {ideia.tags.slice(0, 2).map(t => (
              <span key={t} className="max-w-[8rem] truncate text-[10px] text-muted-foreground" title={`#${t}`}>#{t}</span>
            ))}
            {ideia.tags.length > 2 && <span className="text-[10px] text-muted-foreground">+{ideia.tags.length - 2}</span>}
          </div>
          {cliente && (
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <ClientAvatar name={cliente.name} logoUrl={cliente.logo_url} className="h-4 w-4" />
              <span className="truncate" title={cliente.name}>{cliente.name}</span>
            </div>
          )}
        </div>
      </button>
      {onFavoritar ? (
        <button
          type="button"
          onClick={onFavoritar}
          aria-label={ideia.favorita ? "Tirar dos favoritos" : "Marcar como favorita"}
          title={ideia.favorita ? "Tirar dos favoritos" : "Marcar como favorita"}
          className={cn(
            "absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/70 backdrop-blur transition",
            ideia.favorita ? "text-amber-400" : "text-muted-foreground opacity-80 hover:text-amber-300 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          <Star className={cn("h-4 w-4", ideia.favorita && "fill-current")} />
        </button>
      ) : ideia.favorita ? (
        <span title="Favorita" className="pointer-events-none absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/70 text-amber-400 backdrop-blur">
          <Star className="h-4 w-4 fill-current" />
        </span>
      ) : null}
    </div>
  );
}

function Previa({ ideia, urlArquivo }: { ideia: Ideia; urlArquivo?: string }) {
  const [falhou, setFalhou] = useState(false);
  const idYoutube = idDoYoutube(ideia.url);
  const tipoArquivo = ideia.arquivo_caminho ? tipoDoArquivo(ideia.arquivo_tipo, ideia.arquivo_nome) : null;

  let conteudo: ReactNode = null;
  if (!falhou && tipoArquivo === "imagem" && urlArquivo) {
    conteudo = <img src={urlArquivo} alt="" loading="lazy" onError={() => setFalhou(true)} className="h-full w-full object-cover" />;
  } else if (!falhou && tipoArquivo === "video" && urlArquivo) {
    conteudo = (
      <>
        <video src={`${urlArquivo}#t=0.5`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
        <SeloPlay />
      </>
    );
  } else if (!falhou && idYoutube) {
    conteudo = (
      <>
        <img src={capaDoYoutube(idYoutube)} alt="" loading="lazy" onError={() => setFalhou(true)} className="h-full w-full object-cover" />
        <SeloPlay />
      </>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-muted/30">
      {conteudo ?? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-muted-foreground">
          {tipoArquivo === "outro" ? (
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <IconeArquivo className="h-7 w-7" />
            </span>
          ) : (
            <PlataformaIcone plataforma={ideia.plataforma} className="h-14 w-14 rounded-2xl" tamanho="h-7 w-7" />
          )}
          <span className="max-w-full truncate text-[11px]" title={ideia.arquivo_nome ?? undefined}>
            {ideia.arquivo_nome ?? rotuloPlataforma(ideia.plataforma)}
          </span>
        </div>
      )}
    </div>
  );
}

function SeloPlay() {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background/70 backdrop-blur">
        <Play className="h-4 w-4 fill-current" />
      </span>
    </span>
  );
}
