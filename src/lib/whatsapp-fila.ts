export interface LimitesWa {
  limite_diario: number;
  intervalo_seg: number;
  hora_inicio: number;
  hora_fim: number;
}

/** Espelho do PADRAO de wa-processar-fila: empresa sem wa_config usa estes. */
export const LIMITES_PADRAO: LimitesWa = { limite_diario: 150, intervalo_seg: 30, hora_inicio: 8, hora_fim: 20 };

/**
 * Quanto tempo a fila leva para mandar `n` mensagens. O gargalo e o menor de
 * dois: o teto diario ou o que cabe na janela de horario no intervalo minimo
 * (o intervalo real tem ate 20% de folga, entao a conta usa o intervalo cheio).
 */
export function estimativaDeEnvio(n: number, l: LimitesWa): string {
  if (n <= 0) return "";
  const cabemNaJanela = Math.floor(((l.hora_fim - l.hora_inicio) * 3600) / (l.intervalo_seg * 1.1));
  const porDia = Math.max(1, Math.min(l.limite_diario, cabemNaJanela));
  const dias = Math.ceil(n / porDia);
  const plural = n === 1 ? "mensagem" : "mensagens";
  if (dias <= 1) {
    const minutos = Math.ceil((n * l.intervalo_seg * 1.1) / 60);
    const duracao = minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, "0")}`;
    return `${n} ${plural}: cerca de ${duracao} de envio, dentro do horário das ${l.hora_inicio}h às ${l.hora_fim}h.`;
  }
  return `${n} ${plural}: até ${porDia} por dia, então leva cerca de ${dias} dias (envia das ${l.hora_inicio}h às ${l.hora_fim}h, todos os dias).`;
}
