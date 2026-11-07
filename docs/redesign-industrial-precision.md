# COORDIX · Redesign "Industrial Precision"

- **Branch:** `redesign/industrial-precision`, criada a partir da `main` no commit `dcd4139` (Fase 02 · Marco 1).
- **Situação:** incorporado à `main` em 07/11/2026 (commit `a72ff80`). Backup da `main` anterior: `backup/main-2026-11-07-1800`.
- **Símbolo:** proporção final LARG 0,68 · ALT 1,36 (em `ferramentas/gerar_simbolo.py`); na barra, a pupila fica entre as linhas COORDIX e BIMOFFICE (`--logo-mark-dy: -4px`).
- **Escopo:** só apresentação. Nenhuma funcionalidade, regra, cálculo, id, classe usada pelo JS ou mecanismo de persistência foi removido ou renomeado.
- **Fora do redesign:** o núcleo geométrico (`coordix-geometria.js`) e os testes não foram tocados (`git diff main -- coordix-geometria.js testes/` vazio).

## 1. Direção visual

A interface foi tratada como uma prancha técnica, e não como um painel SaaS:

- **Hierarquia por fios, não por sombras.** Os painéis são separados por linhas finas. Os cabeçalhos dos painéis são faixas, como o carimbo de uma prancha. A sombra só aparece no que flutua sobre o 3D (barra de ferramentas, legenda e avisos).
- **Raios mínimos** de 2 a 3 px, sem cartões arredondados.
- **Tipografia em três vozes**, todas da família IBM Plex, que já era carregada:
  - Plex Sans Condensed para títulos e pavimentos;
  - Plex Mono em caixa alta e espaçada para rótulos técnicos, cabeçalhos de tabela e números;
  - Plex Sans para o texto corrido.
- **Cor de destaque:** o cobre da íris do símbolo (`--accent`). Ele marca a seleção, o item ativo e o que aguarda revisão. Os estados de severidade têm escala própria.
- **Marca lateral de 3 px** (`--bar`) como linguagem comum de "estado". Aparece no item ativo do menu, na linha selecionada, no item da fila de revisão, no aviso pendente e na propriedade Entidade.

## 2. Sistema de design

Todos os valores vêm de variáveis em `:root`, no bloco `<style>` do `index.html`:

| Grupo | Variáveis |
|---|---|
| Tipografia | `--font`, `--font-cond`, `--font-mono`, `--fs-2xs … --fs-xl`, `--track-caps` |
| Espaçamento (base 4) | `--sp-1 … --sp-8` |
| Geometria | `--r-1`, `--r-2`, `--bw`, `--bar`, `--h-top`, `--w-rail`, `--h-ctl`, `--h-ctl-sm` |
| Movimento | `--t-fast`, `--t-theme`, `--ease` |
| Superfícies e texto | `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--ink`, `--ink-2`, `--muted`, `--faint`, `--line`, `--line-strong` |
| Estados | `--brand`, `--accent`, `--accent-soft`, `--accent-line`, `--focus`, `--hover`, `--press`, `--sel` |
| Severidade e status | `--p1 … --p4`, `--info`, `--fake`, `--ok` |
| Sombras | `--shadow-float` |
| Símbolo | `--cx-traco`, `--cx-iris`, `--cx-limbo`, `--cx-pupila`, `--cx-brilho` |
| Ambiente 3D | `--viewer`, `--viewer-grid`, `--viewer-grid-major`, `--viewer-chrome`, `--viewer-sel` |

O tema escuro redefine só os tokens de cor, em dois lugares: `@media (prefers-color-scheme: dark)` sem preferência salva, e `:root[data-theme="dark"]`.

### Indicadores de clashes

| Indicador | Aparência |
|---|---|
| Classificação (`.chip.P1 … .chip.FALSO`) | etiqueta em mono com marca lateral e fundo tingido da cor da severidade. P1 é sólido, por ser o único que exige ação imediata. |
| Sugerido (`.chip.sug`) | contorno tracejado em cobre com um losango, para "aguardando revisão" |
| Validado (`.chip.ok`) | contorno verde |
| Alerta geométrico (`.chip.geo`) | contorno laranja discreto |
| Pavimentos (`.lvl`) | nome em condensada caixa alta, precedido do triângulo de nível usado nos desenhos de arquitetura. A fila de revisão usa o mesmo marcador nos grupos. |

## 3. Símbolo

O símbolo é um olho vetorial desenhado a partir da fotografia de referência. A geometria foi medida sobre a foto e gerada por `ferramentas/gerar_simbolo.py`. Ele preserva:

- o contorno amendoado, com o canto interno mais baixo e o externo erguido;
- a pálpebra superior em faixa afilada, fina no canto interno e espessa no externo, com o prolongamento escuro dos cílios;
- os cílios longos e curvados, mais longos no centro-externo e deitando para fora no canto;
- a íris castanha grande, encostada na pálpebra inferior e coberta em cima pela pálpebra, com anel limbar escuro;
- a pupila escura;
- o **reflexo retangular da janela**, com o montante, que é o traço mais reconhecível da foto. Para um software de arquitetura, também funciona como conceito: o olho que vê a edificação.

