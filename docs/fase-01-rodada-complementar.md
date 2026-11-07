# COORDIX · Fase 01: rodada complementar de correções e validação

**Relatório técnico, 07/11/2026**

**Resultado:** 101 de 101 cenários aprovados. São os 53 anteriores, mais 48 novos: 46 obrigatórios desta rodada e 2 regressões (T11 e U13) que surgiram durante a implementação. O comparativo com a v1 continua em 21 de 21 decisões corretas. O app foi verificado no navegador, de ponta a ponta, com o projeto de exemplo.

**Diretriz seguida:** a regra desta rodada foi ser conservador quando falta base geométrica, sem matar a utilidade do detector. Em malhas que não são sólidos válidos, as duas operações que continuam matematicamente válidas são usadas para **confirmar conflitos e provar ausências**:

- o cruzamento entre superfícies;
- a distância exata entre superfícies.

Inconclusivo fica reservado aos casos em que essas evidências não bastam.

## 1. Pendências, causas e correções

### 1.1 Malhas não manifold (`coordix-geometria.js`: `prepareMesh`, `evaluatePair`, `convexInfo`)

- **Pendência:** malhas com topologia inválida podiam ser tratadas como sólidos.
- **Causa:** `evaluatePair` exigia só `closed` e `oriented`. E `closed` aceitava qualquer número par de faces por aresta, inclusive 4. Não havia verificação de vértice não manifold, de componentes nem da orientação de cada componente.
- **Correção:** `prepareMesh` passou a classificar a malha em `solido_valido`, `aberta`, `invalida` ou `superficie`. Para isso, conta:
  - arestas de borda;
  - arestas com mais de 2 faces;
  - arestas percorridas no mesmo sentido por 2 faces;
  - vértices cujas faces formam mais de um leque.

  Além disso, encontra os componentes conexos e verifica a orientação de cada um. Uma casca interna invertida é aceita como **vazio**; um componente separado invertido é inválido. A fusão de vértices agora procura nas 27 células vizinhas, para não criar bordas falsas na fronteira de célula.

  Número de voltas, distância com sinal, pontos de prova, programação linear e volume **só são usados com `solido_valido`**.
- **Testes:** T01–T11.

### 1.2 Falhas geométricas por elemento (`index.html`: `buildGeometry`; núcleo: `readElementGeometries`)

- **Pendência:** a falha de uma representação era contada só no modelo, e o elemento seguia como se estivesse completo.
- **Causa:** o `try/catch` envolvia cada geometria isolada, sem registro por elemento. O `g.delete()` só rodava no caminho de sucesso, e elementos sem nenhuma malha sumiam sem aviso.
- **Correção:**
  - `readElementGeometries` lê cada representação e registra a etapa e o motivo de cada falha (`geometria`, `vertices`, `indices`, `validacao`, `transformacao`). Também valida vértices finitos e índices inteiros dentro do intervalo, e **libera o recurso no `finally`**.
  - Cada elemento recebe `geoIntegrity`: `completa`, `parcial` ou `nao_processada`, com a lista de falhas (expressID da geometria, etapa e motivo).
  - Produtos que têm representação mas para os quais o leitor não gerou malha também são listados.
  - Todos aparecem por **GUID** em "Elementos com falha de geometria", no resumo da análise.
  - Malha de elemento parcial recebe `incomplete: true`. Com isso, nenhuma ausência de conflito (sem conflito, contato ou abaixo da tolerância) é confirmada para ela: o resultado vira inconclusivo. Conflitos com evidência continuam confirmados, com o aviso "representação completa não validada".
- **Testes:** I01–I05, K04–K06.

### 1.3 Malhas abertas (`evaluatePair`, `containmentPossible`, `parityInside`)

