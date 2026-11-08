# COORDIX Desktop (Windows) · versão experimental com Electron

**Branch:** `desktop-electron`, criada a partir da `main` no commit `8ded7da`, com backup antes em `backup/main-2026-11-07-2011`.
**Situação:** beta experimental. A versão oficial continua sendo a web (`main` + GitHub Pages), que esta branch não altera.

## 1. Auditoria da arquitetura (antes de programar)

| Item | Como está na versão web | Impacto no Electron |
|---|---|---|
| Entrada | `index.html` único: interface, leitura IFC, análise, revisão e BCF | Carregado como está, sem cópia nem edição |
| HTML/CSS/JS | Tudo no `index.html` (bloco `<style>` e `<script type="module">`) | Nenhuma reorganização |
| Núcleo geométrico | `<script src="coordix-geometria.js">` (global `CoordixGeo`) | Servido localmente; o arquivo não muda |
| Bibliotecas por CDN | three.js 0.147 (UMD + OrbitControls), web-ifc 0.0.39 (`import()` ESM do jsDelivr) e fontes IBM Plex do Google Fonts | **Dependem de internet.** Alternativa local: as mesmas versões vêm do npm e são servidas no lugar das URLs (seção 2) |
| Visualizador 3D | three.js WebGL num canvas, `toDataURL` para snapshot | Funciona no Chromium do Electron |
| IFC | web-ifc (WASM) com `SetWasmPath` relativo à página; `<input type=file multiple>` e arrastar e soltar; exemplos por `fetch("./exemplos/…")` | Exige esquema com `fetch` e MIME `application/wasm`; o diálogo nativo é ligado ao mesmo `<input>` |
| Web Workers | Não há. A análise roda na linha principal | Nada a adaptar. O Worker é o Marco 3 da Fase 02 |
| Armazenamento | `localStorage["bimora.v1"]` (projetos, regras, decisões, issues) e `localStorage["coordix.tema"]`. Os IFC não ficam salvos | Precisa de uma origem fixa para o `localStorage` persistir. Os IFC continuam sem salvar |
| Caminhos | Todos relativos (`./exemplos/`, `marca/`, `web-ifc.wasm`) | Funcionam sob `coordix://app/` |
| APIs do navegador | `navigator.clipboard` (copiar XML), `matchMedia` (tema), `DataTransfer`, WebGL e WASM | Todas disponíveis. A permissão de área de transferência é concedida só para escrita |

**Riscos identificados:**
1. Sem internet, a versão web não carrega o 3D, o leitor IFC nem as fontes. No desktop isso foi resolvido com cópias locais.
2. Com `file://`, o WASM e o `fetch` dos exemplos falham, e o `localStorage` não tem origem estável. Resolvido com um esquema próprio e privilegiado.
3. O diálogo de arquivos precisava ser nativo sem expor o disco. Resolvido com IPC dedicado, em que só os arquivos escolhidos são lidos.
4. Arrastar um arquivo fora da área de upload faria a janela navegar para ele. A navegação externa é bloqueada.
5. Máquinas sem GPU podem não ter WebGL. No CI isso foi tratado com renderização por software, só no teste; num PC comum, o Chromium usa a GPU normalmente.

## 2. Arquitetura

```
COORDIX.exe (Electron 44)
 ├─ processo principal  desktop/main.js
 │    ├─ coordix://app/…  → arquivos do aplicativo (lista fechada: index.html, coordix-geometria.js,
 │    │                     web-ifc.wasm, exemplos/*.ifc, marca/*.svg, desktop/vendor/**)
 │    ├─ https://cdn.jsdelivr.net/npm/three@0.147.0/…   → desktop/vendor/three/…
 │    ├─ https://cdn.jsdelivr.net/npm/web-ifc@0.0.39/…  → desktop/vendor/web-ifc/…
 │    ├─ https://fonts.googleapis.com/css2               → desktop/vendor/fonts/fonts.css
 │    ├─ qualquer outra URL → recusada (o aplicativo não acessa a internet)
 │    └─ IPC: coordix:abrir-ifc (diálogo nativo, só .ifc, até 2 GiB) · coordix:info (versão)
 ├─ preload  desktop/preload.js (contexto isolado, sandbox)
 │    ├─ window.coordixDesktop = { abrirIfc(), info() }
 │    ├─ clique/Enter na área de upload → diálogo nativo → arquivos entregues ao <input id="fileInput">
 │    └─ selo "desenvolvido por Eng. Brunno Resplandes" + "BETA · experimental · v0.1.0"
 └─ página  index.html (exatamente o da versão web)
```

