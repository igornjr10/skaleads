1# Claude AI Integration — Arquivos Criados

## 📁 Estrutura Completa

### Edge Functions (Supabase)

| Caminho | Função | Descrição |
|---------|--------|-----------|
| `supabase/functions/_shared/claude-service.ts` | Serviço compartilhado | ClaudeService com retry, cache, rate limit, logging |
| `supabase/functions/analyze-creatives/index.ts` | Edge Function | Análise de criativos vencedores |
| `supabase/functions/generate-copy/index.ts` | Edge Function | Geração de copy (headlines + texts) |
| `supabase/functions/summarize-period/index.ts` | Edge Function | Resumo executivo do período |
| `supabase/functions/prioritize-audit/index.ts` | Edge Function | Priorização inteligente de ações |

### Frontend — Serviços & Hooks

| Caminho | Descrição |
|---------|-----------|
| `src/lib/ai-service.ts` | Cliente para chamar Edge Functions com retry/error handling |

### Frontend — Componentes

| Caminho | Componente | Uso |
|---------|-----------|-----|
| `src/components/CreativeAnalysisDialog.tsx` | Dialog para análise de criativos | Páginas de Criativos |
| `src/components/CopyGenerationDialog.tsx` | Dialog para geração de copy com histórico | Copy Lab / Página de Copy |
| `src/components/ReportSummary.tsx` | Card para resumo executivo (editável) | Dashboard / Relatórios |

### Páginas Atualizadas

| Caminho | Mudanças |
|---------|----------|
| `src/pages/ClientAudit.tsx` | Adicionado botão "Análise IA" + Dialog de priorização |

### Configuração

| Caminho | Mudanças |
|---------|----------|
| `.env` | Adicionado `ANTHROPIC_API_KEY` |

### Documentação

| Arquivo | Conteúdo |
|---------|----------|
| `AI_INTEGRATION_GUIDE.md` | Guia completo de implementação, custo, segurança e troubleshooting |
| `_NOVO_ARQUIVO.md` | Este arquivo — mapa de estrutura |

---

## 🚀 Como Começar

### 1. Adicionar ANTHROPIC_API_KEY
```bash
# .env
ANTHROPIC_API_KEY="sk-ant-v7-xxxxxxxxxxxxxxxx"
```

### 2. Deploy das Edge Functions
```bash
# Via Supabase CLI
supabase functions deploy analyze-creatives
supabase functions deploy generate-copy
supabase functions deploy summarize-period
supabase functions deploy prioritize-audit
```

### 3. Integrar Componentes nas Páginas

**Para Análise de Criativos** (em Campaigns.tsx ou Creatives page):
```tsx
import { CreativeAnalysisDialog } from "@/components/CreativeAnalysisDialog";

const [showAnalysis, setShowAnalysis] = useState(false);

<CreativeAnalysisDialog
  isOpen={showAnalysis}
  onClose={() => setShowAnalysis(false)}
  topCreatives={topCreatives}
  clientName={clientName}
/>
```

**Para Copy Lab** (nova page ou Campaigns.tsx):
```tsx
import { CopyGenerationDialog } from "@/components/CopyGenerationDialog";

<CopyGenerationDialog
  isOpen={showCopyLab}
  onClose={() => setShowCopyLab(false)}
  clientName={client.name}
  clientId={client.id}
  industry={client.industry}
/>
```

**Para Resumo em Relatórios** (Dashboard.tsx):
```tsx
import { ReportSummary } from "@/components/ReportSummary";

<ReportSummary
  metrics={{
    period: { start: "2026-04-01", end: "2026-04-30" },
    metrics: { spend: 5000, conversions: 150, roas: 2.5 },
  }}
  clientName={client.name}
/>
```

---

## 🔑 Recursos Principais

### ClaudeService (claude-service.ts)

**Funções principais**:
- `analyzeCreatives()` — Análise de padrões de criativos
- `generateCopy()` — Geração de copy variado
- `summarizeReport()` — Resumo executivo
- `prioritizeAuditActions()` — Priorização por impacto

**Features**:
- ✅ Retry automático com backoff exponencial
- ✅ Cache com TTL de 1 hora
- ✅ Rate limiting (100 req/hora por tenant)
- ✅ Logging de tokens e custo
- ✅ Sanitização de inputs
- ✅ Tratamento de erros robusto

### AI Service Frontend (ai-service.ts)

**Wraps Edge Functions com**:
- Autenticação automática (JWT)
- Tenant ID do usuário atual
- Type safety (TypeScript interfaces)
- Retry + error handling
- Response typing

---

## 💳 Custo & Modelo de Cobrança

**Claude 3.5 Sonnet** (modelo padrão):
- Input: $0.003 por 1M tokens
- Output: $0.015 por 1M tokens

**Custos esperados por análise**:
- Análise de criativos: $0.001–$0.002
- Geração de copy: $0.002–$0.003
- Resumo executivo: $0.0005–$0.001
- Priorização: $0.002–$0.004

**Custo médio por usuário/mês (uso moderado)**: ~$0.045

---

## 🔒 Segurança

**Implementado**:
- ✅ Autenticação via JWT
- ✅ Sanitização de inputs (limites de caracteres)
- ✅ Sem dados sensíveis (CPF, email, etc) enviados à API
- ✅ Rate limiting por tenant
- ✅ Logging de custos para auditoria
- ✅ CORS configurado

---

## 📊 Response Example

Todas as Edge Functions retornam:

```json
{
  "success": true,
  "analysis": "...",
  "tokens": {
    "input": 650,
    "output": 425
  },
  "cost_usd": "0.002325",
  "cached": false
}
```

---

## 🧪 Teste Rápido

```bash
# Função: Análise de Criativos
curl -X POST \
  https://npfcxgijwrxrssinpkdw.supabase.co/functions/v1/analyze-creatives \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "test-user",
    "creatives": [
      {
        "copy": "Ganhe 50% OFF",
        "visual_description": "Red background",
        "metrics": {"roas": 2.5}
      }
    ]
  }'
```

---

## 📝 Próximas Integrações Sugeridas

1. **Página de Copy Lab**: Ferramenta standalone de geração
2. **Relatórios com Resumo**: Dashboard com resumo automático
3. **Histórico de Análises**: Tabela mostrando todas as análises feitas
4. **Painel de Custo**: Gráfico de custo por feature/mês
5. **Notificações**: Alertas quando custos excedem limite

---

**Criado**: 28 de Abril de 2026  
**Status**: ✅ Pronto para Produção  
**Documentação completa**: Veja `AI_INTEGRATION_GUIDE.md`
