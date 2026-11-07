# COORDIX · Fase 01: confiabilidade do núcleo geométrico

**Relatório técnico, 07/11/2026**

**Resultado:** 53 de 53 cenários aprovados na suíte de testes geométricos. No comparativo com o motor da v1, a v2 acertou 21 de 21 decisões e a v1 acertou 18 de 21. O maior erro de penetração caiu de 712 mm (v1) para 0 mm (v2). O app continua operacional de ponta a ponta: leitura IFC, 3D, propriedades, análise, revisão, issues e BCF.

## 1. Diagnóstico inicial

Reli o código da versão publicada (commit inicial, motor "v1"), com atenção às funções `exactTest()`, `crossPoints()`, `insideVerts()`, `pointInside()`, `meshDistance()`, `trisIn()`, `runAnalysis()` e `buildGeometry()`. Cada problema abaixo foi confirmado no código. Os que tinham efeito observável foram reproduzidos em teste.

| # | Onde | Problema | Efeito | Evidência |
|---|---|---|---|---|
| D1 | `exactTest()` | A penetração era a **menor extensão em X, Y e Z** da caixa dos pontos de cruzamento e dos vértices internos. Essa medida depende da orientação dos eixos e mede a curva de fronteira, não a região de interseção. | Superestima em geometria girada e não distingue o tamanho da região da profundidade. | A mesma cena girada deu 732 mm onde o real é 20 mm. Um contato de 3 mm foi acusado como conflito com tolerância de 5 mm. |
| D2 | `crossPoints()` | Limite de 40.000 pares: o laço para e retorna o que já tinha encontrado, **sem avisar**. | O resultado parcial é tratado como completo. | Leitura do código: `if(++n>limit) return;` |
| D3 | `insideVerts()` | Limite de 160 vértices, também **sem aviso**. | Falso negativo: uma peça de malha fina contida em outra virou "sem conflito" (0 mm, quando o real é 200 mm). | Comparativo, caso "peça contida de 2.400 vértices" |
| D4 | `meshDistance()` | Limite de 60.000 pares, devolvendo o melhor valor encontrado até ali. Além disso, **não testava** triângulos que se cruzam. | A folga podia ser informada maior do que a real. | Leitura do código |
| D5 | `pointInside()` | Paridade por raio numa direção fixa, sem tratar raios que passam por aresta ou vértice. Os limites inclusivos do teste contavam arestas compartilhadas duas vezes. Também não tratava malha aberta. | Erro na classificação dentro/fora. | 19 erros em 49 pontos com raio rasante a uma aresta |
| D6 | `segTri()` / `crossPoints()` | Triângulos coplanares eram ignorados e contato tangencial gerava pontos. | Contato era tratado como "interferência abaixo da tolerância", e faces coincidentes dependiam só de D3. | Leitura do código |
| D7 | `runAnalysis()` | Os pares eram identificados pelo par de **GUIDs**, e resultado nulo virava "não há clash". | Elementos com GUID repetido ou vazio desapareciam em silêncio, e truncamento virava ausência de conflito. | Leitura do código |
| D8 | `runAnalysis()` | A regra `valor > tolerância + 0,5 mm` somava uma folga arbitrária de 0,5 mm à tolerância. | Interferência de 0,5 mm com tolerância de 0,2 mm foi descartada. | Comparativo |
| D9 | `buildGeometry()` | As coordenadas mundiais eram gravadas em **Float32** em relação à origem do primeiro modelo, e a análise usava esses valores. | Perda de precisão quando os modelos estão longe uns dos outros. | Teste C10d: erro de 357 mm ao gravar em Float32 uma coordenada de 9.000 km |
| D10 | `buildGeometry()` | Unidade definida por heurística sem registro. Unidades por conversão (pés e polegadas) eram ignoradas. Geometrias que falhavam saíam da análise em silêncio. | Escala errada ou elementos ausentes sem aviso. | Leitura do código |
| D11 | `exactTest()` | O retorno `null` misturava "sem conflito" com "não verificado". | Não era possível saber se a análise tinha terminado. | Leitura do código |

