import { Activity, Bell, Check, RefreshCw, Wallet } from "lucide-react";

// Reproducoes da interface para a landing. Existem no lugar de screenshot por
// dois motivos: captura real expoe nome, logo e verba de cliente de terceiros,
// e print de tela clara destoa da pagina escura. Os numeros sao ilustrativos e
// a legenda abaixo de cada bloco diz isso.

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[hsl(222_24%_9%)] shadow-card">
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Delta({ valor, bom }: { valor: string; bom: boolean }) {
  return (
    <span className={`text-[10px] font-medium tabular-nums ${bom ? "text-emerald-400" : "text-rose-400"}`}>
      {bom ? "↑" : "↓"} {valor}
    </span>
  );
}

const KPIS = [
  { rotulo: "Gasto total", valor: "R$ 4.812", delta: "7,4%", bom: true },
  { rotulo: "Impressões", valor: "312.480", delta: "1,6%", bom: true },
  { rotulo: "Cliques", valor: "9.774", delta: "6,5%", bom: true },
  { rotulo: "CPM", valor: "R$ 15,40", delta: "5,7%", bom: false },
  { rotulo: "CPC", valor: "R$ 0,49", delta: "3,1%", bom: true },
  { rotulo: "CTR", valor: "3,12%", delta: "8,0%", bom: true },
];

export function MockDashboard() {
  return (
    <Moldura>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-bold tracking-tight text-foreground">Dashboard</p>
          <p className="text-[10px] text-muted-foreground">Visão geral das campanhas</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] p-0.5">
          {["7d", "14d", "30d"].map((p) => (
            <span
              key={p}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                p === "14d" ? "bg-emerald-500/15 text-emerald-400" : "text-muted-foreground"
              }`}
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {KPIS.map(({ rotulo, valor, delta, bom }) => (
          <div key={rotulo} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{rotulo}</p>
            <p className="mt-1 text-[15px] font-bold tabular-nums tracking-tight text-foreground">{valor}</p>
            <Delta valor={delta} bom={bom} />
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <p className="text-[10px] font-semibold text-foreground">Resultados de negócio local</p>
        <div className="mt-2.5 grid grid-cols-4 gap-2">
          {[
            ["Conversas", "412"],
            ["Ligações", "88"],
            ["Rotas", "126"],
            ["Leads", "57"],
          ].map(([rotulo, valor]) => (
            <div key={rotulo}>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{rotulo}</p>
              <p className="mt-0.5 text-[13px] font-bold tabular-nums text-foreground">{valor}</p>
            </div>
          ))}
        </div>
      </div>
    </Moldura>
  );
}

const CATEGORIAS = [
  { nome: "Pixel e rastreamento", nota: 72 },
  { nome: "Estrutura", nota: 88 },
  { nome: "Criativos", nota: 64 },
  { nome: "Orçamento", nota: 95 },
];

const ACHADOS = [
  { severidade: "critico", titulo: "Conversions API não configurada", detalhe: "Pixel sem CAPI ativa" },
  { severidade: "atencao", titulo: "Event Match Quality abaixo de 6", detalhe: "3 eventos afetados" },
  { severidade: "atencao", titulo: "2 conjuntos com menos de 3 anúncios", detalhe: "Diversidade criativa baixa" },
  { severidade: "ok", titulo: "Método de pagamento válido", detalhe: "Sem risco de interrupção" },
];

const CORES_SEVERIDADE: Record<string, string> = {
  critico: "bg-rose-500/15 text-rose-400 border-rose-500/25",
  atencao: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  ok: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
};

const ROTULO_SEVERIDADE: Record<string, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  ok: "OK",
};

export function MockAuditoria() {
  return (
    <Moldura>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex shrink-0 items-center gap-4">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(0 0% 100% / 0.07)" strokeWidth="9" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="hsl(160 84% 44%)"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray="264"
                strokeDashoffset="66"
              />
            </svg>
            <div className="text-center">
              <p className="text-[26px] font-extrabold leading-none tabular-nums text-emerald-400">75</p>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">de 100</p>
            </div>
          </div>

          <div className="flex-1 space-y-2 sm:w-40">
            {CATEGORIAS.map(({ nome, nota }) => (
              <div key={nome}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] text-muted-foreground">{nome}</span>
                  <span className="text-[9px] font-semibold tabular-nums text-foreground">{nota}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                  <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${nota}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-1.5">
          {ACHADOS.map(({ severidade, titulo, detalhe }) => (
            <div
              key={titulo}
              className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5"
            >
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${CORES_SEVERIDADE[severidade]}`}
              >
                {ROTULO_SEVERIDADE[severidade]}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-foreground">{titulo}</p>
                <p className="truncate text-[10px] text-muted-foreground">{detalhe}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Moldura>
  );
}