- **Pendência:** uma malha aberta podia terminar em "sem conflito", com apenas um aviso de verificação aproximada.
- **Correção:** criei um fluxo próprio para elementos que não são sólidos válidos. Ele usa só o que continua válido para eles:
  - **Cruzamento transversal de superfícies:** é evidência direta de interferência. Se a espessura estimada passar da tolerância, o resultado é **confirmado (estimado)**. Se não, é **inconclusivo** ("as superfícies se cruzam, mas a espessura não pode ser medida com segurança").
  - **Sem cruzamento:** cada componente de uma superfície fica inteiro dentro ou fora da outra peça. A ausência só é aceita quando:
    1. nenhum componente cabe dentro da caixa do outro elemento;
    2. nenhum furo da malha (caixa dos laços de borda) toca a outra peça.

    Isso cobre o caso de um tubo que entra pelo furo da malha sem cruzar nenhuma face. Fora dessas condições, há uma estimativa (contenção estimada) ou o resultado é inconclusivo.
  - **Estimativa:** usa o número de voltas em malhas abertas e a **paridade de 3 raios** em malhas fechadas inválidas (a paridade não depende da orientação das faces). A estimativa é aceita só se, no ponto que define a espessura, o valor for ≥ 0,75 nos dois elementos. Malha inválida e aberta não gera estimativa.
  - **Folga:** cruzamento ou distância exata menor que a folga confirmam a violação. A folga atendida exige a mesma prova de separação.
  - Volume e intervalo não são exibidos quando a espessura é estimada.
- **Testes:** K01a–c, K02a–b, K03a–b, K07, T10.

### 1.4 Unidades (`resolveLengthUnit`, `unitScaleFor`, `detectReaderConversion`, `checkScalePlausibility`; app: `indexModel`, `buildGeometry`)

- **Pendência:** a heurística de extensão tratava um modelo em mm com extensão de 500 como se estivesse em metros.
- **Causas encontradas** (mais graves que a pendência original):
  1. A unidade era lida de qualquer `IfcSIUnit` do arquivo, e não da atribuição do projeto.
  2. **No web-ifc 0.0.39, os atributos de `IfcSIUnit` chegam deslocados** (`UnitType` vazio, `Prefix` = "LENGTHUNIT", `Name` = "MILLI"). O código antigo nunca leu o prefixo e sempre usou escala 1.
  3. **O web-ifc 0.0.39 já converte a geometria para metros.** Por isso os resultados estavam certos por coincidência. Minha primeira correção nesta rodada partia da premissa contrária e teria causado conversão dupla. Foi o teste de integração no navegador que revelou o problema, antes do envio.
- **Correção:**
  - A unidade passa a ser lida de `IfcProject.UnitsInContext`, identificando tipo, prefixo e nome pelo **valor** e não pela posição. Suporta prefixos SI (incluindo MILLI, CENTI, DECI e KILO, além do metro sem prefixo) e unidades por conversão (pé, polegada) via `IfcMeasureWithUnit`. Os estados são `declarada`, `ausente`, `nao_suportada` e `ambigua`.
  - Para saber se o leitor converteu, a extensão bruta é comparada com a **maior profundidade de extrusão declarada no próprio arquivo** (`IfcExtrudedAreaSolid.Depth`): sem conversão, o modelo não pode ser menor que a sua maior extrusão. Sem extrusões, vale o comportamento verificado da versão fixada, com aviso.
  - Uma verificação de plausibilidade após a escala (modelo menor que 10 cm ou maior que 20 km) sinaliza conversão dupla.
  - Unidade ausente, não suportada, ambígua ou suspeita marca **todos** os pares do modelo como inconclusivos, porque a escala é desconhecida. A cota dos pavimentos usa a escala declarada.
  - A tela de modelos mostra "Unidade: milímetro (declarada)".
- **Testes:** U01–U13 (U11: modelo pequeno em mm; U12: conversão dupla; U13: quem converte).

### 1.5 Convergência do simplex (`chebyshev`)

- **Pendência:** ao atingir 5.000 iterações, a função retornava os valores parciais.
- **Causa:** não havia estado de retorno, e `Math.max(0, b)` mascarava pontos iniciais inviáveis.
- **Correção:**
  - Troquei a variável do raio por r = r′ + m₀, com m₀ = menor folga no ponto inicial. Assim, a base inicial é viável para qualquer ponto de partida, sem precisar de Fase I.
  - As restrições são normalizadas pelo comprimento característico, para que a tolerância numérica não dependa da escala da peça.
  - O resultado passa por uma **verificação independente**: o raio é recalculado diretamente nos planos e o resíduo precisa ficar ≤ 10⁻⁹ × comprimento característico.
  - Estados: `otimo`, `inviavel`, `ilimitado`, `limite_iteracoes` e `falha_numerica`. Nos dois últimos, `r` e `x` não são devolvidos.
  - O limite de iterações agora é configurável (`LIMITS.SIMPLEX_ITER`) e não foi aumentado.
  - Quando o simplex não dá resultado ótimo, `evaluatePair` registra `simplex_<estado>` e recorre ao ramo-e-limite.