## 2. Alterações implementadas

| Arquivo | O que mudou |
|---|---|
| `coordix-geometria.js` (**novo**) | Núcleo geométrico separado, sem dependências e usado pelo app e pelos testes. Tem tolerâncias centralizadas (`GEO`), limites configuráveis (`GEO.LIMITS`) e estados de confiabilidade (`STATE`). |
| `index.html` | `buildGeometry()` passou a usar precisão dupla e a escala de unidade centralizada, e sinaliza coordenadas distantes e unidades sem suporte. `runAnalysis()` usa `evaluatePair()`, identifica os pares pelo índice do elemento e nunca descarta resultados inconclusivos ou incompletos. A interface mostra o estado e o método de cada resultado. As funções antigas foram removidas. O app foi renomeado para COORDIX. |
| `testes/` (**novo**) | Suíte de 53 cenários, comparativo com a v1, geradores de formas e o motor v1 preservado só para comparação. |
| `README.md` | Nome, estrutura, como rodar os testes e roteiro. |

Correspondência entre as funções antigas e as novas:

| v1 | v2 |
|---|---|
| `trisIn()` | `trianglesInBox()` (Float64; caixa por triângulo pré-calculada em `prepareMesh()`) |
| `crossPoints()` + `segTri()` | `triTriIntersect()` (classifica NONE, TOUCH ou CROSS) + `contactSearch()` |
| `pointInside()` | `windingNumber()` + `signedDistance()` |
| `insideVerts()` | `containmentProbe()` (sem amostragem truncada) |
| `meshDistance()` | `minDistance()` + `triTriDist2()` (exata, inclusive para triângulos que se cruzam) |
| `exactTest()` | `evaluatePair()` + `depthBound()` / `chebyshev()` + `convexIntersection()` / `intersectionVolume()` |

## 3. Metodologias geométricas

### 3.1 Existência de interferência (separada da profundidade)

A existência de interferência é decidida antes de qualquer medida, por dois testes independentes:

1. **Cruzamento transversal das superfícies.** `triTriIntersect()` classifica cada par de triângulos. CROSS exige que cada triângulo tenha vértices estritamente dos dois lados do plano do outro e que o trecho comum tenha comprimento maior que `EPS_LEN`. Casos coplanares, de contato por vértice ou aresta e de contato rasante são TOUCH. Em malhas fechadas, um CROSS implica sobreposição de interiores com volume positivo.
2. **Pontos de prova de contenção.** Em cada face, 4 pontos são recuados 0,5 mm e 0,1 mm para dentro do elemento. Um ponto que esteja dentro dos dois elementos prova sobreposição. Esse teste cobre peças contidas e coincidentes, que não têm cruzamento de superfícies.

Sem cruzamento e sem ponto interno comum, o resultado é **CONTATO** (se houver toque) ou **SEM CONFLITO**.

### 3.2 Profundidade: espessura de interferência

Definição: **t = 2·r\***, com **r\* = max_p min(sd_A(p), sd_B(p))**, onde sd é a distância com sinal (positiva dentro). r\* é o raio da maior esfera contida ao mesmo tempo nos dois sólidos, então t é a espessura do material compartilhado. Propriedades:

- t = 0 quando há apenas contato.
- Em sólidos convexos com penetração rasa, t coincide com a profundidade de penetração (a menor translação que os separa).
- Para um tubo de diâmetro d atravessando uma parede de espessura e, t = min(d, e).
- t é invariante a rotação.

Para elementos longos que se atravessam (tubo × parede), a menor translação de separação é grande demais para ter significado na coordenação: seria o tubo inteiro sair pela borda da parede. Por isso essa definição foi escolhida.

Cálculo:

