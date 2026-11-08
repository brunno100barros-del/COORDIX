/* COORDIX Desktop · orquestra o teste de fumaça (duas aberturas do aplicativo com os mesmos dados).
 * Uso:
 *   node desktop/scripts/fumaca.js                 # aplicativo em desenvolvimento (electron .)
 *   node desktop/scripts/fumaca.js caminho\COORDIX.exe   # aplicativo empacotado
 * Usa uma pasta de dados temporária e cópias temporárias de dois IFCs de exemplo; não toca nos
 * dados nem nos arquivos do usuário. Sai com código 1 se alguma verificação falhar. */
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..", "..");
const exe = process.argv[2] ? path.resolve(process.argv[2]) : require("electron");
const argsApp = process.argv[2] ? [] : [RAIZ];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "coordix-fumaca-"));
const dados = path.join(tmp, "dados");
const arquivos = ["ARQ", "SAN"].map((d) => {
  const destino = path.join(tmp, `FUMACA-${d}.ifc`);
  fs.copyFileSync(path.join(RAIZ, "exemplos", `EXEMPLO-${d}.ifc`), destino);
  return destino;
});

function rodar(fase) {
  const saida = path.join(tmp, `fase${fase}.json`);
  const t0 = Date.now();
  const p = spawnSync(exe, argsApp, {
    env: { ...process.env, COORDIX_FUMACA: "1", COORDIX_FUMACA_FASE: String(fase), COORDIX_FUMACA_DADOS: dados, COORDIX_FUMACA_SAIDA: saida, COORDIX_FUMACA_ARQUIVOS: JSON.stringify(arquivos), COORDIX_FUMACA_SEM_GPU: process.env.CI ? "1" : "" },
    stdio: "inherit", timeout: 360000,
  });
  let r = null;
  try { r = JSON.parse(fs.readFileSync(saida, "utf8")); } catch {}
  return { codigo: p.status, sinal: p.signal, ms: Date.now() - t0, r };
}

const verif = [];
const ok = (nome, cond, det) => verif.push({ nome, ok: !!cond, det: det === undefined ? undefined : det });

const f1 = rodar(1), a = f1.r && f1.r.resultado;
ok("fase 1: aplicativo abriu e terminou", f1.codigo === 0 && a, f1.r && f1.r.erro);
if (a) {
  ok("motor IFC e análise automática do projeto de exemplo", a.motor && a.pendentes0 === "21", a.pendentes0);
  ok("three.js e visualizador 3D (canvas WebGL)", a.three && a.canvas);
  ok("fontes IBM Plex locais", a.fontes.every(Boolean), a.fontes);
  ok("selo 'desenvolvido por' + BETA", /Brunno Resplandes/.test(a.selo || "") && /BETA/.test(a.selo || ""), a.selo);
  ok("8 telas abrem com conteúdo", Object.values(a.telas).every((n) => n > 50), a.telas);
  ok("resultado geométrico igual ao da versão web", /21 confirmado · 1 abaixo da tolerância · 4 contato/.test(a.geometria || ""), a.geometria);
  ok("clashes a corrigir e falsos clashes", a.abas[0] === "A corrigir (8)" && a.abas[1] === "Falsos clashes (13)", a.abas);
  ok("revisão com câmera e legenda A/B", a.revisaoCamera);
  ok("validação vira issue (21 → 20 pendentes, 1 issue)", a.pendentes1 === "20" && a.issues === 1, [a.pendentes1, a.issues]);
  ok("BCF 2.1 com tópico", a.bcf);
  ok("tema claro aplicado", a.tema === "light", a.tema);
  ok("2 IFCs carregados pelo diálogo (preload → IPC → <input>)", a.modelosCarregados && a.nomes.includes("FUMACA-ARQ.ifc") && a.nomes.includes("FUMACA-SAN.ifc"), a.nomes);
}
ok("fase 1: sem erros no console", f1.r && f1.r.consoleErros.length === 0, f1.r && f1.r.consoleErros);
ok("fase 1: nenhum recurso externo ou ausente", f1.r && f1.r.errosRede.length === 0, f1.r && f1.r.errosRede);

const f2 = rodar(2), b = f2.r && f2.r.resultado;
ok("fase 2: reabriu e terminou", f2.codigo === 0 && b, f2.r && f2.r.erro);
if (b) {
  ok("dados íntegros após fechar e abrir", b.armazenamentoOk);
  ok("decisão de revisão preservada (20 pendentes, 1 issue)", b.pendentes === "20" && b.issues === 1, [b.pendentes, b.issues]);
  ok("tema preservado", b.tema === "light", b.tema);
  ok("IFCs do usuário não ficam salvos (mesmo comportamento da web)", !b.nomes.some((n) => n.startsWith("FUMACA-")), b.nomes);
}
ok("fase 2: sem erros no console", f2.r && f2.r.consoleErros.length === 0, f2.r && f2.r.consoleErros);

const relatorio = { aplicativo: process.argv[2] ? "empacotado" : "desenvolvimento", exe, electron: f1.r && f1.r.versaoElectron, tempos_ms: [f1.ms, f2.ms], verificacoes: verif, fase1: f1.r, fase2: f2.r };
const arq = path.join(RAIZ, `desktop-fumaca-${relatorio.aplicativo}.json`);
fs.writeFileSync(arq, JSON.stringify(relatorio, null, 1));
for (const v of verif) console.log(`${v.ok ? "✔" : "✘"} ${v.nome}${v.ok ? "" : "  → " + JSON.stringify(v.det)}`);
const falhas = verif.filter((v) => !v.ok).length;
console.log(`\n${verif.length - falhas} de ${verif.length} verificações aprovadas (${relatorio.aplicativo}). Relatório: ${path.basename(arq)}`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(falhas ? 1 : 0);