- **Testes:** S01–S07 (S06: caixas de 2 km em coordenadas UTM, resíduo de 1,1·10⁻¹³ m).

### 1.6 Garantias dos limites de espessura (`depthBound`, `evaluatePair`, `selfOverlap`)

| Limite | Garantido quando | Caso contrário |
|---|---|---|
| Inferior (lb) | Os dois elementos são sólidos válidos e a classificação dentro/fora não é ambígua em nenhum ponto avaliado (lb é um valor efetivamente atingido de f = min(sd_A, sd_B)). Continua válido mesmo com componentes sobrepostos, porque as faces internas só diminuem f. | "estimado" |
| Superior (ub) | Todas as condições do lb **e** f 1-Lipschitz. Isso falha quando um elemento tem componentes sobrepostos, porque as faces internas reduzem a distância calculada (`selfOverlap`, que usa cruzamento e pontos de prova). | "não garantido": o valor não é exibido. "Abaixo da tolerância" vira **inconclusivo**. |
| Programação linear (convexos) | Estado `otimo` e verificação de resíduo aprovada | Recorre ao ramo-e-limite |

O resultado traz `metricQuality` (`garantida`, `estimada` ou `indisponivel`) e `bounds`. A interface mostra "Confiabilidade da espessura", não exibe intervalos nem volumes sem garantia e usa o termo **"Espessura de interferência"**. As regras do manual e a tela de regras deixaram de falar em "penetração".

### 1.7 Propagação até a interface e o histórico (`runAnalysis`, interface, BCF)

- **Deduplicação:** antes, o primeiro teste da matriz que listava um par impedia que os testes seguintes o avaliassem. Agora o par é avaliado em todos os testes aplicáveis e mantém o resultado mais relevante: um confirmado prevalece sobre um inconclusivo, e um inconclusivo **nunca** é trocado por uma ausência. Os demais resultados ficam em "Outros testes".
- **Unidade não confirmada:** antes, só não confirmados viravam inconclusivos. Agora vale para todos os pares do modelo.
- **Resumo da análise:** contagem por estado e por topologia, elementos parciais ou não processados com GUID, e **histórico das análises** (as últimas 20, salvas no projeto).
- **Card de revisão:** confiabilidade da espessura, base da análise (sólidos ou superfícies), integridade de A e B e outros testes.
- **Propriedades do elemento:** "Integridade geométrica" e "Topologia da malha".
- **BCF:** a descrição informa o estado geométrico quando ele não é um conflito confirmado com medida garantida.

## 2. Testes

Comando: `node testes/geometria.test.js`. Resultado: **101 de 101 aprovados**.

| Grupo | Testes | Resultado |
|---|---|---|
| Anteriores | 53 | 53 aprovados (2 com expectativa revisada, ver abaixo) |
| Topologia | T01–T11 | fechada e manifold · aberta · aresta com 3 faces · orientação inconsistente · componentes desconectados · vértice não manifold · vazio interno válido · componente invertido inválido · fusão na fronteira de célula · não manifold não usada como sólido · componentes sobrepostos coplanares |
| Integridade | I01–I05, K04–K06 | 3 geometrias com 1 falha (parcial, recursos 2/2 liberados) · todas inválidas · falha de índices (recurso liberado 3/3) · índice fora do intervalo · GUID com geometria parcial · incompleta com ausência aparente → inconclusivo · incompleta com conflito → confirmado com aviso · folga atendida não confirmada |
| Unidades | U01–U13 | m · mm · cm · dm · km · ausente · prefixo desconhecido · pé · fator inválido · conflitantes · modelo pequeno em mm (escala 0,001) · conversão dupla sinalizada · verificação de quem converte |
| Simplex | S01–S07 | ótimo · inviável · limite de iterações (sem r) · falha numérica · 1 mm · 2 km em coordenadas UTM · fallback para o ramo-e-limite |
| Classificação | K01a–c, K02a–b, K03a–b, K07–K08 | aberta separada → sem conflito (separação provada) · aberta com peça contida → confirmado estimado · tubo pelo furo → não vira ausência · cruzamento com espessura alta → confirmado estimado · cruzamento raso → inconclusivo · não manifold com contenção possível → inconclusivo · não manifold separada → sem conflito · folga violada em malha aberta → confirmado |

