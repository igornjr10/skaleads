import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Brain, Crosshair, Eye, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const CORES: Record<string, string> = {
  pessoa: "#ff7a1a",
  cliente: "#4dd4ac",
  projeto: "#5b9cff",
  processo: "#c084fc",
  ferramenta: "#f4d35e",
  ideia: "#ff8fb1",
  decisao: "#8be9fd",
  outros: "#8892a6",
};

const ROTULOS: Record<string, string> = {
  pessoa: "Pessoas",
  cliente: "Clientes",
  projeto: "Projetos",
  processo: "Processos",
  ferramenta: "Ferramentas",
  ideia: "Ideias",
  decisao: "Decisões",
  outros: "Outros",
};

interface Nota {
  id: string;
  titulo: string;
  caminho: string;
  tipo: string;
  resumo: string;
  criado: string;
  atualizado: string;
  exemplo: boolean;
  links: string[];
  corpo: string;
}

interface No extends Nota {
  grau: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  raio: number;
}

interface Aresta {
  de: string;
  para: string;
}

const cor = (tipo: string) => CORES[tipo] ?? CORES.outros;
const rotulo = (tipo: string) => ROTULOS[tipo] ?? tipo;

function montarArestas(notas: Nota[]) {
  const existe = new Set(notas.map((n) => n.id));
  const arestas: Aresta[] = [];
  const vistas = new Set<string>();
  for (const nota of notas) {
    for (const alvo of nota.links ?? []) {
      if (!existe.has(alvo) || alvo === nota.id) continue;
      const chave = `${nota.id}->${alvo}`;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      arestas.push({ de: nota.id, para: alvo });
    }
  }
  return arestas;
}

