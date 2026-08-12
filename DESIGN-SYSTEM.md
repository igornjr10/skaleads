# Scale Ads Design System

Esta base concentra o visual principal do projeto para reaproveitar em outros apps.

## Onde esta a base

- `src/design-system/tokens.ts`
- `src/design-system/components.ts`
- `src/design-system/index.ts`
- `src/index.css`

## O que reaproveitar primeiro

1. Tokens visuais
- fonte `Plus Jakarta Sans`
- cores semanticas
- gradientes
- sombras
- radius

2. Estrutura de navegacao
- `AppLayout`
- `AppSidebar`
- `components/ui/sidebar.tsx`

3. Componentes de interface
- `StatusBadge`
- cards com `shadow-card`
- paines com blur e borda suave
- tabelas com destaque operacional

## Como levar para outro projeto

1. Copie `src/index.css` e ajuste o tema do novo app.
2. Copie a pasta `src/design-system/`.
3. Copie estes componentes se quiser a mesma navegacao:
- `src/components/AppLayout.tsx`
- `src/components/AppSidebar.tsx`
- `src/components/ui/sidebar.tsx`
- `src/components/StatusBadge.tsx`

4. Garanta que o novo projeto tenha:
- Tailwind configurado
- `class-variance-authority`
- `lucide-react`
- componentes `ui` equivalentes

## Tokens principais

### Tipografia

- fonte principal: `Plus Jakarta Sans`
- uso: titulos fortes, interface compacta, leitura moderna

### Paleta

- `primary`: verde emerald (`hsl(160 84% 44%)`) para CTA e foco
- `background`: preto quase absoluto
- `card`: cinza escuro elevado
- `muted`: superfice secundaria
- `success`: verde para saude
- `warning`: amarelo para atencao
- `destructive`: vermelho para erro

### Linguagem visual

- cantos grandes: `rounded-xl` e `rounded-2xl`
- blur em topo, footer e paineis flutuantes
- sombra escura com glow verde pontual
- destaque de item ativo com gradiente suave e trilha lateral

## Padrões de uso

### Sidebar

- modo recolhido por padrao
- expande no hover no desktop
- icones grandes
- item ativo com glow discreto

### Header

- barra sticky
- fundo translúcido
- contexto da pagina visivel

### Cards

- usar `shadow-card`
- combinar borda suave com `bg-background/60` ou `bg-card`
- reservar o glow para pontos de destaque e nao para tudo

### Estados

- sucesso: verde suave
- atencao: amber
- erro: rose
- ativo: destacar sem exagero

## Import rapido

```ts
import { scaleAdsDesignTokens, scaleAdsUtilityClasses } from "@/design-system";
```

```ts
import { AppLayout, AppSidebar, StatusBadge } from "@/design-system";
```

## Recomendacao

Se o outro projeto tiver cara diferente, mantenha:
- espacamento
- contraste
- sistema de sombras
- estrutura de navegacao

E troque apenas:
- cor primaria
- logo
- labels
- algumas variacoes de badge
