# BIMOFFICE: COORDIX

Coordenação BIM e detecção de interferências (clash detection) em modelos IFC, organizada por projeto. O COORDIX faz parte do ecossistema BIMOFFICE e antes se chamava BIMORA.

Fluxo: **detectar → interpretar → classificar → atribuir → revisar → validar → gerar BCF → acompanhar a resolução**.
A automação faz a parte repetitiva e o coordenador BIM continua responsável pela validação final.

> **Status:** protótipo funcional (Fase 01: confiabilidade do núcleo geométrico concluída). Roda inteiro no navegador. Os modelos IFC não ficam salvos entre sessões. O backend em Python está planejado (veja o roteiro abaixo).

## O que já funciona

| Módulo | Recursos |
|---|---|
| Projeto e equipe | Projetos separados, integrantes com cargo, códigos de disciplina e e-mail, indicação do coordenador |
| Modelos IFC | Upload por arrastar e soltar, disciplina detectada pelo código no nome do arquivo (EST, ARQ, SAN, ELE, SCE, PCI, CLI…), esquema IFC e entidades ignoradas na leitura |
| Visualizador | 3D com árvore modelo → pavimento → entidade, isolar, aproximar e snapshot |
| Propriedades | Aba **Geral** no padrão Visus (Disciplina, **Entidade**, ID IFC, Layer, Pavimento, Type) e aba **PropertySets** com quantitativos e propriedades do tipo |
| Regras de análise | Matriz de tolerância com os 21 testes do manual corporativo (interferência ou folga, em mm), filtros de exclusão por entidade ou PropertySet, ordem de flexibilidade das disciplinas e tabela de nomes de Entidade editável |
| Clash detection | Núcleo geométrico próprio (`coordix-geometria.js`): espessura de interferência rigorosa (exata para peças convexas), volume de interseção, folga por distância exata entre malhas, contenção por número de voltas e estados de confiabilidade (confirmado, abaixo da tolerância, contato, sem conflito, inconclusivo e incompleto) |
| Clashes por nível | Resultados agrupados por pavimento, aba separada de **falsos clashes** e alerta de revisão pendente |
| Pré-classificação | Regras P1, P2, P3, P4, INFO e Falso clash com o motivo exibido, além do responsável sugerido pela disciplina que se adapta |
| Revisão | Fila um por um, câmera no conflito (A em vermelho, B em azul), PropertySets dos dois elementos, alteração de classificação e responsável, comentários, snapshot e histórico. Atalhos: `Enter`, `F`, `1`–`5`, `←` `→` |
| Issues | Clash validado vira issue com status, prazo do manual e histórico |
| BCF 2.1 | Prévia do `markup.bcf` e do `.bcfv` (GUIDs, cores, câmera, prioridade "P2 - Alto", AssignedTo, Labels = pavimento). A geração do arquivo `.bcf` ainda não está ativa |

## Como rodar

O app é estático: basta servir a pasta por HTTP. Abrir o `index.html` direto do disco não funciona, porque o navegador bloqueia o carregamento do `.wasm`.

```bash
python -m http.server 8000
# abra http://localhost:8000
```

Também roda no **GitHub Pages**: em *Settings → Pages*, escolha a branch `main` e a pasta `/ (root)`.

Na primeira abertura é carregado um projeto de exemplo, com modelos fictícios da pasta `exemplos/`. Os dados de projetos, equipe, regras e decisões ficam no `localStorage` do navegador.

## Estrutura

```
index.html                       app (interface, leitura IFC, análise, revisão, BCF)
coordix-geometria.js             núcleo geométrico (sem dependências; navegador e Node)
web-ifc.wasm                     motor de leitura IFC (web-ifc 0.0.39)
exemplos/                        IFCs fictícios com conflitos planejados
ferramentas/gerar_ifc_exemplo.py gera os IFCs de exemplo
testes/geometria.test.js         suíte de testes geométricos (53 cenários)
testes/comparativo_v1.js         comparativo com o motor da v1 nos mesmos cenários
testes/formas.js                 geometrias sintéticas dos testes
testes/legado_v1.js              motor da v1, preservado só para o comparativo
docs/fase-01-relatorio.md        relatório técnico da Fase 01
```

## Testes

Precisa do Node.js 18 ou superior. Não há dependências para instalar.

```bash
node testes/geometria.test.js    # sai com código 1 se algum cenário falhar
node testes/comparativo_v1.js
```

Bibliotecas carregadas por CDN: three.js 0.147 e web-ifc 0.0.39.

## Roteiro

1. Backend em Python (FastAPI + IfcOpenShell) com banco PostgreSQL, armazenamento dos IFCs e das versões, e login por papel.
2. Fase 02: índices espaciais (BVH) no núcleo geométrico e decomposição convexa de peças não convexas; análise em segundo plano (Web Worker).
3. Atribuição de pavimento pela cota para modelos sem pavimentos reais (por exemplo, estrutura metálica em "Default Storey").
4. Geração do arquivo BCF 2.1 e validação da importação no Trimble Connect.
5. Revisão dos nomes de Entidade conforme o Visus.

## Licenças de terceiros

`web-ifc.wasm` faz parte do [web-ifc](https://github.com/ThatOpen/engine_web-ifc) (That Open Company), distribuído sob a licença MPL-2.0. O three.js é distribuído sob a licença MIT.