**Segurança:**
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` e `webSecurity: true`.
- O preload expõe só duas funções, sem nenhuma API do Node.
- O canal de IPC verifica se a chamada vem da página do aplicativo.
- A CSP é aplicada só no desktop: scripts locais e do CDN espelhado, WASM permitido, `object-src 'none'`. Ela inclui `'unsafe-eval'` porque o módulo do web-ifc 0.0.39 avalia código gerado ao iniciar; o primeiro teste no Windows mostrou que, sem isso, o leitor IFC não carrega. Como o aplicativo só executa os próprios arquivos e recusa qualquer conteúdo da internet, o risco é contido.
- Navegação e janelas novas são bloqueadas, e permissões negadas, exceto escrever na área de transferência.

**Persistência:** o `localStorage` da origem `coordix://app` fica em `%APPDATA%\COORDIX`. Ele é gravado em disco ao sair (`flushStorageData`). O comportamento é o mesmo da web:
- projetos, regras, decisões, issues e tema ficam salvos;
- os IFC **não** ficam salvos e precisam ser reabertos;
- nenhum arquivo do usuário é copiado, movido ou apagado.

## 3. Arquivos

**Novos:**

| Arquivo | Função |
|---|---|
| `package.json` | nome COORDIX, versão `0.1.0` (canal beta), autor, scripts e dependências |
| `forge.config.js` | empacotamento, ícone, instalador Squirrel (.exe) e versão portátil (.zip) |
| `desktop/main.js` | processo principal: janela, esquema `coordix://`, CDN local, IPC e segurança |
| `desktop/preload.js` | ponte controlada: diálogo nativo de IFC e selo beta |
| `desktop/recursos.js` | lista de arquivos permitidos e mapa CDN → cópia local |
| `desktop/fumaca.js` | teste de fumaça interno (só com `COORDIX_FUMACA`) |
| `desktop/build/icon.ico`, `icon.png` | ícone gerado a partir de `marca/coordix-icone.svg` |
| `desktop/scripts/preparar-vendor.js` | copia three.js, web-ifc e fontes do npm para `desktop/vendor/` |
| `desktop/scripts/fumaca.js` | abre o aplicativo duas vezes e confere o funcionamento e a persistência |
| `desktop/scripts/testar-recursos.js` | testa o que a página pode e não pode carregar |
| `desktop/scripts/testar-instalador.ps1` | instala, confere o atalho no menu Iniciar e desinstala |
| `.github/workflows/desktop-windows.yml` | testes e geração do instalador numa máquina Windows do GitHub (só nesta branch) |
| `docs/desktop-electron.md` | este documento |

**Existentes modificados:**
- `.gitignore`: passa a ignorar `node_modules/`, `out/`, `desktop/vendor/` e os relatórios de teste.
- `README.md`: seção sobre a versão desktop.

`index.html`, `coordix-geometria.js`, `testes/` e o restante não mudaram.

**Dependências (versões fixas):**

| Pacote | Versão | Uso |
|---|---|---|
| `electron` | 44.9.3 | aplicativo |
| `@electron-forge/cli`, `maker-squirrel`, `maker-zip` | 7.11.2 | empacotamento e instalador |
| `electron-squirrel-startup` | 1.0.1 | atalhos na instalação e na desinstalação |
| `three` | 0.147.0 | as mesmas versões da web, só para a cópia local |
| `web-ifc` | 0.0.39 | idem |
| `@fontsource/ibm-plex-sans`, `-sans-condensed`, `-mono` | ^5 | fontes locais |

Nenhuma biblioteca da aplicação foi substituída.

## 4. Como usar

Precisa do Node.js 20 ou superior e do Windows para gerar o instalador.

```bash
git checkout desktop-electron
npm install
npm start          # COORDIX Desktop em desenvolvimento
npm run make       # gera o instalador Windows e a versão portátil
npm run fumaca     # teste de fumaça (duas aberturas)
```

