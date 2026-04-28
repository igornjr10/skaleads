import { AuditCheck, AuditContext, AuditResult } from './types';
import { supabase } from '@/integrations/supabase/client';

const BASE = 'https://graph.facebook.com/v21.0';

async function mGet<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = `${BASE}/${path}?${new URLSearchParams({ ...params, access_token: token })}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json as T;
}

async function mAll<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T[]> {
  let url: string | undefined = `${BASE}/${path}?${new URLSearchParams({ ...params, access_token: token, limit: '200' })}`;
  const items: T[] = [];
  while (url) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    items.push(...(json.data ?? []));
    url = json.paging?.next;
  }
  return items;
}

const pass  = (message: string, details?: string): AuditResult => ({ status: 'pass',  message, details });
const warn  = (message: string, details?: string, recommendation?: string): AuditResult => ({ status: 'warn',  message, details, recommendation });
const fail  = (message: string, details?: string, recommendation?: string): AuditResult => ({ status: 'fail',  message, details, recommendation });
const skip  = (message: string): AuditResult => ({ status: 'skip', message });

function daysAgo(n: number) { return Math.floor((Date.now() - n * 86400000) / 1000); }

// ── PIXEL & TRACKING ──────────────────────────────────────────────────────────

const pixelInstalled: AuditCheck = {
  id: 'pixel_installed', name: 'Pixel instalado na conta', category: 'pixel', severity: 'critical',
  async run({ adAccountId, accessToken }: AuditContext) {
    const pixels = await mAll<{ id: string; name: string }>(`act_${adAccountId}/adspixels`, accessToken, { fields: 'id,name' });
    if (!pixels.length) return fail('Nenhum Pixel Meta encontrado na conta', undefined, 'Instale o Meta Pixel no seu site via Gerenciador de Eventos. Sem pixel, conversões não são rastreadas e o algoritmo não aprende.');
    return pass(`${pixels.length} pixel(s) encontrado(s)`, pixels.map(p => `${p.name} (${p.id})`).join(', '));
  },
};

const pixelActive: AuditCheck = {
  id: 'pixel_active', name: 'Pixel disparando nos últimos 7 dias', category: 'pixel', severity: 'critical',
  async run({ adAccountId, accessToken }: AuditContext) {
    const pixels = await mAll<{ id: string; name: string; last_fired_time: number }>(`act_${adAccountId}/adspixels`, accessToken, { fields: 'id,name,last_fired_time' });
    if (!pixels.length) return skip('Nenhum pixel encontrado');
    const now = Date.now() / 1000;
    const inactive = pixels.filter(p => !p.last_fired_time || (now - p.last_fired_time) > 7 * 86400);
    if (inactive.length === pixels.length) return fail('Pixel sem disparos nos últimos 7 dias', undefined, 'Verifique se o pixel está instalado corretamente nas páginas do site. Teste com o Meta Pixel Helper.');
    if (inactive.length > 0) return warn(`${inactive.length} pixel(s) inativo(s)`, inactive.map(p => p.name).join(', '), 'Verifique pixels inativos — podem estar em domínios sem tráfego ou com instalação quebrada.');
    return pass('Todos os pixels dispararam nos últimos 7 dias');
  },
};

const capiConfigured: AuditCheck = {
  id: 'capi_configured', name: 'Conversions API (CAPI) configurada', category: 'pixel', severity: 'warning',
  async run({ adAccountId, accessToken }: AuditContext) {
    // Proxy: verificar se há eventos server-side via datasources do pixel
    const pixels = await mAll<{ id: string; name: string }>(`act_${adAccountId}/adspixels`, accessToken, { fields: 'id,name' });
    if (!pixels.length) return skip('Nenhum pixel encontrado');
    try {
      const stats = await mGet<{ data?: Array<{ type: string }> }>(
        `${pixels[0].id}/signal_sources`, accessToken, { fields: 'type' }
      );
      const hasCAPI = stats.data?.some(s => s.type === 'SERVER');
      if (hasCAPI) return pass('Conversions API detectada como fonte de dados');
      return warn('CAPI não detectada', 'Apenas eventos de browser identificados', 'Configure a Conversions API para melhorar o Event Match Quality e a entrega. Com iOS 14+, o CAPI é essencial para manter a qualidade do rastreamento.');
    } catch {
      return warn('Não foi possível verificar CAPI automaticamente', undefined, 'Verifique manualmente no Gerenciador de Eventos → Configurações → Conversions API se está ativado.');
    }
  },
};

const eventMatchQuality: AuditCheck = {
  id: 'event_match_quality', name: 'Event Match Quality (EMQ)', category: 'pixel', severity: 'warning',
  async run({ adAccountId, accessToken }: AuditContext) {
    const pixels = await mAll<{ id: string; name: string }>(`act_${adAccountId}/adspixels`, accessToken, { fields: 'id,name' });
    if (!pixels.length) return skip('Nenhum pixel encontrado');
    try {
      const data = await mGet<Record<string, unknown>>(`${pixels[0].id}`, accessToken, {
        fields: 'match_quality_grade',
      });
      const grade = data.match_quality_grade as string | undefined;
      if (!grade) return warn('EMQ não disponível via API', undefined, 'Acesse Gerenciador de Eventos → seu Pixel → aba Visão geral para ver o EMQ. Alvo: ≥ 6.0.');
      const score = parseFloat(grade);
      if (score >= 6) return pass(`EMQ: ${grade} — qualidade adequada`);
      return warn(`EMQ: ${grade} — abaixo do recomendado (≥ 6)`, undefined, 'Melhore o EMQ enviando email e número de telefone hashados no evento de Purchase. Cada parâmetro adicional aumenta a correspondência.');
    } catch {
      return warn('EMQ requer verificação manual', undefined, 'Verifique o Event Match Quality no Gerenciador de Eventos. EMQ < 6 indica perda de atribuição de conversões.');
    }
  },
};

const conversionEvents: AuditCheck = {
  id: 'conversion_events', name: 'Eventos de conversão configurados', category: 'pixel', severity: 'critical',
  async run({ adAccountId, accessToken }: AuditContext) {
    const conversions = await mAll<{ id: string; name: string }>(`act_${adAccountId}/customconversions`, accessToken, { fields: 'id,name' });
    const pixels = await mAll<{ id: string; name: string; last_fired_time?: number }>(`act_${adAccountId}/adspixels`, accessToken, { fields: 'id,name,last_fired_time' });
    const hasPixel = pixels.some(p => p.last_fired_time);
    if (!hasPixel && !conversions.length) return fail('Sem pixel ativo e sem conversões customizadas', undefined, 'Configure pelo menos um evento de conversão (Purchase, Lead) para que o algoritmo possa otimizar para resultados reais.');
    if (conversions.length > 0) return pass(`${conversions.length} conversão(ões) customizada(s) configurada(s)`, conversions.map(c => c.name).join(', '));
    return warn('Sem conversões customizadas, usando apenas eventos padrão', undefined, 'Crie conversões customizadas para eventos estratégicos do seu funil. Isso permite otimização mais precisa.');
  },
};

const domainVerified: AuditCheck = {
  id: 'domain_verified', name: 'Domínio verificado no Business Manager', category: 'pixel', severity: 'warning',
  async run(_ctx: AuditContext) {
    return warn('Verificação de domínio requer acesso de admin ao Business Manager', undefined, 'Verifique em Business Manager → Configurações → Brand Safety → Domínios. Domínio não verificado limita eventos de pixel pós-iOS 14 a 8 eventos priorizados.');
  },
};

// ── ESTRUTURA DE CAMPANHA ─────────────────────────────────────────────────────

const cboUsage: AuditCheck = {
  id: 'cbo_usage', name: 'Campanhas usando CBO', category: 'structure', severity: 'warning',
  async run({ adAccountId, accessToken }: AuditContext) {
    const campaigns = await mAll<{ id: string; name: string; budget_rebalance_flag: boolean }>(`act_${adAccountId}/campaigns`, accessToken, {
      fields: 'id,name,budget_rebalance_flag',
      effective_status: JSON.stringify(['ACTIVE']),
    });
    if (!campaigns.length) return skip('Nenhuma campanha ativa encontrada');
    const cboCampaigns = campaigns.filter(c => c.budget_rebalance_flag);
    const pct = Math.round((cboCampaigns.length / campaigns.length) * 100);
    if (pct >= 70) return pass(`${pct}% das campanhas usam CBO (${cboCampaigns.length}/${campaigns.length})`);
    if (pct >= 30) return warn(`Apenas ${pct}% das campanhas usam CBO`, `${campaigns.length - cboCampaigns.length} campanha(s) com ABO`, 'Migre campanhas maduras para CBO. O Andromeda distribui orçamento melhor com CBO, especialmente em contas com múltiplos adsets.');
    return fail(`Somente ${pct}% das campanhas usam CBO`, `${cboCampaigns.length} de ${campaigns.length} campanhas ativas`, 'CBO é a abordagem recomendada no era do Andromeda. Permite ao algoritmo alocar verba para os adsets de melhor performance automaticamente.');
  },
};

const learningPhase: AuditCheck = {
  id: 'learning_phase', name: 'Adsets em fase de aprendizado', category: 'structure', severity: 'warning',
  async run({ adAccountId, accessToken }: AuditContext) {
    const adsets = await mAll<{ id: string; name: string; learning_phase_status?: string }>(`act_${adAccountId}/adsets`, accessToken, {
      fields: 'id,name,learning_phase_status',
      effective_status: JSON.stringify(['ACTIVE']),
    });
    if (!adsets.length) return skip('Nenhum adset ativo');
    const learning = adsets.filter(a => a.learning_phase_status === 'LEARNING');
    const pct = Math.round((learning.length / adsets.length) * 100);
    if (learning.length === 0) return pass('Nenhum adset em fase de aprendizado');
    if (pct <= 30) return warn(`${learning.length} adset(s) em aprendizado (${pct}%)`, learning.slice(0, 5).map(a => a.name).join(', '), 'Adsets em aprendizado têm entrega instável. Evite alterações significativas até saírem do aprendizado.');
    return fail(`${pct}% dos adsets em aprendizado (${learning.length}/${adsets.length})`, undefined, 'Muitos adsets em aprendizado indica estrutura muito fragmentada. Consolide adsets e evite reiniciar o aprendizado com alterações frequentes de orçamento, público ou criativo.');
  },
};

const learningStalledCheck: AuditCheck = {
  id: 'learning_stalled', name: 'Adsets em aprendizado limitado', category: 'structure', severity: 'warning',
  async run({ adAccountId, accessToken }: AuditContext) {
    const adsets = await mAll<{ id: string; name: string; learning_phase_status?: string }>(`act_${adAccountId}/adsets`, accessToken, {
      fields: 'id,name,learning_phase_status',
      effective_status: JSON.stringify(['ACTIVE']),
    });
    const stalled = adsets.filter(a => a.learning_phase_status === 'LEARNING_LIMITED');
    if (!stalled.length) return pass('Nenhum adset com aprendizado limitado');
    return fail(`${stalled.length} adset(s) com aprendizado limitado`, stalled.map(a => a.name).join(', '), 'Aprendizado limitado significa que o adset não tem conversões suficientes (meta: 50/semana). Aumente o orçamento, amplie o público ou mude o objetivo de otimização para um evento mais frequente no funil.');
  },
};

const disapprovedAds: AuditCheck = {
  id: 'disapproved_ads', name: 'Anúncios reprovados não tratados', category: 'structure', severity: 'critical',
  async run({ adAccountId, accessToken }: AuditContext) {
    const ads = await mAll<{ id: string; name: string; effective_status: string; review_feedback?: { global?: Record<string, string> } }>(`act_${adAccountId}/ads`, accessToken, {
      fields: 'id,name,effective_status,review_feedback',
      effective_status: JSON.stringify(['DISAPPROVED', 'WITH_ISSUES']),
    });
    if (!ads.length) return pass('Nenhum anúncio reprovado encontrado');
    const reasons = ads.slice(0, 3).map(a => {
      const feedback = a.review_feedback?.global;
      return feedback ? `${a.name}: ${Object.keys(feedback).join(', ')}` : a.name;
    });
    return fail(`${ads.length} anúncio(s) reprovado(s) ou com problemas`, reasons.join(' | '), 'Corrija ou pause os anúncios reprovados. Anúncios reprovados afetam o Quality Score da conta e podem levar a restrições. Identifique a política violada e ajuste o criativo ou a segmentação.');
  },
};

const duplicateObjectives: AuditCheck = {
  id: 'duplicate_objectives', name: 'Campanhas com mesmo objetivo duplicadas', category: 'structure', severity: 'info',
  async run({ adAccountId, accessToken }: AuditContext) {
    const campaigns = await mAll<{ id: string; name: string; objective: string }>(`act_${adAccountId}/campaigns`, accessToken, {
      fields: 'id,name,objective',
      effective_status: JSON.stringify(['ACTIVE']),
    });
    if (!campaigns.length) return skip('Nenhuma campanha ativa');
    const byObjective = campaigns.reduce((acc, c) => {
      if (c.objective) acc[c.objective] = (acc[c.objective] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const duplicated = Object.entries(byObjective).filter(([, count]) => count > 3);
    if (!duplicated.length) return pass('Sem duplicação excessiva de objetivos de campanha');
    const details = duplicated.map(([obj, n]) => `${obj}: ${n} campanhas`).join(', ');
    return warn('Múltiplas campanhas com o mesmo objetivo', details, 'Consolide campanhas com o mesmo objetivo em uma única estrutura com múltiplos adsets. Campanhas demais competem entre si e fragmentam o orçamento.');
  },
};

// ── CRIATIVOS ─────────────────────────────────────────────────────────────────

const creativeDiversity: AuditCheck = {
  id: 'creative_diversity', name: 'Diversidade criativa (≥ 3 anúncios por adset)', category: 'creatives', severity: 'warning',
  async run({ clientId }: AuditContext) {
    const { data: adSets } = await supabase.from('ad_sets')
      .select('id, name, ads(id)')
      .in('campaign_id', (await supabase.from('campaigns').select('id').eq('client_id', clientId).eq('status', 'ACTIVE')).data?.map(c => c.id) ?? []);
    if (!adSets?.length) return skip('Nenhum adset ativo sincronizado');
    const poor = adSets.filter(a => ((a.ads as { id: string }[])?.length ?? 0) < 3);
    if (!poor.length) return pass('Todos os adsets ativos têm ≥ 3 criativos');
    const pct = Math.round((poor.length / adSets.length) * 100);
    return warn(`${poor.length}/${adSets.length} adsets com < 3 criativos (${pct}%)`, poor.slice(0, 5).map(a => a.name).join(', '), 'Cada adset deve ter pelo menos 3 variações criativas. O algoritmo precisa de opções para encontrar qual criativo funciona melhor para cada segmento de público.');
  },
};

const creativeFatigue: AuditCheck = {
  id: 'creative_fatigue', name: 'Detecção de fadiga de criativos', category: 'creatives', severity: 'warning',
  async run({ clientId }: AuditContext) {
    const now = new Date();
    const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
    const d14 = new Date(now); d14.setDate(d14.getDate() - 14);
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const [recent, prior] = await Promise.all([
      supabase.from('campaign_daily_metrics').select('clicks, impressions').eq('client_id', clientId).gte('date', fmt(d7)),
      supabase.from('campaign_daily_metrics').select('clicks, impressions').eq('client_id', clientId).gte('date', fmt(d14)).lt('date', fmt(d7)),
    ]);

    const sumCTR = (rows: { clicks: number; impressions: number }[]) => {
      const t = rows?.reduce((a, r) => ({ c: a.c + r.clicks, i: a.i + r.impressions }), { c: 0, i: 0 });
      return t?.i ? (t.c / t.i) * 100 : 0;
    };

    const ctrRecent = sumCTR((recent.data ?? []) as { clicks: number; impressions: number }[]);
    const ctrPrior  = sumCTR((prior.data ?? []) as { clicks: number; impressions: number }[]);

    if (!ctrPrior) return skip('Dados insuficientes para análise de tendência');
    const drop = ((ctrPrior - ctrRecent) / ctrPrior) * 100;

    if (drop > 30) return fail(`CTR caiu ${drop.toFixed(0)}% nos últimos 7 dias (${ctrPrior.toFixed(2)}% → ${ctrRecent.toFixed(2)}%)`, undefined, 'Fadiga de criativo detectada. Introduza novos criativos imediatamente — mude ângulo, formato (vídeo vs imagem), ou a proposta de valor. Pause criativos com frequência > 3.5.');
    if (drop > 15) return warn(`CTR caiu ${drop.toFixed(0)}% na última semana`, undefined, 'Sinal de fadiga. Adicione novas variações criativas antes que a performance caia mais.');
    return pass(`CTR estável (${ctrRecent.toFixed(2)}%) — sem sinais de fadiga`);
  },
};

const lowCtrCampaigns: AuditCheck = {
  id: 'low_ctr', name: 'Campanhas com CTR abaixo de 1%', category: 'creatives', severity: 'info',
  async run({ clientId }: AuditContext) {
    const { data } = await supabase.from('campaigns').select('name, ctr, impressions').eq('client_id', clientId).eq('status', 'ACTIVE').gt('impressions', 1000);
    if (!data?.length) return skip('Sem campanhas ativas com dados suficientes');
    const low = data.filter(c => c.ctr < 1);
    if (!low.length) return pass('Todas as campanhas ativas têm CTR ≥ 1%');
    return warn(`${low.length} campanha(s) com CTR < 1%`, low.map(c => `${c.name}: ${c.ctr.toFixed(2)}%`).join(', '), 'CTR baixo indica criativos pouco relevantes para o público ou público muito amplo. Teste novos ângulos criativos com promessas mais diretas.');
  },
};

const adFrequencyCheck: AuditCheck = {
  id: 'ad_frequency', name: 'Frequência de anúncios elevada', category: 'creatives', severity: 'warning',
  async run({ adAccountId, accessToken }: AuditContext) {
    try {
      const insights = await mAll<{ ad_id: string; ad_name: string; frequency: string }>(`act_${adAccountId}/insights`, accessToken, {
        fields: 'ad_id,ad_name,frequency',
        date_preset: 'last_7d',
        level: 'ad',
      });
      if (!insights.length) return skip('Sem dados de insights de anúncios');
      const high = insights.filter(i => parseFloat(i.frequency) > 3.5);
      if (!high.length) return pass('Frequência controlada — nenhum anúncio acima de 3.5');
      return warn(`${high.length} anúncio(s) com frequência > 3.5`, high.slice(0, 5).map(i => `${i.ad_name}: ${parseFloat(i.frequency).toFixed(1)}`).join(', '), 'Alta frequência causa fadiga de audiência e eleva o CPM. Pause criativos com frequência > 3.5 e insira novos. Considere ampliar o público.');
    } catch {
      return skip('Não foi possível verificar frequência via API');
    }
  },
};

const minActiveAds: AuditCheck = {
  id: 'min_active_ads', name: 'Adsets com anúncios ativos', category: 'creatives', severity: 'critical',
  async run({ clientId }: AuditContext) {
    const activeCampaignIds = (await supabase.from('campaigns').select('id').eq('client_id', clientId).eq('status', 'ACTIVE')).data?.map(c => c.id) ?? [];
    if (!activeCampaignIds.length) return skip('Nenhuma campanha ativa');
    const { data: adSets } = await supabase.from('ad_sets').select('id, name, ads!inner(status)').in('campaign_id', activeCampaignIds).eq('status', 'ACTIVE');
    if (!adSets?.length) return skip('Nenhum adset ativo');
    const empty = adSets.filter(a => !(a.ads as { status: string }[])?.some(ad => ad.status === 'ACTIVE'));
    if (!empty.length) return pass('Todos os adsets ativos têm pelo menos 1 anúncio ativo');
    return fail(`${empty.length} adset(s) ativo(s) sem nenhum anúncio ativo`, empty.map(a => a.name).join(', '), 'Adsets sem anúncios ativos não entregam. Ative anúncios existentes ou crie novos criativos para esses adsets.');
  },
};

// ── ORÇAMENTO E ENTREGA ───────────────────────────────────────────────────────

const lowBudgetAdsets: AuditCheck = {
  id: 'low_budget', name: 'Adsets com orçamento diário < $10', category: 'budget', severity: 'warning',
  async run({ adAccountId, accessToken }: AuditContext) {
    const adsets = await mAll<{ id: string; name: string; daily_budget?: string; budget_remaining?: string }>(`act_${adAccountId}/adsets`, accessToken, {
      fields: 'id,name,daily_budget,budget_remaining',
      effective_status: JSON.stringify(['ACTIVE']),
    });
    if (!adsets.length) return skip('Nenhum adset ativo');
    // daily_budget in cents
    const low = adsets.filter(a => a.daily_budget && parseInt(a.daily_budget) < 1000);
    if (!low.length) return pass('Todos os adsets ativos têm orçamento ≥ $10/dia');
    return warn(`${low.length} adset(s) com orçamento < $10/dia`, low.map(a => `${a.name}: $${((parseInt(a.daily_budget ?? '0')) / 100).toFixed(0)}/dia`).join(', '), 'Orçamento muito baixo impede que o algoritmo saia da fase de aprendizado. Meta mínimo: 50 conversões/semana × CPA médio. Consolide adsets ou aumente o orçamento.');
  },
};

const spendCapNear: AuditCheck = {
  id: 'spend_cap_near', name: 'Limite de gasto da conta próximo', category: 'budget', severity: 'critical',
  async run({ adAccountId, accessToken }: AuditContext) {
    const account = await mGet<{ spend_cap?: string; amount_spent?: string }>(`act_${adAccountId}`, accessToken, { fields: 'spend_cap,amount_spent' });
    if (!account.spend_cap || account.spend_cap === '0') return pass('Sem limite de gasto configurado na conta');
    const cap = parseInt(account.spend_cap);
    const spent = parseInt(account.amount_spent ?? '0');
    const pct = (spent / cap) * 100;
    if (pct >= 90) return fail(`${pct.toFixed(0)}% do limite de gasto atingido ($${(spent / 100).toFixed(0)} / $${(cap / 100).toFixed(0)})`, undefined, 'URGENTE: Aumente o limite de gasto ou remova-o antes de atingir 100%. Campanhas param completamente ao atingir o limite.');
    if (pct >= 75) return warn(`${pct.toFixed(0)}% do limite de gasto consumido`, undefined, 'Monitore e ajuste o limite antes de atingir 100%.');
    return pass(`${pct.toFixed(0)}% do limite de gasto — nível saudável`);
  },
};

const budgetEfficiency: AuditCheck = {
  id: 'budget_efficiency', name: 'Entrega de orçamento nos últimos 7 dias', category: 'budget', severity: 'info',
  async run({ clientId }: AuditContext) {
    const d7 = new Date(); d7.setDate(d7.getDate() - 7);
    const { data } = await supabase.from('campaign_daily_metrics').select('spend').eq('client_id', clientId).gte('date', d7.toISOString().split('T')[0]);
    if (!data?.length) return skip('Sem dados de gasto para análise');
    const totalSpend = data.reduce((sum, r) => sum + r.spend, 0);
    const avgDaily = totalSpend / 7;
    const variance = data.reduce((sum, r) => sum + Math.abs(r.spend - avgDaily), 0) / 7;
    const cv = avgDaily ? (variance / avgDaily) * 100 : 0;
    if (cv > 50) return warn(`Alta variação de entrega diária (${cv.toFixed(0)}% CV)`, `Média: $${avgDaily.toFixed(0)}/dia, variação: $${variance.toFixed(0)}`, 'Variação excessiva pode indicar problemas de entrega ou leilão instável. Revise segmentação e orçamento.');
    return pass(`Entrega estável — variação diária de ${cv.toFixed(0)}%`);
  },
};

const budgetVariation: AuditCheck = {
  id: 'budget_variation', name: 'Sem variações bruscas de orçamento recentes', category: 'budget', severity: 'info',
  async run({ adAccountId, accessToken }: AuditContext) {
    // Heurística: verificar se há muitas campanhas com status recentemente alterado
    const campaigns = await mAll<{ id: string; name: string; effective_status: string; updated_time: string }>(`act_${adAccountId}/campaigns`, accessToken, {
      fields: 'id,name,effective_status,updated_time',
      effective_status: JSON.stringify(['ACTIVE']),
    });
    const cutoff = new Date(); cutoff.setHours(cutoff.getHours() - 24);
    const recentChanges = campaigns.filter(c => c.updated_time && new Date(c.updated_time) > cutoff);
    if (recentChanges.length > 5) return warn(`${recentChanges.length} campanhas alteradas nas últimas 24h`, recentChanges.map(c => c.name).join(', '), 'Mudanças frequentes reiniciam o aprendizado. Aguarde pelo menos 3-4 dias entre ajustes significativos de orçamento ou segmentação (regra dos 20%).');
    return pass('Sem alterações excessivas de campanha nas últimas 24h');
  },
};

// ── QUALIDADE DA CONTA ────────────────────────────────────────────────────────

const accountStatusCheck: AuditCheck = {
  id: 'account_status', name: 'Status da conta de anúncios', category: 'account', severity: 'critical',
  async run({ adAccountId, accessToken }: AuditContext) {
    const STATUS: Record<number, string> = {
      1: 'Ativa', 2: 'Desativada', 3: 'Saldo pendente', 7: 'Em revisão',
      8: 'Em período de carência', 9: 'Pendente de encerramento', 100: 'Pendente',
    };
    const account = await mGet<{ account_status: number; disable_reason?: number }>(`act_${adAccountId}`, accessToken, {
      fields: 'account_status,disable_reason',
    });
    const statusNum = account.account_status;
    const statusLabel = STATUS[statusNum] ?? `Código ${statusNum}`;
    if (statusNum === 1) return pass(`Conta ativa — status: ${statusLabel}`);
    if (statusNum === 3) return fail(`Conta com saldo pendente (${statusLabel})`, undefined, 'Regularize o pagamento imediatamente. Conta com saldo pendente pode ter campanhas pausadas automaticamente.');
    if (statusNum === 2) return fail(`Conta desativada`, `Motivo: ${account.disable_reason ?? 'não especificado'}`, 'Entre em contato com o suporte da Meta para entender e resolver a desativação.');
    return warn(`Status da conta: ${statusLabel}`, undefined, 'Monitore e resolva qualquer pendência na conta para garantir entrega sem interrupções.');
  },
};

const paymentMethod: AuditCheck = {
  id: 'payment_method', name: 'Método de pagamento válido', category: 'account', severity: 'critical',
  async run({ adAccountId, accessToken }: AuditContext) {
    try {
      const account = await mGet<{ funding_source_details?: { display_string?: string; expiry_month?: number; expiry_year?: number } }>(`act_${adAccountId}`, accessToken, {
        fields: 'funding_source_details',
      });
      const fs = account.funding_source_details;
      if (!fs) return warn('Sem método de pagamento principal configurado', undefined, 'Configure um método de pagamento primário. Sem pagamento configurado, campanhas podem pausar inesperadamente.');
      if (fs.expiry_month && fs.expiry_year) {
        const expiryDate = new Date(fs.expiry_year, fs.expiry_month - 1);
        const monthsUntilExpiry = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30);
        if (monthsUntilExpiry < 1) return fail(`Pagamento expira em menos de 1 mês`, fs.display_string, 'Atualize o método de pagamento urgentemente para evitar interrupção de campanhas.');
        if (monthsUntilExpiry < 3) return warn(`Pagamento expira em ${monthsUntilExpiry.toFixed(0)} meses`, fs.display_string, 'Planeje a atualização do método de pagamento antes do vencimento.');
      }
      return pass(`Método de pagamento configurado: ${fs.display_string ?? 'Verificado'}`);
    } catch {
      return skip('Não foi possível verificar o método de pagamento');
    }
  },
};

const policyQuality: AuditCheck = {
  id: 'policy_quality', name: 'Taxa de reprovação de anúncios', category: 'account', severity: 'warning',
  async run({ adAccountId, accessToken }: AuditContext) {
    const [all, disapproved] = await Promise.all([
      mAll<{ id: string }>(`act_${adAccountId}/ads`, accessToken, { effective_status: JSON.stringify(['ACTIVE', 'PAUSED', 'DISAPPROVED', 'WITH_ISSUES']), fields: 'id' }),
      mAll<{ id: string }>(`act_${adAccountId}/ads`, accessToken, { effective_status: JSON.stringify(['DISAPPROVED', 'WITH_ISSUES']), fields: 'id' }),
    ]);
    if (!all.length) return skip('Sem anúncios para análise');
    const ratio = (disapproved.length / all.length) * 100;
    if (ratio === 0) return pass('Zero anúncios reprovados — excelente histórico de qualidade');
    if (ratio < 10) return warn(`${ratio.toFixed(0)}% de taxa de reprovação (${disapproved.length}/${all.length})`, undefined, 'Revise as políticas de publicidade da Meta e corrija os anúncios reprovados para manter bom histórico de qualidade na conta.');
    return fail(`${ratio.toFixed(0)}% de taxa de reprovação — nível crítico`, `${disapproved.length} de ${all.length} anúncios reprovados ou com problemas`, 'Alta taxa de reprovação pode levar a restrições permanentes de conta. Revise todos os anúncios reprovados, identifique padrões de violação e treine a equipe de criação.');
  },
};

const highCpcCheck: AuditCheck = {
  id: 'high_cpc', name: 'CPC médio das campanhas', category: 'account', severity: 'info',
  async run({ clientId }: AuditContext) {
    const { data } = await supabase.from('campaigns').select('name, cpc, clicks').eq('client_id', clientId).eq('status', 'ACTIVE').gt('clicks', 100);
    if (!data?.length) return skip('Sem dados suficientes de CPC');
    const avgCpc = data.reduce((sum, c) => sum + c.cpc, 0) / data.length;
    const high = data.filter(c => c.cpc > avgCpc * 2);
    if (!high.length) return pass(`CPC médio: $${avgCpc.toFixed(2)} — sem anomalias`);
    return warn(`${high.length} campanha(s) com CPC 2× acima da média`, high.map(c => `${c.name}: $${c.cpc.toFixed(2)}`).join(', '), 'CPC muito acima da média indica baixa relevância do anúncio para o público ou Score de Qualidade baixo. Melhore o criativo e o alinhamento da landing page.');
  },
};

const bmAccessCheck: AuditCheck = {
  id: 'bm_access', name: 'Acessos do Business Manager', category: 'account', severity: 'info',
  async run(_ctx: AuditContext) {
    return warn('Verificação de acessos do BM requer revisão manual', undefined, 'Acesse Business Manager → Usuários e verifique: (1) Remova usuários que saíram da empresa, (2) Revise permissões de parceiros/agências, (3) Habilite autenticação em dois fatores para todos os usuários administradores.');
  },
};

// ── EXPORT ────────────────────────────────────────────────────────────────────

export const ALL_CHECKS: AuditCheck[] = [
  // Pixel & Tracking
  pixelInstalled,
  pixelActive,
  capiConfigured,
  eventMatchQuality,
  conversionEvents,
  domainVerified,
  // Estrutura
  cboUsage,
  learningPhase,
  learningStalledCheck,
  disapprovedAds,
  duplicateObjectives,
  // Criativos
  creativeDiversity,
  creativeFatigue,
  lowCtrCampaigns,
  adFrequencyCheck,
  minActiveAds,
  // Orçamento & Entrega
  lowBudgetAdsets,
  spendCapNear,
  budgetEfficiency,
  budgetVariation,
  // Qualidade da Conta
  accountStatusCheck,
  paymentMethod,
  policyQuality,
  highCpcCheck,
  bmAccessCheck,
];
