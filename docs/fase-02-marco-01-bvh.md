# COORDIX · Fase 02 · Marco 1: BVH por elemento

**Escopo:** índice espacial (BVH) dentro de cada malha, usado pelas consultas geométricas do núcleo. Os Marcos 2 a 5 ficaram de fora: índice entre elementos, Web Worker, decomposição convexa e junções em T.
**Base:** commit `b9e4e4e` (fim da Fase 01). O núcleo linear dessa versão foi congelado em `testes/legado_fase01.js` e serve só como referência para os testes e as medições.

## 1. Resumo

- Cada malha ganha uma BVH construída **uma única vez** e guardada em `mesh._bvh`. Ela referencia os triângulos por índice e não copia a geometria.
- As seis consultas (`trianglesInBox`, `unsignedDistance`, `windingNumber`, `parityInside`, `contactSearch`, `minDistance`) usam a BVH sem mudar assinaturas, critérios nem tolerâncias.
- **Nenhum estado, valor, limite, volume, qualidade ou sinalização mudou.** Isso foi verificado nos 101 cenários da Fase 01, em 32 pares dirigidos, em 120 cenas aleatórias e consulta a consulta contra o núcleo linear.
- A única diferença observada é de arredondamento num campo de diagnóstico, `stats.windingAtBest`: em sólidos válidos ele agora vale exatamente `1` em vez de `0,9999999999999981`. A diferença máxima é 1,9 × 10⁻¹⁵ e não afeta nenhuma decisão. Veja a seção 4.3.
- Medido nesta máquina: consultas em malhas de 43 200 triângulos ficaram de 260× a 4 000× mais rápidas. A suíte de 101 cenários caiu de cerca de 1,3 s para 0,7 s. Os pares em que o custo dominante não é a busca (método convexo exato, preparação da malha) não melhoraram, e isso está registrado na seção 6.

## 2. Arquivos

| Arquivo | Alteração |
|---|---|
| `coordix-geometria.js` | Seção nova "BVH por malha": `buildBVH`, `bvhOf`, contadores `PERF`. As seis consultas foram reescritas. Novas funções `windingSum`, `rayParity` e `rayHitRobust`. Novos parâmetros em `GEO.BVH`. |
| `testes/bvh.test.js` | Novo: 81 testes de estrutura, equivalência e casos dirigidos. |
| `testes/desempenho_bvh.js` | Novo: medição da construção, das consultas isoladas e dos pares completos. |
| `testes/legado_fase01.js` | Novo: cópia congelada do núcleo da Fase 01, usada como referência. |
| `testes/geometria.test.js` | Variáveis de ambiente para forçar a BVH (`COORDIX_BVH_MIN`, `COORDIX_BVH_METHOD`, `COORDIX_BVH_LAZY`) e rodar a mesma suíte no núcleo antigo (`COORDIX_NUCLEO=legado`). Nenhum cenário foi alterado. |
| `index.html` | Sem alteração. O app já guarda a malha preparada por elemento (`el._solid`), então a BVH é construída uma vez por elemento na sessão. |

## 3. Arquitetura

### 3.1 Estrutura

Arranjos tipados planos, sem objetos por nó:

```
boxes  Float64Array(6·nós)   caixa de cada nó (Float64, como o resto da análise)
left, right  Int32Array      filhos (−1 = folha)
start, count Uint32Array     faixa de perm ocupada pela folha
perm   Uint32Array(n)        permutação dos índices de triângulo (não duplica a geometria)
```

A memória medida fica entre 36 e 53 bytes por triângulo (seção 6.1).

### 3.2 Construção

Os triângulos são divididos pelo eixo de maior extensão dos centroides. O ponto de corte depende de `METHOD`:

- `"mediana"` (**padrão**): quickselect na mediana dos centroides. A árvore sai balanceada.
- `"sah"`: heurística de área superficial com `SAH_BINS` compartimentos. Se a SAH não achar corte útil, usa a mediana.

Parâmetros em `GEO.BVH`:

| Parâmetro | Padrão | Significado |
|---|---|---|
| `LEAF_SIZE` | 4 | triângulos por folha (máximo) |
| `MAX_DEPTH` | 48 | profundidade máxima |
| `METHOD` | `"mediana"` | `"mediana"` ou `"sah"` |
| `SAH_BINS` | 12 | compartimentos da SAH |
| `MIN_TRIS` | 32 | abaixo disso as consultas continuam lineares |
| `LAZY_SCANS` | 4 | consultas lineares feitas por malha antes de construir a BVH |

`LAZY_SCANS` resolve um problema que apareceu nas medições: em pares baratos, como um tubo longe de uma laje, a construção custava mais do que todas as consultas juntas. Agora a malha é varrida linearmente nas primeiras 4 consultas e só depois a BVH é construída. Como as duas implementações dão o mesmo resultado, isso só muda o tempo.

Folhas com mais de `LEAF_SIZE` triângulos só aparecem quando todos os centroides coincidem ou quando a profundidade máxima é atingida. O teste de estrutura verifica isso.

### 3.3 Consultas

| Consulta | Estratégia | Por que o resultado é o mesmo |
|---|---|---|
| `trianglesInBox` | Percorre a árvore, testa as caixas das folhas e **ordena os índices em ordem crescente** | Usa o mesmo teste inclusivo de sobreposição. Um nó só é descartado se a caixa dele, que contém a de todos os seus triângulos, não toca a consulta. A ordem final é a da varredura linear. |
| `unsignedDistance` | Visita primeiro o nó mais próximo e poda por `dist²(caixa) ≥ melhor` | A distância à caixa é um limite inferior da distância a qualquer triângulo dentro dela. A poda só descarta o que não pode melhorar o mínimo, então o mínimo é o mesmo. |
| `parityInside` | Raio com teste de lajes nas caixas, ampliadas por 10⁻⁹ relativo | Os triângulos testados são um superconjunto dos atingíveis, e o teste de cruzamento (`rayHit`) é o mesmo. A contagem é idêntica. |
| `windingNumber` | Sólido válido: paridade exata de raios pela BVH, com detecção de degeneração e recurso à soma completa. Demais malhas: soma completa | Ver 3.4 |
| `contactSearch` | Para cada triângulo i de A, em ordem crescente, a BVH de B devolve os j cuja caixa toca a de i (+`EPS_LEN`). Eles são ordenados e testados | Os j fora dessa lista seriam rejeitados por `triBoxesOverlap` na varredura linear. A sequência de testes é a mesma, logo o primeiro cruzamento ou contato e o ponto são os mesmos. Ver 3.5 |
| `minDistance` | Para cada i em ordem, a BVH de B devolve os j com `dist²(caixas) < melhor atual`. Eles são ordenados e testados com a mesma poda | `melhor` só diminui. Um j fora da lista tem distância de caixa ≥ melhor, e a varredura linear também o pularia. A sequência de valores de `melhor`, a parada antecipada (`stopAt`) e o resultado são os mesmos. |

### 3.4 Número de voltas (sem aproximação)

O brief pedia que o número de voltas não fosse calculado só com os triângulos próximos. Por isso **não há aproximação hierárquica** (do tipo Barnes–Hut). A estratégia é exata:

- Num **sólido válido** (fechado, 2-manifold, orientação consistente), o número de voltas generalizado vale exatamente 0 ou 1. Ele coincide com a paridade de cruzamentos de qualquer raio que não passe por aresta, vértice ou plano de face. A paridade é calculada pela BVH, e só os triângulos das folhas atravessadas são testados.
- `rayHitRobust` devolve "degenerado" quando o raio passa a menos de 10⁻⁹ (em coordenada baricêntrica) de uma aresta ou vértice, quando é quase paralelo a uma face no mesmo plano, ou quando o ponto está praticamente sobre a face (t ≈ 0). Nesses casos usa o próximo dos 3 raios. Se os três forem degenerados, usa a **soma completa dos ângulos sólidos**, a mesma da Fase 01.
- **Malhas abertas, inválidas, sub-malhas e malhas pequenas** continuam usando a soma completa (ou a paridade com 3 raios, no caso das fechadas inválidas). Nessas malhas o valor fracionário do número de voltas tem significado, e por isso ele não é aproximado.

