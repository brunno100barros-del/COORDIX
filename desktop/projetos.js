/* COORDIX Desktop · arquivos de projeto (.coordix) e IFCs vinculados.
 *
 * Canais IPC (todos verificam se a chamada vem da página do aplicativo):
 *   coordix:projeto-abrir            diálogo → lê e valida o .coordix → situação de cada IFC referenciado
 *   coordix:projeto-salvar           grava o .coordix (Salvar / Salvar como), de forma atômica, com cópia .bak da versão anterior
 *   coordix:ifc-ler {caminho}        lê um IFC já autorizado (escolhido pelo usuário ou referenciado por um projeto que ele abriu)
 *   coordix:ifc-localizar {nome}     diálogo para localizar um IFC ausente
 *   coordix:autorizar-arquivo {caminho}  registra um IFC solto pelo usuário na janela (chamado só pelo preload)
 *
 * Segurança: a página nunca lê caminhos arbitrários. Só são lidos arquivos .ifc que o próprio usuário
 * escolheu (diálogo ou arrastar e soltar) ou que estão referenciados num .coordix que ele abriu pelo
 * diálogo. A lista de autorizados fica em userData/caminhos-autorizados.json.
 * Nenhum IFC é copiado, movido ou apagado: o .coordix guarda só referências (caminho, tamanho e SHA-256). */
"use strict";
const { app, dialog, ipcMain, BrowserWindow } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const LIMITE_IFC = 2 * 1024 * 1024 * 1024;
const LIMITE_PROJETO = 512 * 1024 * 1024;
let ORIGEM = "";
let FUMACA = null;
let autorizados = null;

const arqAutorizados = () => path.join(app.getPath("userData"), "caminhos-autorizados.json");
function carregarAutorizados() {
  if (autorizados) return autorizados;
  try { autorizados = new Set(JSON.parse(fs.readFileSync(arqAutorizados(), "utf8"))); } catch { autorizados = new Set(); }
  return autorizados;
}
function autorizar(p) {
  const a = carregarAutorizados(), n = path.resolve(p);
  if (a.has(n)) return;
  a.add(n);
  try { fs.writeFileSync(arqAutorizados(), JSON.stringify([...a].slice(-5000))); } catch {}
}
const ehIfc = (p) => typeof p === "string" && path.isAbsolute(p) && path.extname(p).toLowerCase() === ".ifc";

function origemOk(evt) {
  const win = BrowserWindow.fromWebContents(evt.sender);
  if (!win || !evt.senderFrame || !evt.senderFrame.url.startsWith(ORIGEM + "/")) throw new Error("origem não autorizada");
  return win;
}
async function sha256Arquivo(p) {
  return new Promise((ok, falha) => {
    const h = crypto.createHash("sha256");
    fs.createReadStream(p).on("data", (d) => h.update(d)).on("end", () => ok(h.digest("hex"))).on("error", falha);
  });
}
async function lerIfc(p) {
  const st = await fs.promises.stat(p);
  if (!st.isFile()) throw new Error("não é um arquivo");
  if (st.size > LIMITE_IFC) throw new Error("arquivo maior que 2 GB");
  const buf = await fs.promises.readFile(p);
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  return { nome: path.basename(p), caminho: p, bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), modificado: st.mtimeMs, tamanho: st.size, sha256 };
}

/* procura cada IFC referenciado: caminho absoluto salvo → caminho relativo ao .coordix → mesma pasta do .coordix */
async function situacaoDosIfcs(modelos, pastaProjeto) {
  const out = [];
  for (const m of modelos) {
    const candidatos = [];
    if (m.caminho) candidatos.push(m.caminho);
    if (m.caminhoRelativo) candidatos.push(path.resolve(pastaProjeto, m.caminhoRelativo));
    if (m.arquivo) candidatos.push(path.join(pastaProjeto, path.basename(m.arquivo)));
    let achado = null;
    for (const c of candidatos) {
      if (!ehIfc(c)) continue;
      try { const st = await fs.promises.stat(c); if (st.isFile()) { achado = { caminho: c, tamanho: st.size }; break; } } catch {}
    }
    if (!achado) { out.push({ arquivo: m.arquivo, situacao: "ausente" }); continue; }
    autorizar(achado.caminho);
    let sha = null;
    try { sha = await sha256Arquivo(achado.caminho); } catch {}
    out.push({ arquivo: m.arquivo, caminho: achado.caminho, tamanho: achado.tamanho, sha256: sha,
      situacao: m.sha256 && sha && m.sha256 !== sha ? "alterado" : "encontrado" });
  }
  return out;
}

function validarProjeto(obj) {
  if (!obj || obj.formato !== "coordix-projeto") throw new Error("o arquivo não é um projeto COORDIX");
  if (!Number.isInteger(obj.versao) || obj.versao < 1) throw new Error("versão do arquivo de projeto inválida");
  if (!obj.projeto || typeof obj.projeto !== "object" || !obj.projeto.id) throw new Error("o arquivo não contém os dados do projeto");
  if (!Array.isArray(obj.modelos)) obj.modelos = [];
}

