/* COORDIX Desktop · preload (contexto isolado, sandbox).
 *
 * Expõe à página só duas funções, por canais IPC específicos:
 *   coordixDesktop.abrirIfc()  diálogo nativo do Windows (vários arquivos .ifc) → [{nome, bytes}]
 *   coordixDesktop.info()      versão e rótulo do aplicativo
 * Nenhuma API do Node.js nem acesso livre ao disco chega à interface.
 *
 * Integração sem alterar o index.html: o clique (ou Enter/Espaço) na área de upload abre o diálogo
 * nativo; os arquivos escolhidos são entregues ao mesmo <input id="fileInput"> que a versão web usa,
 * então a leitura do IFC segue exatamente o mesmo caminho. Arrastar e soltar continua igual. */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

const api = {
  abrirIfc: () => ipcRenderer.invoke("coordix:abrir-ifc"),
  info: () => ipcRenderer.invoke("coordix:info"),
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
    for (const a of arquivos) dt.items.add(new File([a.bytes], a.nome, { type: "application/octet-stream", lastModified: a.modificado }));
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

/* selo da versão experimental, no canto inferior esquerdo (só no aplicativo desktop) */
window.addEventListener("DOMContentLoaded", async () => {
  let info = { versao: "", rotulo: "BETA" };
  try { info = await api.info(); } catch {}
  const selo = document.createElement("div");
  selo.id = "coordix-desktop-selo";
  selo.setAttribute("aria-label", `Desenvolvido por ${info.autor || "Eng. Brunno Resplandes"}. Versão ${info.versao} ${info.rotulo}`);
  selo.style.cssText = [
    "position:fixed", "left:16px", "bottom:12px", "z-index:40", "pointer-events:none",
    "display:flex", "flex-direction:column", "gap:4px",
    "font:500 10px/1.25 var(--font-mono, ui-monospace, monospace)", "letter-spacing:.04em", "color:var(--faint, #8b929c)",
  ].join(";");
  const autor = document.createElement("span");
  autor.textContent = "desenvolvido por " + (info.autor || "Eng. Brunno Resplandes");
  const beta = document.createElement("span");
  beta.textContent = `${info.rotulo} · v${info.versao}`;
  beta.style.cssText = "align-self:flex-start;padding:2px 6px;border:1px solid var(--accent-line, #dfb391);color:var(--accent, #a84d1c);border-radius:2px;font-weight:600;letter-spacing:.1em";
  selo.append(autor, beta);
  document.body.appendChild(selo);
});
