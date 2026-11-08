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
function projetoParaSalvar(nome) { return require("path").join(env.COORDIX_FUMACA_PASTA, nome); }
function projetoParaAbrir() { return require("path").join(env.COORDIX_FUMACA_PASTA, "Projeto Fumaça.coordix"); }
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
    // versão e desenvolvedor: em "Sobre o COORDIX" (não mais na faixa vertical)
    r.semSelo = !$('#coordix-desktop-selo');
    $('#aboutBtn')?.click(); await sl(600);
    r.sobre = $('#aboutKv')?.innerText || null; $('[data-about-close]')?.click(); await sl(200);
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
    // identidade: disciplina MET nas regras e nenhum "Visus" nos textos da interface
    let textos = '';
    for (const v of ['projeto','modelos','visualizador','regras','clashes','revisao','issues','bcf']) {
      $('[data-nav=' + v + ']')?.click(); await sl(400); textos += ' ' + ($('#main').innerText || '');
      if (v === 'regras') { const sels = [...document.querySelectorAll('#main select')]; r.metTestes = sels.filter(x => x.value === 'MET').length; r.metOpcao = sels.some(x => [...x.options].some(o => o.textContent === 'Estrutura Metálica')); }
    }
    r.met = r.metTestes >= 7 && r.metOpcao;
    r.visus = /visus/i.test(textos + ' ' + document.body.innerText);
    // projeto: Novo → IFCs → análise → Salvar → Excluir → Abrir (com os IFCs reencontrados pelas referências)
    const toastCom = (re) => esperar(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).find(t => re.test(t)), 120000);
    const geo = () => [...document.querySelectorAll('#main .muted')].map(e => e.textContent).find(t => t.includes('Pares verificados')) || null;
    $('#projMenuBtn')?.click(); await sl(200); $('#newProjectBtn')?.click(); await sl(800);
    const nome = $('#pName'); if (nome) { nome.value = 'Projeto Fumaça'; nome.dispatchEvent(new Event('change', { bubbles: true })); } await sl(400);
    $('[data-nav=modelos]')?.click(); await sl(500);
    $('#drop')?.click();
    r.novoModelos = !!(await esperar(() => document.querySelectorAll('#main tbody tr').length >= 2 && (document.querySelector('#main tbody')?.innerText.match(/FUMACA-/g) || []).length >= 2 && !/Lendo|lendo/.test(document.querySelector('#main tbody')?.innerText || ''), 120000));
    $('[data-nav=clashes]')?.click(); await sl(400);
    $('[data-run]')?.click();
    r.painelProgresso = !!(await esperar(() => $('#progressPanel:not([hidden])') || [...document.querySelectorAll('.toast')].some(t => /clashes encontrados/.test(t.textContent)), 20000));
    r.analiseNovo = (await toastCom(/clashes encontrados/)) ? geo() : null;
    await sl(800);
    $('#projMenuBtn')?.click(); await sl(200); $('[data-pact=salvar]')?.click();
    r.salvo = await toastCom(/Projeto salvo/);
    r.indicadorArquivo = $('#projFile')?.textContent || null;
    await sl(500);
    $('#projMenuBtn')?.click(); await sl(200); $('[data-pact=excluir]')?.click(); await sl(600);
    r.confirmacaoExclusao = $('#confirmDlg[open]')?.innerText || null;
    $('#confirmDlg .btn.danger')?.click();
    r.excluido = await toastCom(/excluído/);
    r.projetosAposExcluir = [...document.querySelectorAll('#projectSelect option')].map(o => o.textContent);
    await sl(500);
    $('#projMenuBtn')?.click(); await sl(200); $('[data-pact=abrir]')?.click();
    r.aberto = await toastCom(/aberto/);
    r.reanalise = (await toastCom(/clashes encontrados/)) ? true : false;
    $('[data-nav=clashes]')?.click(); await sl(500);
    r.analiseReaberto = geo();
    $('[data-nav=modelos]')?.click(); await sl(500);
    r.modelosReaberto = [...document.querySelectorAll('#main tbody tr')].map(tr => tr.cells[0]?.innerText.split('\n')[0]).filter(Boolean);
    await sl(1500); // gravação do localStorage (atraso de 250 ms no app) e fim de leitura
    return r;
  })()`,
  "2": `(async () => {
    const sl = ms => new Promise(r => setTimeout(r, ms)), $ = s => document.querySelector(s), r = {};
    const esperar = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = f(); if (v) return v; await sl(250); } return null; };
    // a fase 1 terminou no projeto reaberto; as conferências de persistência são feitas no projeto de exemplo
    await sl(1500);
    { const sel = $('#projectSelect'); if (sel && sel.value !== 'exemplo') { sel.value = 'exemplo'; sel.dispatchEvent(new Event('change', { bubbles: true })); } }
    r.motor = !!(await esperar(() => $('#reviewPill:not([hidden]) .num'), 120000));
    r.pendentes = $('#reviewPill .num')?.textContent || null;
    r.tema = document.documentElement.dataset.theme;
    $('[data-nav=issues]')?.click(); await sl(600);
    r.issues = document.querySelectorAll('tr[data-issue]').length;
    $('[data-nav=modelos]')?.click(); await sl(600);
    r.nomes = [...document.querySelectorAll('#main tbody tr')].map(tr => tr.cells[0]?.innerText.split('\\n')[0]).filter(Boolean);
    try { r.armazenamentoOk = !!JSON.parse(localStorage.getItem('bimora.v1')).projects.length; } catch (e) { r.armazenamentoOk = false; }
    // recuperação: o projeto salvo continua no COORDIX e reabre os IFCs vinculados pelo botão "Carregar todos"
    const sel = $('#projectSelect'), op = [...(sel?.options || [])].find(o => /Projeto Fumaça/.test(o.textContent));
    r.projetoRecuperado = !!op;
    if (op) {
      sel.value = op.value; sel.dispatchEvent(new Event('change', { bubbles: true })); await sl(800);
      $('[data-nav=modelos]')?.click(); await sl(600);
      r.vinculados = /Modelos vinculados ao projeto/.test($('#main').innerText);
      $('[data-link=todos]')?.click();
      const ok = await esperar(() => [...document.querySelectorAll('.toast')].some(t => /clashes encontrados/.test(t.textContent)), 120000);
      r.recarregados = !!ok;
      $('[data-nav=clashes]')?.click(); await sl(500);
      r.analiseRecuperada = [...document.querySelectorAll('#main .muted')].map(e => e.textContent).find(t => t.includes('Pares verificados')) || null;
    }
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

module.exports = { configurar, arquivosDoDialogo, projetoParaSalvar, projetoParaAbrir, executar };
