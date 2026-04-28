import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Cpu, Zap, Target, TrendingUp, Lightbulb, BarChart3, CheckCircle, XCircle, Brain, Users, Layers, Eye } from "lucide-react";

export default function Andromeda() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meta Andromeda</h1>
        <p className="text-sm text-muted-foreground">A nova era da publicidade com inteligência artificial</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="shift">A Grande Virada</TabsTrigger>
          <TabsTrigger value="results">Resultados</TabsTrigger>
          <TabsTrigger value="mindset">Novo Mindset</TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Visão Geral ── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card className="shadow-card border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle>O Supercerebro Publicitário</CardTitle>
                  <CardDescription>Motor de IA que substitui o sistema tradicional de entrega de anúncios</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                O Meta Andromeda é o novo motor de inteligência artificial capaz de analisar{" "}
                <strong className="text-foreground">bilhões de combinações</strong> entre usuários, criativos,
                contexto e intenção em milissegundos. Em vez de depender de modelos separados e etapas manuais,
                integra tudo em uma única rede neural profunda com muito mais velocidade, contexto e precisão.
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Hardware Avançado</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Utiliza <strong className="text-foreground">NVIDIA Grace Hopper</strong> e{" "}
                  <strong className="text-foreground">MTIA</strong> para processamento ultrarrápido,
                  garantindo análises em tempo real de bilhões de sinais.
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  <CardTitle className="text-base">Atualização em Tempo Real</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  O sistema atualiza seu próprio comportamento{" "}
                  <strong className="text-foreground">quase instantaneamente</strong>, aprendendo
                  continuamente com cada interação e ajustando a entrega sem intervenção manual.
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-green-500" />
                  <CardTitle className="text-base">Personalização 1:1</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Cada usuário recebe anúncios{" "}
                  <strong className="text-foreground">personalizados na hora exata</strong>, com o
                  criativo certo para o contexto e intenção daquele momento específico.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── TAB 2: A Grande Virada ── */}
        <TabsContent value="shift" className="space-y-4 mt-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Do Público ao Criativo</CardTitle>
              <CardDescription>A mudança de paradigma que redefine como os anúncios são distribuídos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                O foco deixou de ser a segmentação manual e passou a ser o{" "}
                <strong className="text-foreground">criativo</strong>. A mensagem, o contexto e o ângulo
                do anúncio são os principais fatores que determinam para quem ele será exibido. O sistema
                interpreta o conteúdo do criativo, entende o tipo de pessoa que deve ver aquilo e distribui
                o orçamento buscando o melhor match possível.
              </p>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium text-destructive">Antes</th>
                      <th className="px-4 py-3 text-left font-medium text-green-600 dark:text-green-400">Agora</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="px-4 py-3 text-muted-foreground">Segmentação manual e controle rígido de públicos</td>
                      <td className="px-4 py-3 text-foreground">Criativo como principal fator de distribuição</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-3 text-muted-foreground">Anunciante "adivinha" o público ideal</td>
                      <td className="px-4 py-3 text-foreground">IA interpreta o criativo e encontra o público</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-muted-foreground">Múltiplos modelos separados por etapa</td>
                      <td className="px-4 py-3 text-foreground">Rede neural única integrada e contínua</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Simplicidade é a Nova Estratégia</CardTitle>
              <CardDescription>Menos restrições = mais liberdade para o sistema encontrar oportunidades</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                Campanhas mais simples, com menos conjuntos e menos restrições, tendem a performar melhor.
                Estruturas complexas com segmentações hipergranulares e controle excessivo de orçamento (ABO)
                perdem eficiência no novo modelo.
              </p>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium text-destructive">✗ Estratégias Antigas</th>
                      <th className="px-4 py-3 text-left font-medium text-green-600 dark:text-green-400">✓ Nova Abordagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Segmentações hipergranulares", "Estruturas simples e abertas"],
                      ["Dezenas de conjuntos de anúncios", "Poucos conjuntos, mais sinais"],
                      ["Controle excessivo de orçamento (ABO)", "Automação via CBO"],
                      ["Campanhas fragmentadas", "Estruturas limpas e consolidadas"],
                    ].map(([old, novo], i) => (
                      <tr key={i} className={i < 3 ? "border-b" : ""}>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                            {old}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2 text-foreground">
                            <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                            {novo}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: Resultados ── */}
        <TabsContent value="results" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: BarChart3, color: "text-blue-500", value: "+6%", label: "Recuperação de Anúncios", desc: "Melhora na capacidade de encontrar criativos ideais para cada pessoa" },
              { icon: TrendingUp, color: "text-purple-500", value: "+8%", label: "Qualidade dos Anúncios", desc: "Aumento na qualidade dos anúncios exibidos aos usuários" },
              { icon: Target, color: "text-green-500", value: "+22%", label: "Aumento no ROAS", desc: "Para anunciantes que ativaram recursos de IA criativa" },
              { icon: Users, color: "text-orange-500", value: "+7%", label: "Mais Conversões", desc: "Crescimento nas conversões com uso de IA criativa" },
            ].map(({ icon: Icon, color, value, label, desc }) => (
              <Card key={label} className="shadow-card">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${color}`} />
                    <CardTitle className="text-base">{label}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className={`text-4xl font-bold ${color} mb-1`}>{value}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="shadow-card border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <CardTitle>3× Mais Capacidade de Processamento</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground leading-relaxed">
                O Andromeda possui três vezes mais capacidade de processar anúncios por segundo,
                o que amplia as possibilidades de testes e acelera o processo de aprendizado.
              </p>
              <blockquote className="border-l-4 border-primary pl-4 italic text-sm text-muted-foreground">
                "Quem ajusta sua estratégia para o novo modelo tende a captar esses ganhos; quem insiste
                em métodos antigos está, literalmente, nadando contra a corrente do próprio algoritmo."
              </blockquote>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 4: Novo Mindset ── */}
        <TabsContent value="mindset" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { icon: Brain, color: "text-purple-500", title: "Aceite a Automação", desc: "O papel do anunciante não é mais tentar 'adivinhar' o público. A função agora é alimentar o sistema com bons criativos e estruturas simples, deixando a IA encontrar as melhores oportunidades." },
              { icon: Lightbulb, color: "text-yellow-500", title: "Criativo é o Motor", desc: "Diversidade criativa, diferentes ângulos, promessas, provas e níveis de consciência tornam-se essenciais. O criativo agora determina quem vê seu anúncio." },
              { icon: Layers, color: "text-blue-500", title: "Simplifique Estruturas", desc: "Em vez de dezenas de campanhas fragmentadas, estruturas mais limpas com CBO e poucos conjuntos entregam mais sinal e menos ruído para o algoritmo." },
              { icon: Eye, color: "text-green-500", title: "Visão Holística", desc: "Observe o ecossistema como um todo: nem todo anúncio tem que gerar resultado direto. Alguns criam demanda, outros convertem, outros reforçam narrativa." },
            ].map(({ icon: Icon, color, title, desc }) => (
              <Card key={title} className="shadow-card">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${color}`} />
                    <CardTitle className="text-base">{title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Estrategistas vs. Amadores</CardTitle>
              <CardDescription>O que separa anunciantes amadores de estrategistas de alto nível</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium text-destructive">✗ Abordagem Amadora</th>
                      <th className="px-4 py-3 text-left font-medium text-green-600 dark:text-green-400">✓ Estrategista de Alto Nível</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Desliga anúncios precipitadamente", "Interpreta o ecossistema completo"],
                      ["Busca resultados imediatos em tudo", "Entende diferentes funções dos anúncios"],
                      ["Ignora o papel de cada anúncio no funil", "Confia na automação inteligente"],
                      ["Fragmenta excessivamente as campanhas", "Simplifica para amplificar o resultado"],
                    ].map(([amador, estrategista], i) => (
                      <tr key={i} className={i < 3 ? "border-b" : ""}>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                            {amador}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2 text-foreground">
                            <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                            {estrategista}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
