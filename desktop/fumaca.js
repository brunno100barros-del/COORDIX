/* COORDIX Desktop · teste de fumaça executado dentro do próprio aplicativo.
 *
 * Só é carregado quando a variável COORDIX_FUMACA está definida (ver desktop/scripts/fumaca.js).
 * Usa uma pasta de dados temporária, nunca a do usuário. O diálogo nativo é substituído pela lista
 * de arquivos em COORDIX_FUMACA_ARQUIVOS (o resto do caminho, preload → IPC → leitura → <input>,
 * é o mesmo do uso normal).
 *   fase 1: abre, espera a análise do projeto de exemplo, percorre as telas, valida um clash,
 *           escolhe o tema claro e carrega IFCs pelo caminho do diálogo.
 *   fase 2: reabre com os mesmos dados e confere se decisões, issue e tema continuam lá. */
"use strict";
const fs = require("fs");

const env = process.env;
const fase = env.COORDIX_FUMACA_FASE || "1";

function configurar(app) {
  if (env.COORDIX_FUMACA_DADOS) app.setPath("userData", env.COORDIX_FUMACA_DADOS);
  // máquinas de integração contínua não têm GPU: WebGL por renderização em software (só no teste)
  if (env.COORDIX_FUMACA_SEM_GPU) app.commandLine.appendSwitch("enable-unsafe-swiftshader");
}
function arquivosDoDialogo() {
  try { return JSON.parse(env.COORDIX_FUMACA_ARQUIVOS || "[]"); } catch { return []; }
}

const PASSOS = {
  "1": `(async () => {
    const sl = ms => new Promise(r => setTimeout(r, ms)), $ = s => document.querySelector(s), r = {};
    const esperar = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = f(); if (v) return v; await sl(250); } return null; };
    r.motor = !!(await esperar(() => $('#reviewPill:not([hidden]) .num'), 120000));
    r.pendentes0 = $('#reviewPill .num')?.textContent || null;
    r.three = typeof THREE === 'object' && !!THREE.WebGLRenderer;
    r.canvas = !!$('#viewer canvas');
    await document.fonts.ready;
    r.fontes = [];
    for (const f of ['400 12px "IBM Plex Sans"', '400 12px "IBM Plex Mono"', '600 12px "IBM Plex Sans Condensed"']) {
      try { r.fontes.push((await document.fonts.load(f, 'Ação')).length > 0 && document.fonts.check(f, 'Ação')); } catch (e) { r.fontes.push(false); }
    }
    r.selo = $('#coordix-desktop-selo')?.innerText || null;
    r.telas = {};
    for (const v of ['projeto','modelos','visualizador','regras','clashes','revisao','issues','bcf']) {
      $('[data-nav=' + v + ']')?.click(); await sl(700); r.telas[v] = ($('#main').innerText || '').length;
    }
    $('[data-nav=clashes]')?.click(); await sl(500);
    r.geometria = [...document.querySelectorAll('#main .muted')].map(e => e.textContent).find(t => t.includes('Pares verificados')) || null;
    r.abas = [$('[data-ctab=real]')?.textContent, $('[data-ctab=fake]')?.textContent];
    $('[data-nav=revisao]')?.click(); await sl(1500);
    r.revisaoCamera = !!$('#viewer canvas') && !$('#vlegend').hidden;
    $('#rvConfirm')?.click(); await sl(1200);
    r.pendentes1 = $('#reviewPill .num')?.textContent || null;
    $('[data-nav=issues]')?.click(); await sl(500);
    r.issues = document.querySelectorAll('tr[data-issue]').length;
    $('[data-nav=bcf]')?.click(); await sl(500);
    r.bcf = ($('#xml-mk')?.textContent || '').includes('<Topic');
    document.querySelector('[data-theme-set=light]')?.click(); await sl(400);
    r.tema = document.documentElement.dataset.theme;
    // IFCs pelo diálogo (preload → IPC → <input id="fileInput">)
    $('[data-nav=modelos]')?.click(); await sl(600);
    const antes = document.querySelectorAll('#main tbody tr').length;
    $('#drop')?.click();
    r.modelosCarregados = !!(await esperar(() => document.querySelectorAll('#main tbody tr').length >= antes + 2 && (document.body.innerText.match(/FUMACA-/g) || []).length >= 2, 120000));
    r.linhasModelos = [antes, document.querySelectorAll('#main tbody tr').length];
    r.nomes = [...document.querySelectorAll('#main tbody tr')].map(tr => tr.cells[0]?.innerText.split('\\n')[0]).filter(Boolean);
    await sl(1500); // gravação do localStorage (atraso de 250 ms no app) e fim de leitura
    return r;
  })()`,
  "2": `(async () => {
    const sl = ms => new Promise(r => setTimeout(r, ms)), $ = s => document.querySelector(s), r = {};
    const esperar = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = f(); if (v) return v; await sl(250); } return null; };
    r.motor = !!(await esperar(() => $('#reviewPill:not([hidden]) .num'), 120000));
    r.pendentes = $('#reviewPill .num')?.textContent || null;
    r.tema = document.documentElement.dataset.theme;
    $('[data-nav=issues]')?.click(); await sl(600);
    r.issues = document.querySelectorAll('tr[data-issue]').length;
    $('[data-nav=modelos]')?.click(); await sl(600);
    r.nomes = [...document.querySelectorAll('#main tbody tr')].map(tr => tr.cells[0]?.innerText.split('\\n')[0]).filter(Boolean);
    try { r.armazenamentoOk = !!JSON.parse(localStorage.getItem('bimora.v1')).projects.length; } catch (e) { r.armazenamentoOk = false; }
    return r;
  })()`,
};

function executar(win, errosRede) {
  const { app } = require("electron");
  const consoleErros = [];
  win.webContents.on("console-message", (...args) => {
    const d = args[0] && typeof args[0] === "object" && "level" in args[0] ? args[0] : { level: args[1], message: args[2] };
    const nivel = d.level === 3 || d.level === "error" ? "error" : d.level;
    if (nivel === "error") consoleErros.push(String(d.message));
  });
  const terminar = (resultado, codigo) => {
    try { fs.writeFileSync(env.COORDIX_FUMACA_SAIDA, JSON.stringify(resultado, null, 1)); } catch (e) { console.error(e); }
    setTimeout(() => app.exit(codigo), 300); // sai como o usuário sairia; before-quit grava o armazenamento
  };
  const limite = setTimeout(() => terminar({ fase, erro: "tempo esgotado", consoleErros, errosRede }, 1), 300000);
  win.webContents.once("did-finish-load", async () => {
    try {
      const r = await win.webContents.executeJavaScript(PASSOS[fase], true);
      clearTimeout(limite);
      require("electron").session.defaultSession.flushStorageData();
      terminar({ fase, resultado: r, consoleErros, errosRede, versaoElectron: process.versions.electron, empacotado: app.isPackaged }, 0);
    } catch (e) {
      clearTimeout(limite);
      terminar({ fase, erro: String(e && e.stack || e), consoleErros, errosRede }, 1);
    }
  });
}

module.exports = { configurar, arquivosDoDialogo, executar };