**Testes anteriores com expectativa revisada** (mudança de regra documentada, não ajuste para passar):

- **C12c:** o estado continua "inconclusivo", mas o aviso foi renomeado de `profundidade_indeterminada` para `intersecao_de_superficies` + `intersecao_sem_medida_confiavel`.
- **R11:** testava a heurística por extensão que esta rodada manda eliminar. Agora verifica a escala pela unidade declarada.

**Cenários e parâmetros corrigidos durante a rodada:**

- **T10:** o cubo B tinha as faces laterais exatamente alinhadas às de A, e por isso não havia cruzamento transversal (a evidência que o teste pretendia exercitar). A expectativa não mudou.
- **U12:** o mínimo de plausibilidade passou de 1 cm para 10 cm, para que uma conversão dupla em modelos até cerca de 100 m seja detectada.

**Defeitos encontrados durante a rodada:**

- Triângulo colapsado após a fusão de vértices contando arestas, o que tornava não manifold um cubo com triângulos degenerados (C12b).
- Critério de ambiguidade rígido demais na estimativa: "algum ponto ambíguo" passou a ser "ambíguo no ponto que define a espessura" (R05).
- `selfOverlap` cego a componentes com faces coplanares (T11).
- Leitura deslocada das unidades e premissa errada de conversão: o problema mais grave, encontrado no teste de integração.

**Comparativo** (`node testes/comparativo_v1.js`): v1 com 18 de 21 decisões corretas e v2 com 21 de 21. O maior erro de espessura foi de 712 mm na v1 e de 0 mm na v2.

**Teste no app** (navegador embutido, projeto de exemplo):

- Unidade "milímetro (declarada)" em todos os modelos, sem conversão dupla: os mesmos 95,9 mm de antes.
- 26 pares verificados: 21 confirmados, 1 abaixo da tolerância, 4 contatos. Os 29 elementos analisados são sólidos válidos.
- O histórico de análises é gravado, e o card de revisão mostra confiabilidade e integridade.

## 3. Limitações remanescentes

1. **Junções T.** Malhas com junções T, comuns em booleanas, aparecem como "abertas" porque a topologia não fecha, mesmo sendo geometricamente estanques. Elas seguem o fluxo de superfícies: conflitos são confirmados como estimados, e só a separação provada vira ausência. Não foram testadas com IFCs reais.
2. **Conversão dupla por extensão.** Só é detectável em modelos menores que cerca de 100 m (após a escala). A defesa principal é a comparação com a maior extrusão, que exige que o arquivo tenha `IfcExtrudedAreaSolid`.
3. **Estimativa em malhas abertas.** O limiar de 0,75 no número de voltas é empírico. Uma malha com furo muito grande perto da região de interseção pode ficar inconclusiva.
4. **Elementos sem malha** (`nao_processada`) não têm caixa nem posição. Ficam fora dos pares e são listados por GUID, mas não é possível saber com quais peças eles conflitariam.
5. **Custo.** `prepareMesh` ficou mais caro (234 ms para 19.200 triângulos) por causa da fusão com vizinhança e da análise de leques. Para elementos comuns, com até algumas centenas de triângulos, o custo é desprezível.
6. **Paridade de raios.** Usa 3 direções fixas. Um raio rasante a uma aresta pode errar um voto; a exigência de 3 de 3 votos torna a estimativa conservadora.

## 4. Funcionalidades preservadas

Foram conferidas no app, depois das correções: importação IFC, visualização 3D, seleção, GUIDs, propriedades no padrão Visus, regras, filtros, pré-classificação, clashes por nível, revisão (com validação e geração de issue), issues, histórico e prévia do BCF. Não houve mudança visual fora dos campos de confiabilidade e integridade. A chave de armazenamento das decisões não mudou.

## 5. Pendências para a Fase 02

- BVH para `prepareMesh`, `windingNumber`, `parityInside`, `unsignedDistance`, `contactSearch` e `minDistance`.
- Fechamento geométrico tolerante a junções T.
- Decomposição convexa.
- Web Worker para a análise.
- Teste com os IFCs reais do projeto, em especial o de estrutura metálica.