export function MockClientes() {
  return (
    <Moldura>
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-400">
          AM
        </div>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold tracking-tight text-foreground">AUTOCENTER MODELO</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
              Meta conectada
            </span>
            <span className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              Saudável
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Saúde da integração
          </span>
          <Activity className="h-3 w-3 text-emerald-400" />
        </div>
        <p className="mt-1.5 text-[11px] text-foreground">4 relatórios · último há 2 dias</p>
        <p className="text-[10px] text-muted-foreground">Última sync há 3 horas</p>
      </div>

      <div className="mt-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Wallet className="h-3 w-3" /> Verba do mês
          </span>
          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium text-emerald-400">
            No ritmo
          </span>
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <p className="text-[13px] font-bold tabular-nums text-foreground">
            R$ 2.810 <span className="text-[10px] font-normal text-muted-foreground">de R$ 5.000</span>
          </p>
          <span className="text-[11px] font-bold tabular-nums text-emerald-400">56%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
          <div className="h-full w-[56%] rounded-full bg-emerald-500" />
        </div>
      </div>

      <div className="mt-2.5 flex gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-2 py-1 text-[9px] font-medium text-muted-foreground">
          <RefreshCw className="h-2.5 w-2.5" /> Sincronizar
        </span>
        <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/25 px-2 py-1 text-[9px] font-medium text-emerald-400">
          Relatório WA
        </span>
      </div>
    </Moldura>
  );
}

const ALERTAS = [
  { nome: "CPM alto", condicao: "CPM maior que 50 (3 dias)", canais: ["WhatsApp"], ativo: true },
  { nome: "Gasto sem conversão", condicao: "Investimento maior que 250 (7 dias)", canais: ["E-mail"], ativo: true },
  { nome: "CTR abaixo de 1%", condicao: "CTR menor que 1 (3 dias)", canais: ["Painel"], ativo: false },
];

export function MockAlertas() {
  return (
    <Moldura>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-bold tracking-tight text-foreground">Alertas</p>
          <p className="text-[10px] text-muted-foreground">3 ativos · 2 abertos</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-[9px] font-semibold text-emerald-400">
          <Bell className="h-2.5 w-2.5" /> Novo alerta
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {ALERTAS.map(({ nome, condicao, canais, ativo }) => (
          <div key={nome} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-semibold text-foreground">{nome}</span>
              <span
                className={`h-3 w-6 shrink-0 rounded-full p-0.5 ${ativo ? "bg-emerald-500" : "bg-white/15"}`}
                aria-hidden="true"
              >
                <span className={`block h-2 w-2 rounded-full bg-white ${ativo ? "ml-auto" : ""}`} />
              </span>
            </div>
            <p className="mt-1.5 truncate rounded bg-black/30 px-1.5 py-1 font-mono text-[9px] text-muted-foreground">
              {condicao}
            </p>
            <div className="mt-1.5 flex gap-1">
              {canais.map((c) => (
                <span
                  key={c}
                  className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] text-muted-foreground"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Moldura>
  );
}

const ETAPAS_ONBOARDING = [
  { nome: "Acesso ao Business Manager", feito: true },
  { nome: "Pixel instalado e validado", feito: true },
  { nome: "Conversions API ativa", feito: true },
  { nome: "Públicos personalizados", feito: false },
  { nome: "Primeira campanha no ar", feito: false },
];

export function MockPlanner() {
  return (
    <Moldura>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-bold tracking-tight text-foreground">Planner</p>
          <p className="text-[10px] text-muted-foreground">Onboarding de clientes novos</p>
        </div>
        <span className="text-[11px] font-bold tabular-nums text-emerald-400">14/22</span>
      </div>

      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div className="h-full w-[64%] rounded-full bg-emerald-500" />
      </div>

      <div className="mt-3.5 space-y-2">
        {ETAPAS_ONBOARDING.map(({ nome, feito }) => (
          <div key={nome} className="flex items-center gap-2.5">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                feito ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-400" : "border-white/[0.12]"
              }`}
            >
              {feito && <Check className="h-2.5 w-2.5" />}
            </span>
            <span
              className={`truncate text-[11px] ${
                feito ? "text-muted-foreground line-through decoration-muted-foreground/40" : "text-foreground"
              }`}
            >
              {nome}
            </span>
          </div>
        ))}
      </div>
    </Moldura>
  );
}