| Arquivo | Uso |
|---|---|
| `marca/coordix-simbolo.svg` | símbolo principal, fundo transparente, cores por variáveis com padrão claro/escuro |
| `marca/coordix-simbolo-sobrancelha.svg` | versão com a sobrancelha arqueada da foto, para aberturas e materiais de marca |
| `marca/coordix-icone.svg` | ícone do aplicativo (512 × 512, placa grafite); também usado como favicon |

Na barra superior, o símbolo fica embutido no HTML com as cores do tema ativo, à esquerda de "COORDIX" / "BIMOFFICE".

## 4. Tema claro e escuro

- Botão de dois estados (sol / lua) no canto direito da barra superior.
- A troca é instantânea, sem recarregar. Uma transição de 0,22 s em cores só é ativada durante a troca (classe `theme-anim`), para não deixar o resto da interface lento.
- A preferência fica em `localStorage["coordix.tema"]`, chave separada do `bimora.v1`, e é aplicada por um script no `<head>` antes da primeira pintura, sem piscar. Sem preferência salva, a interface segue o tema do sistema.
- **Visualizador 3D:**
  - o fundo e a grade vêm dos tokens `--viewer-*`, ajustados para a leitura da geometria em cada tema;
  - a grade técnica tem malha fina de 1 m e malha principal de 10 m;
  - as cores A (vermelho) e B (azul) e a cor de seleção (`--viewer-sel`) são iguais nos dois temas;
  - o motor de renderização e o carregamento dos modelos não mudaram.

## 5. Arquivos modificados

| Arquivo | Alteração |
|---|---|
| `index.html` | bloco `<style>` reescrito como sistema de design; script de tema no `<head>`; meta viewport; favicon |
| `index.html`, barra superior | símbolo, célula do projeto e grupo de ferramentas com o botão de tema. Os ids `projectSelect`, `newProjectBtn` e `reviewPill` foram mantidos. |
| `index.html`, `renderNav` | rótulos de seção "Preparação" e "Coordenação"; números com dois dígitos. `data-nav` mantido. |
| `index.html`, visualizador | ícones nas ferramentas (mesmos `data-act`). `updateViewerTheme` passou a recriar a grade com as cores do ambiente. Seleção com `--viewer-sel`. |
| `index.html`, JS de tema | `setTheme`, `syncThemeToggle` e `effectiveTheme`, só apresentação |
| `marca/*.svg` | símbolo, versão com sobrancelha e ícone |
| `ferramentas/gerar_simbolo.py` | gerador do símbolo |

**Correção incluída:** a regra `[hidden]{display:none!important}`. Antes, componentes com `display` próprio, como a legenda do 3D e o aviso de revisão, continuavam visíveis mesmo com o atributo `hidden`, porque a regra do componente vencia. Por exemplo, a legenda "A · Viga / B · …" ficava no Visualizador depois de sair da Revisão.

## 6. Regressão

Todos os itens abaixo foram executados de fato. A verificação no app foi feita no painel do navegador do Claude, carregando cada commit da branch a partir do GitHub, com os IFCs de exemplo.

| Verificação | Resultado |
|---|---|
| Testes do núcleo: `geometria.test.js`, `bvh.test.js`, `comparativo_v1.js` | 101/101, 81/81 e comparativo inalterado. O núcleo não foi alterado. |
| Sintaxe do script do app (`node --check`) | ok. Ela pegou um erro meu, um comentário que engolia uma linha, que foi corrigido. |
| Leitura dos 6 IFCs de exemplo e análise automática | 21 confirmados, 1 abaixo da tolerância, 4 contatos (iguais à Fase 01); 8 a corrigir e 13 falsos |
| Telas no tema escuro, 1440 × 900 | Projeto e equipe, Clashes por nível, Revisão (câmera no conflito, A vermelho / B azul, legenda), Visualizador (árvore, seleção, PropertySets) |
| Telas no tema claro, 1440 × 900 | Modelos IFC, Visualizador (seleção de pavimento/entidade pela árvore), Clashes, Revisão, Issues, BCF 2.1, Regras de análise |
| Fluxo de revisão | "Confirmar e próximo" validou o EST_SAN como P1: pendentes 21 → 20, Issue #1 criado e listado em Issues, tópico no BCF com o XML do `markup.bcf` |
| Alternância e persistência do tema | troca sem recarregar; a preferência sobreviveu ao recarregamento; `bimora.v1` intacto |
| Legenda ao sair da Revisão | escondida (`display: none`) |
| Celular (375 px) | sem rolagem horizontal (largura do documento igual à da tela) depois de um ajuste na barra superior |
| Console | sem erros do app. O único erro registrado veio de eventos de ponteiro sintéticos que eu disparei no teste. |

## 7. Limitações

- O símbolo em 16 px (favicon) perde os cílios finos. A partir de 24 px ele fica legível.
- Os chips tingidos e o anel de foco usam `color-mix()`, disponível nos navegadores atuais (Chrome 111+, Safari 16.2+, Firefox 113+). Em navegadores mais antigos, os chips tingidos perdem o fundo, mas continuam legíveis.
- Não testei com IFCs reais grandes, só com os exemplos.
- Os textos (rótulos e mensagens) não foram revisados. Isso não fazia parte do pedido.