// markdown minimo: so o que as notas do cerebro usam
function inline(texto: string, porId: Map<string, No>, ir: (id: string) => void): ReactNode[] {
  const partes: ReactNode[] = [];
  const padrao = /\[\[([^\]|#]+)(?:[|#]([^\]]*))?\]\]|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let ultimo = 0;
  let achado: RegExpExecArray | null;
  let chave = 0;

  while ((achado = padrao.exec(texto)) !== null) {
    if (achado.index > ultimo) partes.push(texto.slice(ultimo, achado.index));
    ultimo = achado.index + achado[0].length;

    if (achado[1] !== undefined) {
      const id = achado[1].trim().toLowerCase();
      const destino = porId.get(id);
      const nome = (achado[2] || destino?.titulo || achado[1]).trim();
      partes.push(
        destino ? (
          <button
            key={chave++}
            onClick={() => ir(id)}
            className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            {nome}
          </button>
        ) : (
          <span
            key={chave++}
            title="nota ainda não existe"
            className="rounded-md bg-white/5 px-1.5 py-0.5 text-[#9aa3b8]/70"
          >
            {nome}
          </span>
        ),
      );
    } else if (achado[3] !== undefined) {
      partes.push(
        <code key={chave++} className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[0.85em] text-[#e8eaf0]">
          {achado[3]}
        </code>,
      );
    } else {
      partes.push(
        <strong key={chave++} className="font-semibold text-white">
          {achado[4]}
        </strong>,
      );
    }
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

function Corpo({ texto, porId, ir }: { texto: string; porId: Map<string, No>; ir: (id: string) => void }) {
  const blocos: ReactNode[] = [];
  let lista: ReactNode[] = [];
  let chave = 0;

  const fecharLista = () => {
    if (lista.length === 0) return;
    blocos.push(
      <ul key={`l${chave++}`} className="my-2 space-y-1.5 pl-4">
        {lista}
      </ul>,
    );
    lista = [];
  };

  for (const linha of String(texto).split(/\r?\n/)) {
    const item = /^\s*[-*]\s+(.*)$/.exec(linha);
    if (item) {
      lista.push(
        <li
          key={`i${chave++}`}
          className="list-disc text-[13.5px] leading-relaxed text-[#e8eaf0] marker:text-emerald-500/50"
        >
          {inline(item[1], porId, ir)}
        </li>,
      );
      continue;
    }
    fecharLista();
    const titulo = /^(#{1,4})\s+(.*)$/.exec(linha);
    if (titulo) {
      blocos.push(
        <h4 key={`h${chave++}`} className="mt-4 text-[13px] font-bold uppercase tracking-wider text-[#ff9d4d]">
          {inline(titulo[2], porId, ir)}
        </h4>,
      );
    } else if (linha.trim()) {
      blocos.push(
        <p key={`p${chave++}`} className="my-2 text-[13.5px] leading-relaxed text-[#e8eaf0]">
          {inline(linha, porId, ir)}
        </p>,
      );
    }
  }
  fecharLista();
  return <>{blocos}</>;
}

export default function Cerebro() {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [termo, setTermo] = useState("");
  const [desligados, setDesligados] = useState<Set<string>>(new Set());
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const telaRef = useRef<HTMLCanvasElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  // a fisica muta os nos 60x por segundo; manter isso em state re-renderizaria
  // a arvore inteira a cada quadro, entao o grafo vive em refs
  const nosRef = useRef<No[]>([]);
  const porIdRef = useRef<Map<string, No>>(new Map());
  const arestasRef = useRef<Aresta[]>([]);
  const vistaRef = useRef({ x: 0, y: 0, escala: 1 });
  const energiaRef = useRef(1);
  const sobreRef = useRef<No | null>(null);
  const arrastandoNoRef = useRef<No | null>(null);
  const arrastandoTelaRef = useRef<{ x: number; y: number } | null>(null);
  const autoRef = useRef(true);
  const agendaRef = useRef<number[]>([]);

  const termoRef = useRef("");
  const desligadosRef = useRef<Set<string>>(new Set());
  const selecionadoRef = useRef<string | null>(null);

  useEffect(() => {
    termoRef.current = termo.trim().toLowerCase();
  }, [termo]);
  useEffect(() => {
    desligadosRef.current = desligados;
    energiaRef.current = Math.max(energiaRef.current, 0.4);
  }, [desligados]);
  useEffect(() => {
    selecionadoRef.current = selecionado;
  }, [selecionado]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("cerebro_notas")
      .select("id, titulo, caminho, tipo, resumo, criado, atualizado, exemplo, links, corpo")
      .order("id");
    if (error) {
      toast.error("Não consegui carregar o cérebro", { description: error.message });
      setCarregando(false);
      return;
    }
    setNotas((data ?? []) as Nota[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const arestas = useMemo(() => montarArestas(notas), [notas]);

  const graus = useMemo(() => {
    const mapa = new Map<string, number>(notas.map((n) => [n.id, 0]));
    for (const a of arestas) {
      mapa.set(a.de, (mapa.get(a.de) ?? 0) + 1);
      mapa.set(a.para, (mapa.get(a.para) ?? 0) + 1);
    }
    return mapa;
  }, [notas, arestas]);

  const contagem = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const n of notas) mapa.set(n.tipo, (mapa.get(n.tipo) ?? 0) + 1);
    return Array.from(mapa.entries()).sort((a, b) => b[1] - a[1]);
  }, [notas]);

  const cancelarEnquadramento = useCallback(() => {
    agendaRef.current.forEach(clearTimeout);
    agendaRef.current = [];
  }, []);

  const enquadrar = useCallback(() => {
    const tela = telaRef.current;
    if (!tela) return;
    const ativos = nosRef.current.filter((n) => !desligadosRef.current.has(n.tipo));
    if (ativos.length === 0) return;
    const caixa = tela.getBoundingClientRect();
    const margemDireita = selecionadoRef.current ? 420 : 40;
    const minX = Math.min(...ativos.map((n) => n.x));
    const maxX = Math.max(...ativos.map((n) => n.x));
    const minY = Math.min(...ativos.map((n) => n.y));
    const maxY = Math.max(...ativos.map((n) => n.y));
    const largura = Math.max(maxX - minX, 1) + 200;
    const altura = Math.max(maxY - minY, 1) + 140;
    const escala = Math.min((caixa.width - margemDireita) / largura, (caixa.height - 100) / altura, 1.4);
    const vista = vistaRef.current;
    vista.escala = Math.max(0.3, escala);
    vista.x = (caixa.width - margemDireita) / 2 - ((minX + maxX) / 2) * vista.escala;
    vista.y = caixa.height / 2 - ((minY + maxY) / 2) * vista.escala;
  }, []);

  // a fisica continua espalhando os nos depois do primeiro desenho, entao
  // reenquadra algumas vezes ate o grafo assentar
  const agendarEnquadramento = useCallback(() => {
    cancelarEnquadramento();
    if (!autoRef.current) return;
    agendaRef.current = [1200, 2600, 4200, 6000].map((atraso) => window.setTimeout(enquadrar, atraso));
  }, [cancelarEnquadramento, enquadrar]);

  useEffect(() => {
    const tela = telaRef.current;
    if (!tela) return;
    const caixa = tela.getBoundingClientRect();
    const largura = caixa.width || 800;
    const altura = caixa.height || 600;
    const anteriores = new Map(nosRef.current.map((n) => [n.id, n]));

    nosRef.current = notas.map((nota, i) => {
      const velho = anteriores.get(nota.id);
      const angulo = (i / Math.max(notas.length, 1)) * Math.PI * 2;
      const grau = graus.get(nota.id) ?? 0;
      return {
        ...nota,
        grau,
        x: velho ? velho.x : largura / 2 + Math.cos(angulo) * (220 + Math.random() * 220),
        y: velho ? velho.y : altura / 2 + Math.sin(angulo) * (220 + Math.random() * 220),
        vx: velho ? velho.vx : 0,
        vy: velho ? velho.vy : 0,
        raio: 7 + Math.min(grau, 14) * 1.35,
      };
    });
    porIdRef.current = new Map(nosRef.current.map((n) => [n.id, n]));
    arestasRef.current = arestas;
    energiaRef.current = 1;
    agendarEnquadramento();
    return cancelarEnquadramento;
  }, [notas, arestas, graus, agendarEnquadramento, cancelarEnquadramento]);

  useEffect(() => {
    const tela = telaRef.current;
    const container = containerRef.current;
    if (!tela || !container) return;
    const ctx = tela.getContext("2d");
    if (!ctx) return;

    const dimensionar = () => {
      const proporcao = window.devicePixelRatio || 1;
      const caixa = tela.getBoundingClientRect();
      tela.width = caixa.width * proporcao;
      tela.height = caixa.height * proporcao;
      ctx.setTransform(proporcao, 0, 0, proporcao, 0, 0);
    };
    dimensionar();
    const observador = new ResizeObserver(dimensionar);
    observador.observe(container);

    const visivel = (no: No) => !desligadosRef.current.has(no.tipo);
    const combina = (no: No) => {
      const t = termoRef.current;
      if (!t) return true;
      return `${no.titulo} ${no.id} ${no.resumo} ${no.corpo}`.toLowerCase().includes(t);
    };
    const paraTela = (no: No) => ({
      x: no.x * vistaRef.current.escala + vistaRef.current.x,
      y: no.y * vistaRef.current.escala + vistaRef.current.y,
    });

    const passoFisica = () => {
      if (energiaRef.current < 0.005) return;
      const caixa = tela.getBoundingClientRect();
      const cx = caixa.width / 2;
      const cy = caixa.height / 2;
      const ativos = nosRef.current.filter(visivel);

      for (let i = 0; i < ativos.length; i++) {
        const a = ativos[i];
        for (let j = i + 1; j < ativos.length; j++) {
          const b = ativos[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist2 = dx * dx + dy * dy;
          if (dist2 < 1) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            dist2 = 1;
          }
          const dist = Math.sqrt(dist2);
          const forca = Math.min(14000 / dist2, 60);
          const fx = (dx / dist) * forca;
          const fy = (dy / dist) * forca;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;

          // colisao: rotulo precisa de espaco, entao o raio minimo e generoso
          const minimo = a.raio + b.raio + 46;
          if (dist < minimo) {
            const empurrao = (minimo - dist) * 0.5;
            const ex = (dx / dist) * empurrao;
            const ey = (dy / dist) * empurrao;
            a.x -= ex;
            a.y -= ey;
            b.x += ex;
            b.y += ey;
          }
        }
      }

      for (const aresta of arestasRef.current) {
        const a = porIdRef.current.get(aresta.de);
        const b = porIdRef.current.get(aresta.para);
        if (!a || !b || !visivel(a) || !visivel(b)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const forca = (dist - 185) * 0.006;
        const fx = (dx / dist) * forca;
        const fy = (dy / dist) * forca;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      for (const no of ativos) {
        no.vx += (cx - no.x) * 0.0016;
        no.vy += (cy - no.y) * 0.0016;
        if (no === arrastandoNoRef.current) {
          no.vx = 0;
          no.vy = 0;
          continue;
        }
        no.vx *= 0.86;
        no.vy *= 0.86;
        no.x += Math.max(-18, Math.min(18, no.vx));
        no.y += Math.max(-18, Math.min(18, no.vy));
      }
      energiaRef.current *= 0.994;
    };

    const vizinhos = (id: string) => {
      const conjunto = new Set<string>();
      for (const a of arestasRef.current) {
        if (a.de === id) conjunto.add(a.para);
        if (a.para === id) conjunto.add(a.de);
      }
      return conjunto;
    };

    const pintar = () => {
      const caixa = tela.getBoundingClientRect();
      ctx.clearRect(0, 0, caixa.width, caixa.height);
      const foco = sobreRef.current?.id ?? selecionadoRef.current;
      const perto = foco ? vizinhos(foco) : null;

      for (const aresta of arestasRef.current) {
        const a = porIdRef.current.get(aresta.de);
        const b = porIdRef.current.get(aresta.para);
        if (!a || !b || !visivel(a) || !visivel(b)) continue;
        const pa = paraTela(a);
        const pb = paraTela(b);
        const destacada = foco !== null && (aresta.de === foco || aresta.para === foco);
        ctx.strokeStyle = destacada
          ? "rgba(16,185,129,0.75)"
          : foco
            ? "rgba(120,130,155,0.10)"
            : "rgba(120,130,155,0.22)";
        ctx.lineWidth = destacada ? 1.8 : 1;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      for (const no of nosRef.current) {
        if (!visivel(no)) continue;
        const p = paraTela(no);
        const r = no.raio * vistaRef.current.escala;
        const achou = combina(no);
        const relevante = !foco || no.id === foco || (perto?.has(no.id) ?? false);
        const tom = cor(no.tipo);
        const opacidade = achou ? (relevante ? 1 : 0.28) : 0.12;

        ctx.globalAlpha = opacidade;
        if (no.id === selecionadoRef.current || (termoRef.current && achou)) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
          ctx.fillStyle = `${tom}33`;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = tom;
        ctx.fill();

        // em grafo grande o zoom cai muito; entao hub, foco e resultado de
        // busca mantem o nome visivel
        const mostraNome =
          vistaRef.current.escala > 0.42 || no.grau >= 6 || no.id === foco || (termoRef.current !== "" && achou);
        if (mostraNome) {
          ctx.globalAlpha = opacidade * (relevante ? 1 : 0.5);
          ctx.fillStyle = "#e8eaf0";
          const peso = no.id === foco ? 600 : 400;
          const altura = Math.max(11, 12 * Math.min(vistaRef.current.escala, 1.4));
          ctx.font = `${peso} ${altura}px "Plus Jakarta Sans", system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(no.titulo, p.x, p.y + r + 14);
        }
        ctx.globalAlpha = 1;
      }
    };

    let quadro = requestAnimationFrame(function laco() {
      passoFisica();
      pintar();
      quadro = requestAnimationFrame(laco);
    });

    return () => {
      cancelAnimationFrame(quadro);
      observador.disconnect();
    };
  }, []);

  const noEm = useCallback((px: number, py: number) => {
    const vista = vistaRef.current;
    const mx = (px - vista.x) / vista.escala;
    const my = (py - vista.y) / vista.escala;
    let achado: No | null = null;
    for (const no of nosRef.current) {
      if (desligadosRef.current.has(no.tipo)) continue;
      if (Math.hypot(no.x - mx, no.y - my) <= no.raio + 6) achado = no;
    }
    return achado;
  }, []);

  const abrir = useCallback(
    (id: string) => {
      const no = porIdRef.current.get(id);
      if (!no) return;
      setSelecionado(id);
      cancelarEnquadramento();
      autoRef.current = false;
      const tela = telaRef.current;
      if (!tela) return;
      const caixa = tela.getBoundingClientRect();
      vistaRef.current.x = (caixa.width - Math.min(420, caixa.width * 0.92)) / 2 - no.x * vistaRef.current.escala;
      vistaRef.current.y = caixa.height / 2 - no.y * vistaRef.current.escala;
    },
    [cancelarEnquadramento],
  );

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelecionado(null);
      if (e.key === "/" && document.activeElement !== buscaRef.current) {
        e.preventDefault();
        buscaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  useEffect(() => {
    const soltar = () => {
      arrastandoNoRef.current = null;
      arrastandoTelaRef.current = null;
    };
    window.addEventListener("mouseup", soltar);
    return () => window.removeEventListener("mouseup", soltar);
  }, []);

  const nota = selecionado ? porIdRef.current.get(selecionado) : null;
  const saida = useMemo(
    () =>
      selecionado
        ? (arestas
            .filter((a) => a.de === selecionado)
            .map((a) => porIdRef.current.get(a.para))
            .filter(Boolean) as No[])
        : [],
    [selecionado, arestas],
  );
  const entrada = useMemo(
    () =>
      selecionado
        ? (arestas
            .filter((a) => a.para === selecionado)
            .map((a) => porIdRef.current.get(a.de))
            .filter(Boolean) as No[])
        : [],
    [selecionado, arestas],
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/12 text-emerald-300">
            <Brain className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Cérebro</h1>
            <p className="text-xs text-muted-foreground">
              {carregando ? "carregando…" : `${notas.length} notas · ${arestas.length} conexões`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={buscaRef}
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Buscar nota…  (/)"
              className="w-56 pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            title="Enquadrar o grafo"
            onClick={() => {
              autoRef.current = true;
              energiaRef.current = Math.max(energiaRef.current, 0.5);
              enquadrar();
              agendarEnquadramento();
            }}
          >
            <Crosshair className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" title="Recarregar" onClick={() => void carregar()}>
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {contagem.map(([tipo, qtd]) => {
          const off = desligados.has(tipo);
          return (
            <button
              key={tipo}
              onClick={() =>
                setDesligados((atual) => {
                  const proximo = new Set(atual);
                  if (proximo.has(tipo)) proximo.delete(tipo);
                  else proximo.add(tipo);
                  return proximo;
                })
              }
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                off
                  ? "border-white/[0.06] bg-white/[0.02] text-muted-foreground/50"
                  : "border-white/10 bg-white/[0.05] text-foreground/85 hover:bg-white/[0.08]"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full transition-opacity"
                style={{ background: cor(tipo), opacity: off ? 0.3 : 1 }}
              />
              {rotulo(tipo)}
              <span className="text-muted-foreground">{qtd}</span>
            </button>
          );
        })}
        {desligados.size > 0 && (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setDesligados(new Set())}>
            <Eye className="h-3.5 w-3.5" />
            Mostrar tudo
          </Button>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0d12] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
      >
        <canvas
          ref={telaRef}
          className="h-full w-full cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => {
            const no = noEm(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
            if (no) {
              arrastandoNoRef.current = no;
            } else {
              arrastandoTelaRef.current = {
                x: e.nativeEvent.offsetX - vistaRef.current.x,
                y: e.nativeEvent.offsetY - vistaRef.current.y,
              };
              autoRef.current = false;
              cancelarEnquadramento();
            }
          }}
          onMouseMove={(e) => {
            const { offsetX, offsetY } = e.nativeEvent;
            if (arrastandoNoRef.current) {
              const vista = vistaRef.current;
              arrastandoNoRef.current.x = (offsetX - vista.x) / vista.escala;
              arrastandoNoRef.current.y = (offsetY - vista.y) / vista.escala;
              energiaRef.current = Math.max(energiaRef.current, 0.35);
            } else if (arrastandoTelaRef.current) {
              vistaRef.current.x = offsetX - arrastandoTelaRef.current.x;
              vistaRef.current.y = offsetY - arrastandoTelaRef.current.y;
            } else {
              sobreRef.current = noEm(offsetX, offsetY);
            }
          }}
          onMouseUp={(e) => {
            const solto = noEm(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
            if (arrastandoNoRef.current && solto === arrastandoNoRef.current) abrir(solto.id);
          }}
          onWheel={(e) => {
            autoRef.current = false;
            cancelarEnquadramento();
            const vista = vistaRef.current;
            const fator = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            const nova = Math.max(0.25, Math.min(3, vista.escala * fator));
            const { offsetX, offsetY } = e.nativeEvent;
            const mx = (offsetX - vista.x) / vista.escala;
            const my = (offsetY - vista.y) / vista.escala;
            vista.escala = nova;
            vista.x = offsetX - mx * nova;
            vista.y = offsetY - my * nova;
          }}
        />

        {carregando && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0b0d12]">
            <div className="w-64 space-y-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        )}

        {!carregando && notas.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
            <div className="max-w-sm space-y-2">
              <Brain className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">O cérebro está vazio aqui</p>
              <p className="text-xs text-muted-foreground">
                As notas vivem em <code className="rounded bg-white/[0.06] px-1">cerebro/</code> no repo. Rode{" "}
                <code className="rounded bg-white/[0.06] px-1">npm run subir --prefix cerebro</code> para espelhá-las.
              </p>
            </div>
          </div>
        )}

        {nota && (
          <aside className="absolute right-0 top-0 h-full w-full max-w-[420px] overflow-y-auto border-l border-[#232838] bg-[#12151d]/[0.97] p-5 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold leading-tight tracking-tight text-[#e8eaf0]">{nota.titulo}</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setSelecionado(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-[#0b0d12]"
                style={{ background: cor(nota.tipo) }}
              >
                {rotulo(nota.tipo)}
              </span>
              {nota.criado && (
                <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-[#9aa3b8]">
                  criado {nota.criado}
                </span>
              )}
              {nota.atualizado && (
                <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-[#9aa3b8]">
                  atualizado {nota.atualizado}
                </span>
              )}
            </div>

            {nota.resumo && (
              <p className="mt-3 border-l-2 border-emerald-500/40 pl-3 text-[13px] italic leading-relaxed text-[#9aa3b8]">
                {nota.resumo}
              </p>
            )}

            <div className="mt-3">
              <Corpo texto={nota.corpo} porId={porIdRef.current} ir={abrir} />
            </div>

            <div className="mt-5 space-y-3 border-t border-[#232838] pt-4">
              {[
                { nome: "Aponta para", itens: saida },
                { nome: "Citada por", itens: entrada },
              ].map((secao) => (
                <div key={secao.nome}>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#9aa3b8]">
                    {secao.nome} ({secao.itens.length})
                  </h4>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {secao.itens.length === 0 ? (
                      <span className="text-xs text-[#9aa3b8]/70">nenhum</span>
                    ) : (
                      secao.itens.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => abrir(v.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-[#232838] bg-[#0b0d12] px-2 py-1 text-xs text-[#e8eaf0] transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/10"
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor(v.tipo) }} />
                          {v.titulo}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 font-mono text-[11px] text-[#9aa3b8]/60">cerebro/{nota.caminho}</div>
          </aside>
        )}
      </div>
    </div>
  );
}