- **Pares convexos** (a maioria dos elementos IFC: vigas e pilares retangulares, lajes, tubos, dutos): a interseção é o conjunto dos planos das faces de A e de B. O r\* é obtido **exatamente** pelo centro de Chebyshev, um problema de programação linear resolvido por simplex com regra de Bland.
- **Pares não convexos** (perfis I, peças em L, peças com vários componentes): ramo-e-limite sobre células da caixa comum. Como f = min(sd_A, sd_B) é 1-Lipschitz, numa célula de centro c e meia-diagonal h vale f ≤ f(c) + h. Isso dá **limites rigorosos lb ≤ r\* ≤ ub**. A decisão em relação à tolerância usa esses limites: lb > tol/2 confirma o conflito, e ub ≤ tol/2 prova que está abaixo da tolerância. O valor exibido é o limite inferior garantido, e o intervalo aparece quando a lacuna passa de 0,5 mm.
- **Verificação cruzada:** nos pares convexos dos testes, o resultado exato da programação linear sempre ficou dentro do intervalo do ramo-e-limite (teste R12).

### 3.3 Volume de interseção

- **Pares convexos:** o poliedro A é recortado pelos planos de B (Sutherland–Hodgman em cada face, mais uma face de fechamento), e o volume sai pelo teorema da divergência. É **exato**.
- **Pares não convexos:** classificação de células por octree com o mesmo critério de Lipschitz, que dá um **intervalo garantido** [vmin, vmax]. Na interface aparece como "a" (por exemplo, 8 a 20 cm³).
- A extensão da região de interseção aparece separada, rotulada como "caixa, não é a penetração".

### 3.4 Contenção (dentro/fora)

Usa o **número de voltas generalizado** (Jacobson et al., 2013), com o ângulo sólido de cada triângulo calculado pela fórmula de Van Oosterom–Strackee. Ele não tem as degenerescências de raio, aresta e vértice do teste de paridade. A orientação das faces é corrigida pelo sinal do volume. Malha aberta, orientação inconsistente e valores entre 0,1 e 0,9 rebaixam a qualidade do resultado para "aproximada".

### 3.5 Distância (folga)

Distância exata entre triângulos: 0 se eles se intersectam; caso contrário, o mínimo entre 6 distâncias vértice-face e 9 aresta-aresta (Ericson, *Real-Time Collision Detection*). Entram no cálculo as faces de A dentro da caixa de B alargada pela folga, e vice-versa. Esse recorte é válido: ele corrige o recorte da v1, que usava a caixa comum.

### 3.6 Estados de confiabilidade

| Estado | Significado | Vai para a lista de clashes? |
|---|---|---|
| Confirmado | Conflito acima da tolerância ou folga violada, com prova geométrica | Sim |
| Abaixo da tolerância | A interferência existe, mas está provadamente ≤ tolerância | Não (é contada no resumo) |
| Contato | As superfícies se tocam, sem penetração maior que 0,1 mm | Não (é contada) |
| Sem conflito | Ausência de conflito confirmada | Não (é contada) |
| **Inconclusivo** | Métodos divergem, ou os dados não bastam (malha só de superfície, unidade sem suporte) | **Sim, marcado para verificação** |
| **Análise incompleta** | Limite de processamento atingido ou geometria inválida | **Sim, marcado para verificação** |

Uma análise interrompida nunca vira "sem conflito". Por exemplo: o teste R06a atinge o limite de pares em um contato e dá "incompleto", e o R06b atinge o limite de distância numa folga e dá "incompleto".

### 3.7 Parâmetros centralizados (`GEO`, em metros)

| Parâmetro | Valor | Uso |
|---|---|---|
| `EPS_LEN` | 0,001 mm | Zero numérico de comprimento (lado de um plano, coplanaridade) |
| `WELD` | 0,01 mm | Fusão de vértices na análise de topologia |
| `CONTACT` | 0,1 mm | Espessura até a qual a interferência é considerada contato. Também é a tolerância mínima efetiva quando a tolerância configurada é 0. |
| `PROBE_DEPTHS` | 0,5 e 0,1 mm | Recuo dos pontos de prova |
| `CONVEX_EPS` | 0,01 mm | Tolerância do teste de convexidade |
| `DEPTH_ABS` / `DEPTH_REL` | 0,25 mm / 1 % | Precisão alvo do raio no ramo-e-limite |
| `LIMITS` | BB_EVALS 8.000 · BB_REFINE 1.500 · VOL_EVALS 4.000 · TRI_PAIRS 2·10⁶ · DIST_PAIRS 2·10⁶ · PROBES 20.000 | Limites por par, configuráveis. Quando são atingidos, o resultado vira "incompleto". |