Os arquivos gerados ficam em:
- instalador: `out/make/squirrel.windows/x64/COORDIX-Setup-0.1.0-beta.exe`;
- versão portátil: `out/make/zip/win32/x64/COORDIX-win32-x64-0.1.0.zip`.

**Sem instalar nada:** a cada envio para a branch, o GitHub gera o instalador numa máquina Windows e o deixa para download. O caminho é: aba **Actions** → "COORDIX Desktop (Windows)" → execução mais recente → artefato **COORDIX-Desktop-windows-beta**.

**Instalação:**
- O instalador é por usuário e não pede administrador. Ele cria atalhos no menu Iniciar e na área de trabalho.
- A desinstalação é pelo caminho normal: Configurações → Aplicativos → COORDIX.
- O instalador não é assinado digitalmente. Por isso, o Windows SmartScreen pode avisar na primeira execução ("Mais informações" → "Executar assim mesmo").
- Não há atualização automática.

## 5. Testes realizados

Os testes rodaram numa máquina Windows do GitHub Actions (`windows-latest`, Node 22, Electron 44.9.3), na execução 42430300626 do commit `0068785`. Todos passaram.

| Teste | Resultado |
|---|---|
| Núcleo geométrico no Windows: `geometria.test.js`, `bvh.test.js`, `comparativo_v1.js` | 101/101, 81/81 e comparativo inalterado (v1 com 19 erros, v2 com 0) |
| Resolução de recursos: arquivos permitidos, CDN local e tentativas de sair da pasta ou acessar a internet | 24/24 |
| Fumaça, aplicativo em desenvolvimento, duas aberturas com os mesmos dados | 21/21 |
| Fumaça, aplicativo empacotado (`COORDIX.exe`) | 21/21 |
| Instalador | `COORDIX-Setup-0.1.0-beta.exe` (149,6 MB) instalado em modo silencioso. Executável criado, atalho em Menu Iniciar\BIMOFFICE\COORDIX.lnk. Na desinstalação, o atalho foi removido e a remoção da pasta foi registrada pelo Squirrel (marcador `.dead`). |

As 21 verificações da fumaça:
- o motor IFC lê os 6 exemplos e a análise automática deixa 21 clashes pendentes;
- o three.js e o canvas WebGL funcionam;
- as fontes locais carregam;
- o selo "desenvolvido por" e "BETA" aparece;
- as 8 telas abrem com conteúdo;
- o resultado é igual ao da web: 21 confirmados, 1 abaixo da tolerância e 4 contatos; 8 a corrigir e 13 falsos;
- a revisão abre com câmera e legenda;
- validar um clash cria um issue (21 → 20 pendentes);
- o BCF mostra o tópico;
- o tema claro é aplicado;
- 2 IFCs entram pelo caminho do diálogo (preload → IPC → `<input>`);
- não há erros no console;
- nenhuma requisição externa ou recurso ausente.

Na segunda abertura:
- os dados continuam íntegros;
- a decisão (20 pendentes e 1 issue) e o tema continuam salvos;
- os IFCs escolhidos não ficam salvos, igual à web;
- não há erros no console.

**Versão web:**
- a `main` e o `index.html` não mudaram (o `index.html` é o mesmo nas duas branches);
- testei a `main` no navegador: os exemplos foram lidos, o resultado foi 21 confirmados, 1 abaixo da tolerância e 4 contatos, e a revisão abriu com o 3D.

## 6. Problemas encontrados

1. **CSP.** A primeira execução mostrou que o web-ifc avalia código gerado ao iniciar. `'unsafe-eval'` foi incluído só na CSP do desktop.
2. **Vários arquivos de uma vez (defeito que também existe na web).** Depois do evento `change`, o app limpa o `<input>` (`t.value = ""`), e o Chromium esvazia a mesma lista que a leitura ainda percorre. Por isso, só o primeiro de vários arquivos escolhidos no seletor é lido; arrastar e soltar não é afetado. Reproduzi isso também na versão web.
   - No desktop, o preload entrega um arquivo por vez, e todos são lidos.
   - Na web, a correção é de uma linha (`handleFiles([...t.files])`), mas não foi aplicada, porque esta tarefa não altera a versão web.