### 3.5 Orçamento de pares (`limit`)

Na Fase 01, `contactSearch` e `minDistance` contam pares **virtuais**: todas as combinações ia × ib na ordem de iteração, testadas ou não. O corte por orçamento acontece nessa contagem. A nova versão calcula o índice virtual de cada par testado como `linha·|ib| + posição(j em ib) + 1`, com busca binária. Assim ela reproduz exatamente quando o corte acontece, o valor de `pairs` e o que já tinha sido encontrado até ali. O teste roda com `limit` = 1, 3, 7, 100, 500, 5 000 e 2 × 10⁶. Um campo novo, `tested`, informa quantos pares foram de fato testados.

## 4. Testes

### 4.1 Suíte da Fase 01 (101 cenários, unitários e sintéticos)

| Execução | Resultado | Diferenças em relação à Fase 01 |
|---|---|---|
| Núcleo da Fase 01 (`b9e4e4e`) | 101/101 | (referência) |
| Novo núcleo, padrão (malhas < 32 triângulos lineares, construção adiada) | 101/101 | 0, fora `windingAtBest` |
| BVH forçada em todas as malhas, SAH, imediata | 101/101 | 0, fora `windingAtBest` |
| BVH forçada, mediana, imediata | 101/101 | 0, fora `windingAtBest` |
| BVH forçada, mediana, adiada | 101/101 | 0, fora `windingAtBest` |

O comparativo com a v1 (`testes/comparativo_v1.js`) não mudou: 0 erros na grade 21³ e 0 erros nos raios rasantes.

### 4.2 Testes da BVH (`testes/bvh.test.js`, 81 testes, todos aprovados)

Cada grupo roda com SAH e com mediana, com a BVH forçada.

- **Estrutura (5 malhas):** `perm` é uma permutação, toda caixa de filho está dentro da do pai, todo triângulo está dentro da caixa da sua folha, a profundidade respeita o máximo, a BVH é construída uma única vez e não guarda cópia da geometria.
- **Consultas (16 malhas):**
  - Malhas: cubo (12 triângulos), cilindros com 8 e 256 lados, perfil I, caixas subdivididas com 4 800 e **43 200** triângulos, malha **aberta**, orientação **inconsistente**, **não manifold** (duas caixas com face comum), malha **com degenerados**, malha **só com degenerados**, placa sem volume, faces **coplanares**, peças a **1 µm**, coordenadas **UTM** (7,4 × 10⁶ m).
  - Consultas: 63 caixas (vazias, de 1, de poucos e de milhares de triângulos, e caixa degenerada num vértice) e cerca de 140 pontos (aleatórios, sobre vértices, centroides e a 10⁻⁷ m da superfície).
  - Comparação com o núcleo linear: `trianglesInBox` e `unsignedDistance` **idênticos bit a bit**; `parityInside` idêntico; `windingNumber` idêntico nas malhas não sólidas e com a mesma classificação nos sólidos (|Δ| máx 5,5 × 10⁻¹³); `signedDistance` idêntico.
- **Pares (16):** cruzamento, faces coplanares, peças a 1 µm, malha aberta, inconsistente, não manifold, degenerados, placa e UTM. `contactSearch` foi testado com 5 orçamentos e `minDistance` com 30 combinações de alcance, orçamento e parada. `evaluatePair` foi testado com 3 regras (rígida 0 mm, rígida 10 mm, folga 50 mm). Todos os resultados são idênticos ao núcleo linear.
- **Cenas aleatórias:** 60 por método (caixa subdividida × tubo, 30% em UTM). `evaluatePair` é idêntico em todas.
- **Casos dirigidos:**
  - consulta que devolve exatamente 1 triângulo;
  - `LEAF_SIZE` (1, 16, 64), `MAX_DEPTH` (0, 2) e `SAH_BINS` (2) configuráveis sem alterar resultados;
  - raio exatamente sobre um vértice detectado como degenerado, com classificação correta;
  - BVH só acima de `MIN_TRIS` e construída uma vez;
  - construção adiada: 4 consultas lineares, depois a BVH, com valores iguais.