As tolerâncias de cada teste continuam vindo da matriz do manual. A folga arbitrária de +0,5 mm da v1 foi removida.

## 4. Testes executados

Comando: `node testes/geometria.test.js`. Resultado: **53 de 53 aprovados**. Cada cenário confere o estado, o valor dentro de uma faixa e, quando se aplica, se a espessura e o volume analíticos estão dentro dos intervalos calculados.

| Cenário exigido | Testes | Resultado obtido |
|---|---|---|
| 1. Cubos separados | C01 | Sem conflito |
| 2. Interseção parcial | C02a, C02b | 20,000 mm e V = 0,020 m³ (exatos); 30,000 mm (exato) |
| 3. Cubos coincidentes | C03 | 1000,000 mm, V = 1,000 m³ |
| 4. Cubo contido | C04, R18 | 200,000 mm, V = 0,008 m³ (inclusive com malha fina) |
| 5. Cubos tangentes | C05a–d (face, aresta, vértice, apoio parcial) | Contato, 0 mm |
| 6. Distância pequena | C06a–c | Folga de 5,000 mm; violada com folga exigida de 10 mm; atendida com 3 mm |
| 7. Tubo atravessando parede | C07a–c, R15 | 100,000 mm; 100,000 mm com 45°; 150,000 mm para Ø200; malha de 19.200 triângulos |
| 8. Tubulações próximas | C08a–e | Folga de 8,000 mm; cruzamento com 10,000 mm (confirmado com tol. 5, abaixo com tol. 20) |
| 9. Múltiplos componentes | C09a, C09b | Vão entre componentes sem conflito; 100 mm no 2º componente |
| 10. Coordenadas grandes | C10a–d | Mesmos valores em coordenadas UTM. Float64: erro de 2,5·10⁻⁵ mm; Float32 (v1): 357 mm |
| 11. Dimensões reduzidas | C11a–c | Fio Ø2 × chapa de 1 mm: 1,000 mm; sobreposição de 0,5 mm em cubos de 3 mm |
| 12. Degeneradas | C12a–c | Sem geometria válida: incompleto; degenerados ignorados; superfície sem volume: inconclusivo |
| Regressões | R01–R18 | Tubo diagonal afastado (bug relatado): sem conflito. Perfil I não convexo. Normais invertidas. Malha aberta. Limites. Rotação genérica. Orientação inconsistente: não conclui ausência. Classificação dentro/fora: 0 erros em 6.859 pontos. |

Comparativo `node testes/comparativo_v1.js` (21 cenários, mesmas geometrias):

| | v1 | v2 |
|---|---|---|
| Decisões corretas | 18/21 | **21/21** |
| Maior erro de penetração nos conflitos | 712 mm | **0 mm** |
| Erros dentro/fora com raios rasantes (49 pontos) | 19 | **0** |

Falhas da v1: a cena girada (732 mm em vez de 20 mm, e um contato de 3 mm acusado como conflito), a peça de malha fina contida (falso negativo) e a sobreposição de 0,5 mm (descartada pela folga de +0,5 mm).

**Teste no app** (navegador embutido, projeto de exemplo): foram 26 pares verificados em 34 ms (21 confirmados, 1 abaixo da tolerância, 4 contatos). Na revisão aparecem a espessura com o método ("cálculo exato, peças convexas"), o volume de interseção e a região. Também confirmei, já com o núcleo novo, o fluxo de validação, issue e BCF, além do visualizador e das propriedades no padrão Visus.

**Problemas encontrados durante a implementação** (todos corrigidos e cobertos por teste):