3. **Desinstalação.** O Squirrel remove a pasta do aplicativo em segundo plano. Se algum arquivo estiver em uso, a remoção termina na próxima execução do `Update.exe` ou depois de reiniciar.
4. **Assinatura.** O instalador não é assinado digitalmente, então o SmartScreen pode alertar.
5. **Tamanho.** O instalador tem cerca de 150 MB porque inclui o Chromium do Electron.

## 7. Versão 0.2.0-beta (08/11/2026)

**Restauração:** a versão anterior (0.1.0-beta) está na branch `backup/desktop-electron-2026-11-08-0955` (commit `6b2a6f4`). A web oficial antes desta rodada está em `backup/main-2026-11-08-0955` (commit `0caa399`). A `main` não foi alterada.

### O que mudou

**Entrega A, estabilidade:**
- A avaliação geométrica dos pares roda num Web Worker (`coordix-analise-worker.js`), com o mesmo núcleo, os mesmos pares, a mesma ordem e as mesmas opções. A seleção dos pares, a consolidação e a pré-classificação continuam no app.
- Painel de progresso com a etapa atual:
  - na análise: seleção dos pares, preparo das malhas e avaliação dos pares, com contagem e percentual reais;
  - na leitura de IFC: o painel mostra a etapa, e o indicador é indeterminado, porque cada etapa do web-ifc é uma operação única, sem contagem parcial.
- **Cancelar** encerra o worker, e os resultados anteriores ficam intactos.
- Mensagens de erro compreensíveis. A falha interna num par vira "inconclusivo", nunca "sem conflito".
- Corrigido: ao escolher vários IFCs de uma vez, só o primeiro era lido.

**Entrega B, projetos:**
- Menu **Projeto**: Novo, Abrir (.coordix), Salvar, Salvar como, Importar modelos IFC e Excluir. Atalhos Ctrl+O, Ctrl+S e Ctrl+Shift+S.
- O formato `.coordix` é JSON versionado (`formato: "coordix-projeto"`, `versao: 1`) e guarda:
  - todos os dados do projeto;
  - as referências aos IFCs (nome, disciplina, tamanho, SHA-256, caminho absoluto e caminho relativo ao `.coordix`);
  - um retrato da última análise.
- Os IFCs não são copiados.
- Ao abrir, cada IFC é localizado (caminho salvo, depois caminho relativo, depois a mesma pasta) e conferido pela assinatura:
  - os encontrados são recarregados e a análise é refeita, reaplicando as decisões;
  - os ausentes ou alterados aparecem em "Modelos vinculados ao projeto", com **Localizar…** ou **Carregar mesmo assim**.
- O arquivo é gravado de forma atômica: primeiro num temporário, que é conferido, depois a versão anterior vira `.bak` e o novo é renomeado.
- **Excluir projeto** pede confirmação com o nome e o que será removido, e avisa que nenhum arquivo do computador é apagado.
- Segurança no desktop: só são lidos IFCs que o usuário escolheu (diálogo ou arrastar) ou que constam num `.coordix` que ele abriu.

**Entrega C, identidade:**
- Nova disciplina **MET (Estrutura Metálica)** com 7 testes próprios na matriz (MET×MET, ×EST, ×ARQ, ×SAN, ×HVAC, ×ELE, ×PCI), editáveis em separado.
- A MET também entra:
  - nas regras de nó estrutural e de arquitetura × estrutura;
  - na ordem de flexibilidade.
- Os projetos já salvos recebem os testes novos sem alteração dos existentes.
- "Visus" saiu dos textos da interface. A função interna `visusFields` foi mantida.
- Versão e desenvolvedor saíram da faixa vertical e foram para **Sobre o COORDIX** (botão ⓘ na barra superior).

### Testes

Executados no Windows, execução 42489355923, commit `a6a87be`:

| Teste | Resultado |
|---|---|
| Núcleo geométrico | 101/101; BVH 81/81; comparativo com a v1 igual |
| Resolução de recursos | 25/25 |
| Fumaça, desenvolvimento | 30/30 |
| Fumaça, empacotado | 30/30 |
| Instalador `COORDIX-Setup-0.2.0-beta.exe` | instalou, criou o atalho no menu Iniciar e o removeu na desinstalação |

