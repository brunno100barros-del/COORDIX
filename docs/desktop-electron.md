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
- A CSP é aplicada só no desktop: scripts locais e do CDN espelhado, WASM permitido, `object-src 'none'`.
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