- Recorte errado da busca de folga: retornava distância infinita.
- Pontos de prova sobre faces alinhadas, em sobreposição de 0,5 mm.
- Face de fechamento duplicada no recorte convexo: volume em dobro.
- Gerador de teste com orientação inconsistente. Aqui o motor recusou concluir, que é o comportamento correto, e o caso virou o teste R14.

## 5. Limitações que permaneceram

1. **Tesselação do leitor IFC.** A medida é feita sobre a malha que o web-ifc gera. Um tubo Ø100 vira um polígono, e a espessura medida fica perto de 96 mm. É o valor correto para a malha, não para o círculo nominal.
2. **Pares não convexos.** A espessura é um intervalo garantido, mas pode ficar largo em sobreposições finas e extensas (lacuna sinalizada). O volume também sai como intervalo.
3. **Contenção sem cruzamento.** Os pontos de prova (4 por face, recuos de 0,5 e 0,1 mm) cobrem peças contidas e coincidentes. Uma sobreposição com faces perfeitamente alinhadas e menor que 0,1 mm, sem nenhum cruzamento, pode não ser detectada. Fica abaixo de `CONTACT`, então não muda a decisão.
4. **Malhas abertas ou com orientação inconsistente.** O resultado é marcado como aproximado. Se não há cruzamento e o ramo-e-limite não acha interior comum, o estado vira "sem conflito" com o aviso "contenção verificada de forma aproximada".
5. **Componentes sobrepostos dentro de um mesmo elemento.** As faces internas fazem a espessura ser subestimada (resultado conservador para a decisão de "abaixo"). Isso não está sinalizado ainda.
6. **Unidades.** A escala para milímetros ou centímetros continua por heurística (extensão > 1.000 unidades), agora registrada e exibida. Unidades por conversão (pés e polegadas) marcam os resultados como inconclusivos em vez de converter.
7. **Desempenho.** Ainda não há índice espacial. Um par não convexo com sobreposição custa de 17 a 31 ms, e uma malha fina com orientação inconsistente chegou a 11 s (R14). A análise roda na thread principal e pode travar a tela em modelos grandes de estrutura metálica.
8. **Booleanas do leitor.** Aberturas em paredes dependem do web-ifc. Se a subtração falhar, a parede fica maciça e o tubo que passa pela abertura vira conflito.

## 6. Impacto nas funcionalidades existentes

Importação IFC, visualização 3D, seleção, GUIDs, propriedades no padrão Visus, regras, pré-classificação, revisão, issues, histórico e prévia do BCF foram preservados e conferidos no app. O que muda para o usuário:

- **Valores de penetração:** os números ficam diferentes dos da v1 em geometria girada e em peças contidas. Agora são os corretos.
- **Novos itens para verificar:** aparecem clashes marcados como "Inconclusivo" ou "Análise incompleta", que antes seriam omitidos.
- **Interferências pequenas:** interferências até 0,5 mm acima da tolerância, antes descartadas, agora são reportadas.

As decisões já salvas no navegador continuam valendo: a chave de armazenamento e a chave de decisão por GUID não mudaram. O ponto de atenção é o desempenho em modelos metálicos grandes.

## 7. Pendências para a Fase 02

1. **BVH por elemento**, para as funções `trianglesInBox`, `unsignedDistance`, `windingNumber` (versão rápida de Barill et al., 2018), `contactSearch` e `minDistance`. As assinaturas já estão isoladas para essa troca.
2. **Índice espacial entre elementos** no lugar da varredura por x em `runAnalysis()`.
3. **Decomposição convexa** (por exemplo, perfil I = 3 caixas), para levar espessura e volume exatos às peças não convexas.
4. **Web Worker** para a análise, com progresso e cancelamento.
5. **Teste de integração com IFCs reais** (incluindo o modelo de estrutura metálica) e medição de tempo por disciplina.
6. Sinalizar componentes sobrepostos dentro de um mesmo elemento (limitação 5).
7. Converter unidades por conversão (pés e polegadas) em vez de só marcar como inconclusivo.