A fumaça passou a conferir também:
- Sobre o COORDIX;
- a MET na matriz;
- a ausência de "Visus";
- o ciclo novo projeto → 2 IFCs → análise com painel de progresso → Salvar → Excluir → Abrir, com os IFCs reencontrados e a análise idêntica;
- o `.coordix` versionado, com SHA-256 e caminhos, sem cópia dos IFCs;
- os IFCs originais intactos (mesmo SHA-256);
- a recuperação depois de fechar e abrir.

**No navegador** (mesmo `index.html`):
- o resultado do exemplo é idêntico ao da web oficial: mesma lista de 8 + 13 clashes, com a mesma assinatura de conteúdo;
- o modelo de carga G (3 588 elementos) deu o mesmo resultado nas duas versões: 424 confirmados, 10 abaixo da tolerância, 780 contatos e 1 sem conflito;
- o maior bloqueio da interface durante a análise caiu de 518 ms para 166 ms;
- o cancelamento manteve os resultados anteriores, e uma nova análise funcionou em seguida.

### Limitações e pendências

- **Melhoria 2 (representação gráfica):** aguarda IFCs de referência com o problema. As correções possíveis (segmentação de círculos, varreduras e booleanas do web-ifc) mudam a geometria usada na análise e precisam ser validadas com esses arquivos.
- A leitura do IFC ainda bloqueia a interface durante cada etapa do web-ifc. O painel mostra a etapa, mas não há percentual nem cancelamento. Levar o web-ifc para um Worker exige reorganizar o acesso às propriedades, e fica como próximo passo.
- Não testei a atualização da 0.1.0 para a 0.2.0 por cima da versão instalada; o teste fez instalação limpa. O Squirrel trata versões maiores como atualização.
- Os IFCs de carga (`testes/ifc-carga/`) são geometria simples. Modelos reais grandes ainda não foram medidos.

## 8. Versão 0.3.0-beta (08/11/2026): leitor IFC atualizado

**Restauração:** a versão anterior (0.2.0-beta) está em `backup/desktop-electron-2026-11-08-1350`, commit `abf5caa`.

**O problema relatado:**
- Vários modelos IFC2X3, IFC4 e IFC4X3_ADD2 terminavam com "Aborted()" na abertura do arquivo.
- As formas apareciam distorcidas, com triângulos espúrios, em modelos do Revit (hidráulica, SPDA, conexões).

**Causa:** o leitor web-ifc 0.0.39, de 2023.
- Ele não conhece o esquema IFC4X3.
- Ele aborta ou triangula mal geometrias comuns no Revit: perfis com curvas compostas e trechos de círculo (o arquivo de SPDA analisado tem 689 `IfcTrimmedCurve`, 152 `IfcCompositeCurve` e 3 167 conexões por `IfcMappedItem`).
- As coordenadas do arquivo não eram a causa: a translação UTM (cerca de 9 030 km) fica só na implantação, e o COORDIX a aplica em precisão dupla.

**O que mudou:**
- **Leitor web-ifc 0.0.78** (21/09/2026): suporta IFC2X3, IFC4 e IFC4X3. A API e o `.wasm` são da mesma versão; no desktop, são servidos por cópia local.
- **Círculos com 24 segmentos** (antes 12). O polígono inscrito de um tubo Ø100 perdia até 1,7 mm de raio e agora perde 0,4 mm, o que deixa a análise e o desenho mais fiéis.
- Mensagens de erro do leitor em português, com orientação.
- **Comparação automática dos dois leitores** no CI (`testes/comparar-leitores.js`): caixas por elemento, triângulos e erros.

**Comparação 0.0.39 × 0.0.78** (12 arquivos: exemplos e modelos de carga):
- nenhum erro e nenhum elemento perdido com o leitor novo;
- elementos prismáticos com caixas idênticas;
- tubos com mais triângulos (efeito dos 24 segmentos) e caixas até 1,8 mm diferentes (mais próximas do diâmetro real).

