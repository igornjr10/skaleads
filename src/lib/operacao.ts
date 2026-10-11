import { addDays, format, startOfWeek } from "date-fns";
import {
  estaAberta,
  estaAtrasada,
  hojeISO,
  ordenarPorPrazo,
  type Demanda,
} from "./demandas";

export interface Gargalo {
  id: string;
  problema: string;
  impacto: string;
  sugestao: string;
  taskId?: string;
  clientId?: string;
}

export function analisarOperacao(
  dados: Demanda[],
  agora = new Date(),
  limiteCarga = 10,
  diasParada = 3,
) {
  const demandas = [...new Map(dados.map((d) => [d.id, d])).values()];
  const hoje = hojeISO(agora);
  const fimProximo = hojeISO(addDays(agora, 2));
  const inicioSemana = startOfWeek(agora, { weekStartsOn: 1 });
  const abertas = demandas.filter(estaAberta);
  const atrasadas = abertas.filter((d) => estaAtrasada(d, hoje));
  const proximas = abertas.filter(
    (d) => d.prazo && d.prazo >= hoje && d.prazo <= fimProximo,
  );
  const concluidasSemana = demandas.filter(
    (d) =>
      d.status === "concluida" &&
      d.concluida_at &&
      new Date(d.concluida_at) >= inicioSemana &&
      new Date(d.concluida_at) <= agora,
  );
  const carga = new Map<
    string | null,
    { pessoa: string | null; abertas: number; atrasadas: number }
  >();
  for (const d of abertas) {
    const item = carga.get(d.assigned_to) ?? {
      pessoa: d.assigned_to,
      abertas: 0,
      atrasadas: 0,
    };
    item.abertas++;
    if (estaAtrasada(d, hoje)) item.atrasadas++;
    carga.set(d.assigned_to, item);
  }
  const gargalos: Gargalo[] = [];
  const criativos = new Map<string, Demanda[]>();
  for (const d of atrasadas.filter(
    (d) => ["criativo", "video", "copy"].includes(d.categoria) && d.client_id,
  )) {
    criativos.set(d.client_id!, [...(criativos.get(d.client_id!) ?? []), d]);
  }
  for (const [clientId, itens] of criativos)
    gargalos.push({
      id: `criativo:${clientId}`,
      clientId,
      problema: `${itens.length} material(is) atrasado(s)`,
      impacto:
        "A campanha pode ficar sem material para publicação ou renovação.",
      sugestao:
        "Alinhe a entrega com a criação e confirme se falta material do cliente.",
    });
  for (const d of abertas) {
    if (d.bloqueio)
      gargalos.push({
        id: `bloqueio:${d.id}`,
        taskId: d.id,
        clientId: d.client_id ?? undefined,
        problema: `${d.bloqueio === "material_cliente" ? "Aguardando material do cliente" : d.bloqueio === "aprovacao_cliente" ? "Aguardando aprovação do cliente" : "Aguardando outra entrega"}: ${d.titulo}`,
        impacto: "A entrega está impedida de avançar.",
        sugestao:
          "Confirme com o solicitante o que falta, registre a cobrança e combine uma data de retorno.",
      });
    const ultima = new Date(d.updated_at ?? d.created_at).getTime();
    if (
      Number.isFinite(ultima) &&
      agora.getTime() - ultima >= diasParada * 86400000
    )
      gargalos.push({
        id: `parada:${d.id}`,
        taskId: d.id,
        clientId: d.client_id ?? undefined,
        problema: `Sem atualização: ${d.titulo}`,
        impacto: `A demanda não recebe atualização há pelo menos ${diasParada} dias.`,
        sugestao:
          "Confirme o impedimento com o responsável e registre o próximo passo.",
      });
    if (d.onboarding_fase && estaAtrasada(d, hoje))
      gargalos.push({
        id: `onboarding:${d.id}`,
        taskId: d.id,
        clientId: d.client_id ?? undefined,
        problema: `Onboarding incompleto: ${d.titulo}`,
        impacto: "A entrada do cliente pode atrasar a operação.",
        sugestao:
          "Revise o checklist da etapa e confirme os acessos e materiais pendentes.",
      });
  }
  const semResponsavel = abertas.filter((d) => !d.assigned_to);
  if (semResponsavel.length)
    gargalos.unshift({
      id: "sem-responsavel",
      problema: `${semResponsavel.length} demanda(s) sem responsável`,
      impacto: "Pendências podem ficar sem acompanhamento.",
      sugestao: "Defina responsáveis na fila de demandas.",
    });
  return {
    demandas,
    abertas,
    atrasadas,
    proximas,
    concluidasSemana,
    reunioes: ordenarPorPrazo(
      abertas.filter(
        (d) => d.categoria === "reuniao" && d.prazo && d.prazo >= hoje,
      ),
    ),
    prioridades: ordenarPorPrazo(abertas),
    carga: [...carga.values()]
      .sort((a, b) => b.atrasadas - a.atrasadas || b.abertas - a.abertas)
      .map((c) => ({ ...c, sobrecarga: c.abertas >= limiteCarga })),
    gargalos,
    resumo: `${format(agora, "dd/MM/yyyy")}: ${abertas.length} pendências, ${atrasadas.length} atrasadas, ${proximas.length} vencem até ${format(addDays(agora, 2), "dd/MM")}; ${concluidasSemana.length} entregas nesta semana.`,
  };
}