### 4.3 A única diferença: `windingAtBest`

Esse campo das estatísticas guarda o número de voltas no ponto de melhor estimativa. É usado na decisão com o limiar 0,75 e aparece no diagnóstico. Em sólidos válidos, a soma de ângulos da Fase 01 dava 1 com erro de arredondamento (por exemplo 0,9999999999999981). A paridade dá exatamente 1. Nos 101 cenários a diferença máxima foi de 1,9 × 10⁻¹⁵ (nos cenários R05, K01b, K01c e K02a), e nenhum estado ou decisão mudou.

### 4.4 Integração e IFC reais

- **Integração no app:** o `index.html` não mudou e chama as mesmas funções públicas. O núcleo novo foi publicado no artefato do COORDIX (versão 12).
- **Verificação visual pendente:** desta vez não consegui conferir o projeto de exemplo no painel do navegador, porque a janela do Claude estava minimizada e a página não renderizou (tempo esgotado na captura de tela). O contêiner também não tem acesso à CDN do three.js e do web-ifc, o que impede um teste sem tela.
- **IFC reais:** não houve teste com IFC reais neste marco.

Como os resultados geométricos são idênticos, o esperado no exemplo é o mesmo da Fase 01: 21 confirmados, 1 abaixo da tolerância e 4 contatos. Isso ainda precisa ser conferido.

## 5. Decisões

1. **Mediana como padrão.** A SAH examina um pouco menos triângulos em distância (4 contra 6 por consulta na malha de 43 200), mas constrói cerca de 3× mais devagar (72 ms contra 23 ms). Nos pares completos a mediana empatou ou ganhou. A SAH continua disponível em `GEO.BVH.METHOD`.
2. **Ordem e orçamento preservados de forma exata**, e não apenas o conjunto de resultados. O primeiro ponto de contato, a parada antecipada e o corte por orçamento dependem da ordem dos testes. Preservar só o conjunto mudaria `point`, `pairs` e, em casos-limite, o estado.
3. **Malhas pequenas continuam lineares** (`MIN_TRIS` = 32). Com 12 triângulos, percorrer a árvore custa mais do que varrer tudo.
4. **Construção adiada** (`LAZY_SCANS` = 4), pelo motivo descrito na seção 3.2.
5. **Nenhuma dependência externa.**

## 6. Desempenho

Ambiente: Node v22.23.4, Intel Xeon @ 2,10 GHz, Linux x64, contêiner compartilhado. Cada tempo é a mediana de 5 repetições. Entre execuções diferentes, os tempos variaram até ±50% nesta máquina, então as razões de 10× para cima são confiáveis e as próximas de 1× não. Para reproduzir: `node testes/desempenho_bvh.js`.

### 6.1 Construção

| Malha | Triângulos | SAH (ms) | Mediana (ms) | Memória SAH / mediana |
|---|---:|---:|---:|---:|
| cilindro 256 lados | 1 024 | 9,8 | 3,0 | 40 / 36 KiB |
| caixa subdividida 20 | 4 800 | 6,6 | 2,1 | 175 / 235 KiB |
| caixa subdividida 60 | 43 200 | 72 | 23 | 1,5 / 2,2 MiB |
| caixa subdividida 100 | 120 000 | 179 | 59 | 4,2 / 4,5 MiB |

### 6.2 Consultas isoladas

Lotes de 400 consultas, ou 100 para dentro/fora.