**Efeito no exemplo:**
- os mesmos 21 confirmados e 1 abaixo da tolerância;
- contatos passaram de 4 para 10, e sólidos válidos de 29 para 33: o leitor antigo gerava 4 elementos como malhas inválidas;
- a classificação ficou igual (8 a corrigir, 13 falsos);
- a penetração dos tubos passou de 95,9 para 99,1 mm (Ø100).

**Testes** (execução 42507340526, commit `26948c8`):
- núcleo 101/101 e BVH 81/81;
- comparação dos leitores: 12 arquivos sem regressão;
- recursos 27/27;
- fumaça 30/30 em desenvolvimento e 30/30 no app empacotado;
- instalador `COORDIX-Setup-0.3.0-beta.exe` (150,8 MB): instalação, atalho e desinstalação conferidos.

**Não validado:**
- os IFCs reais do projeto. O arquivo de SPDA enviado não foi colocado no repositório público e precisa ser conferido no aplicativo instalado;
- o uso de memória com muitos modelos abertos ao mesmo tempo (o leitor mantém cada modelo aberto para consultar as propriedades).

## 9. Versão 0.4.0-beta (08/11/2026): coordenadas georreferenciadas e memória

**Problema:**
- a origem usada para converter as coordenadas era única por sessão e vinha do 1º modelo aberto, sempre o projeto de exemplo, perto de 0,0,0;
- IFCs exportados em coordenadas compartilhadas (UTM) ficavam a cerca de 9.030 km dessa origem;
- o desenho em Float32 perdia precisão nessa distância: com passo de cerca de 0,5 m, as geometrias apareciam distorcidas;
- a análise não era afetada, porque usa Float64.

**Solução (sem mover nem alterar os IFCs):**
- **Origem local por projeto:** definida pelo 1º IFC lido no projeto e guardada no projeto e no `.coordix`. Todos os IFCs do projeto usam a mesma origem, então a posição relativa entre eles é preservada.
  - A origem é o 1º vértice do modelo, a mesma referência das versões anteriores, por isso os resultados de referência ficam idênticos.
  - Se esse vértice estiver longe do modelo (um elemento perdido na origem interna), o COORDIX usa a mediana dos centros dos elementos.
  - Ao remover todos os modelos do projeto, a origem é redefinida pelo próximo IFC.
- **Desenho relativo ao centro:** cada malha guarda vértices em Float32 relativos ao seu centro, e a posição do objeto fica em dupla precisão. A precisão do desenho não depende mais da distância até a origem.
- **BCF:** os viewpoints continuam em coordenadas do IFC (origem do projeto somada de volta).
- **Alerta:** um modelo a mais de 5 km dos demais do mesmo projeto é sinalizado como "provavelmente exportado em outro sistema de coordenadas". A posição é mantida como está no arquivo.

**Memória:**
- o arquivo bruto é liberado logo depois que o leitor o abre;
- a cópia Float32 por elemento foi eliminada (o desenho é gerado a partir da geometria Float64);
- o heap JavaScript da página foi elevado ao máximo do Electron (4 GB).

O leitor IFC (WebAssembly de 32 bits) continua limitado a 4 GB. Um IFC de 1,5 GB pode passar disso durante a leitura.

**Testes** (execução 42510859369, commit da versão 0.4.0):
- núcleo, BVH, comparação dos leitores e recursos: aprovados;
- fumaça 33/33 em desenvolvimento e 33/33 no app empacotado.
  - Novas verificações usam cópias dos exemplos deslocadas para 512 km E / 9.030 km N: origem do projeto ≈ 9.030 km, maior vértice desenhado menor que 200 m, alerta ao misturar com o projeto de exemplo.
  - O resultado de referência do exemplo continua `21 confirmado · 1 abaixo da tolerância · 10 contato · 33 sólidos válidos`.
- instalador: instalação, atalho e desinstalação conferidos.

**Observação técnica:**
- numa tentativa intermediária, com a origem na mediana dos centros, 2 elementos do exemplo mudaram de classificação topológica (33 para 31 sólidos válidos, 10 para 8 contatos);
- a fusão de vértices (0,01 mm) é sensível à origem nesses elementos, por isso a origem padrão voltou ao 1º vértice;
- o ponto fica registrado para investigação no núcleo geométrico, que não foi alterado.
