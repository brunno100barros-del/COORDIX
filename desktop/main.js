/* COORDIX Desktop · processo principal do Electron (versão experimental).
 *
 * Camada de execução apenas: carrega o MESMO index.html da versão web, a partir dos arquivos locais,
 * sem alterar a interface, o núcleo geométrico ou a lógica de análise.
 *
 * Segurança: contextIsolation, sandbox, sem nodeIntegration; a página só recebe, pelo preload,
 * a seleção de IFC por diálogo nativo (canal "coordix:abrir-ifc") e os dados de versão. */
"use strict";
const { app, BrowserWindow, protocol, dialog, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");
const { ESQUEMA, ORIGEM, resolver, tipoDe } = require("./recursos");

// instalador Squirrel: cria/remove atalhos do menu Iniciar e da área de trabalho e encerra
if (require("electron-squirrel-startup")) app.quit();

const RAIZ = path.resolve(__dirname, "..");
const PKG = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
const FUMACA = process.env.COORDIX_FUMACA ? require("./fumaca") : null; // teste automatizado (ver desktop/scripts/fumaca.js)
if (FUMACA) FUMACA.configurar(app);

const LIMITE_IFC = 2 * 1024 * 1024 * 1024; // 2 GiB por arquivo
const ERROS_REDE = [];

// o esquema próprio precisa ser registrado antes de "ready": padrão (localStorage persistente), seguro e com fetch
protocol.registerSchemesAsPrivileged([{ scheme: ESQUEMA, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

if (!FUMACA && !app.requestSingleInstanceLock()) app.quit();

/* CSP aplicada só no aplicativo desktop (a versão web não muda) */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join("; ");

async function servir(req) {
  const rel = resolver(RAIZ, req.url);
  if (!rel) { ERROS_REDE.push({ url: req.url, status: 403 }); return new Response("Recurso não disponível no COORDIX Desktop", { status: 403 }); }
  try {
    const corpo = await fs.promises.readFile(path.join(RAIZ, rel));
    const h = { "Content-Type": tipoDe(rel), "Access-Control-Allow-Origin": ORIGEM, "Cache-Control": "no-cache" };
    if (rel === "index.html") h["Content-Security-Policy"] = CSP;
    return new Response(corpo, { status: 200, headers: h });
  } catch (e) {
    ERROS_REDE.push({ url: req.url, status: 404 });
    return new Response("Arquivo não encontrado", { status: 404 });
  }
}

function criarJanela() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600,
    title: `COORDIX (${PKG.coordix.rotulo})`,
    icon: path.join(__dirname, "build", "icon.png"),
    backgroundColor: "#0b0d10",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      spellcheck: false, devTools: !app.isPackaged || !!FUMACA,
    },
  });
  win.removeMenu();
  win.once("ready-to-show", () => win.show());
  // a página não navega para fora do aplicativo nem abre janelas (inclui arquivos soltos fora da área de upload)
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(ORIGEM + "/")) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.loadURL(ORIGEM + "/index.html");
  return win;
}

/* diálogo nativo do Windows para escolher IFCs; lê apenas os arquivos escolhidos (sem copiar nem mover) */
async function abrirIfc(evt) {
  const win = BrowserWindow.fromWebContents(evt.sender);
  if (!win || !evt.senderFrame || !evt.senderFrame.url.startsWith(ORIGEM + "/")) throw new Error("origem não autorizada");
  const caminhos = FUMACA ? FUMACA.arquivosDoDialogo() : (await dialog.showOpenDialog(win, {
    title: "Selecionar modelos IFC", buttonLabel: "Abrir",
    filters: [{ name: "Modelos IFC", extensions: ["ifc"] }],
    properties: ["openFile", "multiSelections"],
  })).filePaths;
  const saida = [];
  for (const p of caminhos || []) {
    if (path.extname(p).toLowerCase() !== ".ifc") continue;
    const st = await fs.promises.stat(p);
    if (!st.isFile() || st.size > LIMITE_IFC) continue;
    const buf = await fs.promises.readFile(p);
    saida.push({ nome: path.basename(p), bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), modificado: st.mtimeMs });
  }
  return saida;
}

app.whenReady().then(() => {
  protocol.handle(ESQUEMA, servir);
  protocol.handle("https", servir); // CDN → cópia local; o resto da internet é recusado
  protocol.handle("http", (req) => { ERROS_REDE.push({ url: req.url, status: 403 }); return new Response("", { status: 403 }); });
  session.defaultSession.setPermissionRequestHandler((wc, permissao, ok) => ok(permissao === "clipboard-sanitized-write"));
  ipcMain.handle("coordix:abrir-ifc", abrirIfc);
  ipcMain.handle("coordix:info", () => ({ versao: PKG.version, rotulo: PKG.coordix.rotulo, autor: PKG.author, plataforma: process.platform }));
  app.setAppUserModelId("com.squirrel.coordix.coordix");
  const win = criarJanela();
  if (FUMACA) FUMACA.executar(win, ERROS_REDE);
});

app.on("second-instance", () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
// grava o localStorage em disco antes de sair (projetos, regras, decisões e tema)
app.on("before-quit", () => { try { session.defaultSession.flushStorageData(); } catch {} });
app.on("window-all-closed", () => app.quit());
