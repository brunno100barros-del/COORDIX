/* COORDIX Desktop · preload (contexto isolado, sandbox).
 *
 * Expõe à página, por canais IPC específicos e validados no processo principal:
 *   coordixDesktop.abrirIfc()                diálogo nativo (vários .ifc) → [{nome, caminho, bytes, sha256, …}]
 *   coordixDesktop.info()                    versão, rótulo e desenvolvedor
 *   coordixDesktop.origemDoArquivo(file)     caminho de um IFC escolhido/solto pelo usuário (para o projeto referenciar)
 *   coordixDesktop.projeto.abrir()           diálogo → conteúdo do .coordix + situação de cada IFC referenciado
 *   coordixDesktop.projeto.salvar({...})     grava o .coordix (Salvar / Salvar como)
 *   coordixDesktop.ifc.ler(caminho)          lê um IFC já autorizado (referenciado por projeto aberto pelo usuário)
 *   coordixDesktop.ifc.localizar(nome)       diálogo para localizar um IFC ausente
 * Nenhuma API do Node.js nem acesso livre ao disco chega à interface.
 *
 * Integração sem alterar o caminho de leitura: o clique (ou Enter/Espaço) na área de upload abre o
 * diálogo nativo; os arquivos escolhidos são entregues ao mesmo <input id="fileInput"> da versão web. */
"use strict";
const { contextBridge, ipcRenderer, webUtils } = require("electron");

// origem dos arquivos entregues à página: nome|tamanho|modificado → caminho no disco
const origens = new Map();
const chave = (nome, tamanho, modificado) => `${nome}|${tamanho}|${Math.round(modificado || 0)}`;

const api = {
  abrirIfc: () => ipcRenderer.invoke("coordix:abrir-ifc"),
  info: () => ipcRenderer.invoke("coordix:info"),
  origemDoArquivo: (f) => {
    if (!f || typeof f.name !== "string") return null;
    return origens.get(chave(f.name, f.size, f.lastModified)) || null;
  },
  projeto: Object.freeze({
    abrir: () => ipcRenderer.invoke("coordix:projeto-abrir"),
    salvar: (args) => ipcRenderer.invoke("coordix:projeto-salvar", args),
  }),
  ifc: Object.freeze({
    ler: (caminho) => ipcRenderer.invoke("coordix:ifc-ler", { caminho }),
    localizar: (nome) => ipcRenderer.invoke("coordix:ifc-localizar", { nome }),
  }),
};
contextBridge.exposeInMainWorld("coordixDesktop", Object.freeze(api));

let ocupado = false;
async function selecionarIfc() {
  if (ocupado) return;
  ocupado = true;
  try {
    const arquivos = await api.abrirIfc();
    if (!arquivos || !arquivos.length) return;
    const entrada = document.getElementById("fileInput");
    if (!entrada) return;
    const dt = new DataTransfer();
    for (const a of arquivos) {
      origens.set(chave(a.nome, a.bytes.byteLength, a.modificado), a.caminho);
      dt.items.add(new File([a.bytes], a.nome, { type: "application/octet-stream", lastModified: Math.round(a.modificado) }));
    }
    entrada.files = dt.files;
    entrada.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (e) {
    console.error("COORDIX Desktop: falha ao abrir os arquivos IFC", e);
  } finally { ocupado = false; }
}

// a área de upload (#drop) abre o diálogo nativo controlado em vez do seletor do <input>
window.addEventListener("click", (e) => {
  const alvo = e.target instanceof Element ? e.target.closest("#drop") : null;
  if (!alvo) return;
  e.preventDefault(); e.stopImmediatePropagation();
  selecionarIfc();
}, true);
window.addEventListener("keydown", (e) => {
  if (!(e.target instanceof Element) || e.target.id !== "drop" || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault(); e.stopImmediatePropagation();
  selecionarIfc();
}, true);
// arquivos soltos na janela: registra o caminho real (só o Electron o conhece) para o projeto poder referenciá-los
window.addEventListener("drop", (e) => {
  const fs = e.dataTransfer && e.dataTransfer.files;
  if (!fs) return;
  for (const f of fs) {
    let p = "";
    try { p = webUtils.getPathForFile(f); } catch {}
    if (p && /\.ifc$/i.test(p)) { origens.set(chave(f.name, f.size, f.lastModified), p); ipcRenderer.invoke("coordix:autorizar-arquivo", { caminho: p }).catch(() => {}); }
  }
}, true);

/* versão e desenvolvedor: exibidos em "Sobre o COORDIX" (botão ⓘ na barra superior), via coordixDesktop.info() */