async function abrirProjeto(evt) {
  const win = origemOk(evt);
  const caminho = FUMACA && FUMACA.projetoParaAbrir ? FUMACA.projetoParaAbrir() : (await dialog.showOpenDialog(win, {
    title: "Abrir projeto COORDIX", buttonLabel: "Abrir projeto",
    filters: [{ name: "Projeto COORDIX", extensions: ["coordix"] }], properties: ["openFile"],
  })).filePaths[0];
  if (!caminho) return null;
  const st = await fs.promises.stat(caminho);
  if (st.size > LIMITE_PROJETO) throw new Error("arquivo de projeto grande demais");
  const texto = await fs.promises.readFile(caminho, "utf8");
  let obj;
  try { obj = JSON.parse(texto); } catch { throw new Error("o arquivo de projeto está corrompido ou incompleto (JSON inválido)"); }
  validarProjeto(obj);
  const ifcs = await situacaoDosIfcs(obj.modelos, path.dirname(caminho));
  return { conteudo: texto, caminho, nome: path.basename(caminho), ifcs };
}

async function salvarProjeto(evt, args) {
  const win = origemOk(evt);
  const { conteudo, caminho, comoNovo, nomeSugerido } = args || {};
  if (!conteudo || typeof conteudo !== "object") throw new Error("conteúdo do projeto ausente");
  validarProjeto(conteudo);
  let destino = !comoNovo && typeof caminho === "string" && caminho.toLowerCase().endsWith(".coordix") ? caminho : null;
  if (!destino) {
    const nome = String(nomeSugerido || "Projeto").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) + ".coordix";
    destino = FUMACA && FUMACA.projetoParaSalvar ? FUMACA.projetoParaSalvar(nome) : (await dialog.showSaveDialog(win, {
      title: comoNovo ? "Salvar projeto como" : "Salvar projeto", buttonLabel: "Salvar",
      defaultPath: path.join(app.getPath("documents"), nome),
      filters: [{ name: "Projeto COORDIX", extensions: ["coordix"] }],
    })).filePath;
    if (!destino) return null;
    if (!destino.toLowerCase().endsWith(".coordix")) destino += ".coordix";
  }
  // caminhos dos IFCs relativos ao .coordix (para levar a pasta inteira para outro computador)
  const pasta = path.dirname(destino);
  for (const m of conteudo.modelos) {
    if (m.caminho && path.isAbsolute(m.caminho)) {
      const rel = path.relative(pasta, m.caminho);
      m.caminhoRelativo = rel && !path.isAbsolute(rel) ? rel.split(path.sep).join("/") : null;
    }
  }
  const texto = JSON.stringify(conteudo, null, 1);
  // gravação atômica: arquivo temporário → cópia de segurança da versão anterior (.bak) → renomeia
  const tmp = destino + ".tmp-" + process.pid;
  await fs.promises.writeFile(tmp, texto, "utf8");
  JSON.parse(await fs.promises.readFile(tmp, "utf8")); // confere o que foi gravado antes de substituir
  try { await fs.promises.copyFile(destino, destino + ".bak"); } catch {}
  await fs.promises.rename(tmp, destino);
  for (const m of conteudo.modelos) if (m.caminho && ehIfc(m.caminho)) autorizar(m.caminho);
  return { caminho: destino, nome: path.basename(destino), salvoEm: new Date().toISOString() };
}

async function lerIfcAutorizado(evt, args) {
  origemOk(evt);
  const p = args && args.caminho;
  if (!ehIfc(p) || !carregarAutorizados().has(path.resolve(p))) throw new Error("arquivo não autorizado: selecione-o pelo COORDIX");
  return lerIfc(p);
}

async function localizarIfc(evt, args) {
  const win = origemOk(evt);
  const nome = args && typeof args.nome === "string" ? args.nome : "";
  const r = FUMACA ? { filePaths: FUMACA.arquivosDoDialogo().filter((p) => path.basename(p) === nome).slice(0, 1) } : await dialog.showOpenDialog(win, {
    title: nome ? `Localizar ${nome}` : "Localizar modelo IFC", buttonLabel: "Usar este arquivo",
    filters: [{ name: "Modelos IFC", extensions: ["ifc"] }], properties: ["openFile"],
  });
  const p = r.filePaths && r.filePaths[0];
  if (!p || !ehIfc(p)) return null;
  autorizar(p);
  return lerIfc(p);
}

function autorizarArquivo(evt, args) {
  origemOk(evt);
  const p = args && args.caminho;
  if (!ehIfc(p)) return false;
  try { if (!fs.statSync(p).isFile()) return false; } catch { return false; }
  autorizar(p);
  return true;
}

function registrar(origem, fumaca) {
  ORIGEM = origem; FUMACA = fumaca || null;
  ipcMain.handle("coordix:projeto-abrir", abrirProjeto);
  ipcMain.handle("coordix:projeto-salvar", salvarProjeto);
  ipcMain.handle("coordix:ifc-ler", lerIfcAutorizado);
  ipcMain.handle("coordix:ifc-localizar", localizarIfc);
  ipcMain.handle("coordix:autorizar-arquivo", autorizarArquivo);
}

module.exports = { registrar, lerIfc, autorizar };