| Malha | Consulta | Linear (ms) | BVH mediana (ms) | Ganho | Triângulos examinados: linear → BVH |
|---|---|---:|---:|---:|---|
| cilindro 256 (1 024) | trianglesInBox | 0,81 | 0,36 | 2,3× | 1 024 → 10 |
| cilindro 256 (1 024) | unsignedDistance | 7,4 | 7,2 | 1,0× | ≤ 1 024 → 453 |
| cilindro 256 (1 024) | windingNumber | 14,4 | 0,64 | 22× | 1 024 → 22 |
| caixa sub. 60 (43 200) | trianglesInBox | 31,9 | 0,05 | ≈ 600× | 43 200 → 1 |
| caixa sub. 60 (43 200) | unsignedDistance | 131 | 0,69 | ≈ 190× | ≤ 43 200 → 6 |
| caixa sub. 60 (43 200) | windingNumber | 437 | 0,13 | ≈ 3 400× | 43 200 → 4 |
| caixa sub. 60 inconsistente | parityInside | 115 | 0,39 | ≈ 290× | 129 600 → 13 |

### 6.3 Pares completos (`evaluatePair`)

"Padrão" é mediana com construção adiada; a 1ª avaliação inclui a construção da BVH.

| Par | Triângulos | Preparação da malha (ms) | Linear (ms) | Padrão 1ª / 2ª (ms) | Estado | Idêntico |
|---|---|---:|---:|---:|---|---|
| tubo atravessando parede fina | 10 800 × 256 | 100 | 66 | 17 / 16 | confirmado | sim |
| tubo a 30 mm da laje (folga 50 mm) | 19 200 × 1 024 | 197 | 1,6 | 0,95 / 0,83 | confirmado | sim |
| tubo longe da laje | 19 200 × 1 024 | 185 | 0,03 | 0,04 / 0,00 | sem conflito | sim |
| viga I × pilar subdividido | 7 500 × 44 | 76 | **5 002** | **42 / 35** | confirmado | sim |
| tubo em parede de 43 200 triângulos (UTM) | 43 200 × 512 | 698 | 161 | 155 / 139 | confirmado | sim |

**Suíte da Fase 01** (101 cenários, soma dos tempos, 3 execuções): antes 1 329, 1 391 e 1 248 ms; depois 775, 755 e 690 ms. O maior ganho foi no R14 (595 → 85 ms).

### 6.4 Interpretação

- O ganho aparece onde a busca era o gargalo: ramo-e-limite e estimativas em peças não convexas, como viga I × pilar (119×), e consultas em malhas finas.
- Em **pares de peças convexas**, como tubo × parede, o método exato (centro de Chebyshev, simplex) domina o tempo e não depende da BVH. Esse é o tema do Marco 4.
- A **preparação da malha** (`prepareMesh`: solda de vértices e topologia) chega a 700 ms em 43 200 triângulos. Ela custa mais do que a análise do par e não fazia parte deste marco. Fica registrada como próximo gargalo.
- Em `unsignedDistance` no cilindro de 256 lados, a BVH não ajuda (1,0×). Os triângulos laterais são longos e finos, ocupam o comprimento inteiro do tubo, e as caixas deles se sobrepõem.

## 7. Limitações

- A BVH é construída sobre as caixas dos triângulos. Triângulos longos e finos (laterais de tubos, tampas em leque) reduzem a poda.
- A BVH só fica em memória: não é serializada e é reconstruída a cada sessão ou leitura do IFC.
- O índice entre elementos continua sendo a varredura por x de `runAnalysis`. Ele é o Marco 2 e não foi tocado.
- A análise continua na linha principal do navegador. Isso é o Marco 3.

## 8. Riscos

- **Mudança futura na geometria de uma malha já preparada:** a BVH ficaria desatualizada. Hoje nenhum código altera `tris` ou `tb` depois de `prepareMesh`. Quem fizer isso deve apagar `mesh._bvh`.
- **Números de voltas de sólidos válidos agora são 0/1 exatos.** Se no futuro algum código depender do valor fracionário num sólido válido, precisa chamar `windingSum`.
- **Contadores `PERF` globais:** são só diagnóstico e não entram em nenhuma decisão.

## 9. Próximos passos

Só depois da aprovação deste marco:

1. Conferir o projeto de exemplo no app (a verificação visual que ficou pendente).
2. Marco 2: índice espacial entre elementos, substituindo a varredura por x de `runAnalysis`.
3. Avaliar o custo de `prepareMesh` em malhas grandes. Esse gargalo apareceu nestas medições e não está no roteiro dos marcos.
