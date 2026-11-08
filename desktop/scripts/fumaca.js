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
const hash = (p) => require("crypto").createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const arquivos = ["ARQ", "SAN"].map((d) => {
  const destino = path.join(tmp, `FUMACA-${d}.ifc`);
  // cópia deslocada para coordenadas de georreferência (≈ 512 km E, 9.030 km N, como um IFC exportado em UTM):
  // testa a origem local do projeto e o desenho relativo ao centro. O mesmo deslocamento nos dois arquivos.
  const txt = fs.readFileSync(path.join(RAIZ, "exemplos", `EXEMPLO-${d}.ifc`), "latin1");
  if (!txt.includes("#15=IFCLOCALPLACEMENT($,#4);")) throw new Error("posicionamento do terreno não encontrado em EXEMPLO-" + d);
  // o terreno (#15) vai para o ponto georreferenciado e os demais posicionamentos absolutos passam a ser relativos a ele
  fs.writeFileSync(destino, txt.split("IFCLOCALPLACEMENT($,").join("IFCLOCALPLACEMENT(#15,").replace("#15=IFCLOCALPLACEMENT(#15,#4);", "#15=IFCLOCALPLACEMENT($,#999002);")
    .replace("DATA;", "DATA;\n#999001=IFCCARTESIANPOINT((512345678.,9030612345.,0.));\n#999002=IFCAXIS2PLACEMENT3D(#999001,$,$);"), "latin1");
  return destino;
});

const hashesAntes = arquivos.map(hash);
function rodar(fase) {
  const saida = path.join(tmp, `fase${fase}.json`);
  const t0 = Date.now();
  const p = spawnSync(exe, argsApp, {
    env: { ...process.env, COORDIX_FUMACA: "1", COORDIX_FUMACA_FASE: String(fase), COORDIX_FUMACA_DADOS: dados, COORDIX_FUMACA_SAIDA: saida, COORDIX_FUMACA_ARQUIVOS: JSON.stringify(arquivos), COORDIX_FUMACA_PASTA: tmp, COORDIX_FUMACA_SEM_GPU: process.env.CI ? "1" : "" },
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
  ok("versão e desenvolvedor em 'Sobre o COORDIX' (fora da faixa vertical)", a.semSelo && /Brunno Resplandes/.test(a.sobre || "") && /Desktop/.test(a.sobre || "") && /beta/i.test(a.sobre || ""), a.sobre);
  ok("8 telas abrem com conteúdo", Object.values(a.telas).every((n) => n > 50), a.telas);
  // leitor web-ifc 0.0.78 (desktop 0.3.0): mesmos 21 confirmados e 1 abaixo da tolerância; 10 contatos (eram 4 com o
  // leitor 0.0.39, que gerava 4 elementos como sólidos inválidos); mesma classificação (8 a corrigir, 13 falsos)
  ok("resultado geométrico de referência (leitor 0.0.78)", /21 confirmado · 1 abaixo da tolerância · 10 contato · Elementos analisados: 33 sólidos válidos/.test(a.geometria || ""), a.geometria);
  ok("clashes a corrigir e falsos clashes", a.abas[0] === "A corrigir (8)" && a.abas[1] === "Falsos clashes (13)", a.abas);
  ok("revisão com câmera e legenda A/B", a.revisaoCamera);
  ok("validação vira issue (21 → 20 pendentes, 1 issue)", a.pendentes1 === "20" && a.issues === 1, [a.pendentes1, a.issues]);
  ok("BCF 2.1 com tópico", a.bcf);
  ok("tema claro aplicado", a.tema === "light", a.tema);
  ok("2 IFCs carregados pelo diálogo (preload → IPC → <input>)", a.modelosCarregados && a.nomes.includes("FUMACA-ARQ.ifc") && a.nomes.includes("FUMACA-SAN.ifc"), a.nomes);
  ok("disciplina MET (Estrutura Metálica) nas regras", a.met);
  ok("nenhuma menção a 'Visus' na interface", a.visus === false);
  ok("IFC georreferenciado misturado ao projeto de exemplo: alerta de outro sistema de coordenadas", a.alertaSistema, a.alertaSistema);
  ok("projeto novo: origem local definida pelos IFCs georreferenciados (≈ 9.030 km) e sem alerta", a.diag && Array.isArray(a.diag.origem) && Math.max(...a.diag.origem.map(Math.abs)) > 9e6 && !a.alertaNovo, [a.diag, a.alertaNovo]);
  ok("desenho relativo ao centro: vértices pequenos (precisão Float32 preservada)", a.diag && a.diag.malhas > 0 && a.diag.maiorVertice < 200, a.diag);
  console.log("  análise do projeto novo (IFCs georreferenciados): " + a.analiseNovo);
  ok("novo projeto com 2 IFCs e análise em segundo plano", a.novoModelos && a.painelProgresso && !!a.analiseNovo, [a.novoModelos, a.painelProgresso, a.analiseNovo]);
  ok("Salvar projeto (.coordix)", !!a.salvo && /Projeto Fumaça\.coordix/.test(a.indicadorArquivo || ""), [a.salvo, a.indicadorArquivo]);
  ok("Excluir projeto: confirmação com o nome e aviso de que nenhum arquivo é apagado", /Projeto Fumaça/.test(a.confirmacaoExclusao || "") && /não são apagados/.test(a.confirmacaoExclusao || "") && !!a.excluido && !a.projetosAposExcluir.some((n) => /Fumaça/.test(n)), [a.confirmacaoExclusao, a.projetosAposExcluir]);
  ok("Abrir projeto: IFCs reencontrados pelas referências e análise refeita igual", !!a.aberto && a.reanalise && a.analiseReaberto === a.analiseNovo && a.modelosReaberto.includes("FUMACA-ARQ.ifc") && a.modelosReaberto.includes("FUMACA-SAN.ifc"), [a.aberto, a.analiseNovo, a.analiseReaberto, a.modelosReaberto]);
}
let projetoArq = null;
try { projetoArq = JSON.parse(fs.readFileSync(path.join(tmp, "Projeto Fumaça.coordix"), "utf8")); } catch {}
ok("arquivo .coordix versionado, com referências (sem copiar os IFCs) e resultados", projetoArq && projetoArq.formato === "coordix-projeto" && projetoArq.versao === 1 && projetoArq.modelos.length === 2 && projetoArq.modelos.every((m) => /^[0-9a-f]{64}$/.test(m.sha256 || "") && m.caminho && m.caminhoRelativo) && Array.isArray(projetoArq.resultados.clashes) && fs.statSync(path.join(tmp, "Projeto Fumaça.coordix")).size < 2e6,
  projetoArq && { modelos: projetoArq.modelos, clashes: projetoArq.resultados && projetoArq.resultados.clashes.length });
ok("IFCs originais intactos depois de salvar, excluir e abrir o projeto", arquivos.every((p, i) => fs.existsSync(p) && hash(p) === hashesAntes[i]));
ok("fase 1: sem erros no console", f1.r && f1.r.consoleErros.length === 0, f1.r && f1.r.consoleErros);
ok("fase 1: nenhum recurso externo ou ausente", f1.r && f1.r.errosRede.length === 0, f1.r && f1.r.errosRede);

const f2 = rodar(2), b = f2.r && f2.r.resultado;
ok("fase 2: reabriu e terminou", f2.codigo === 0 && b, f2.r && f2.r.erro);
if (b) {
  ok("dados íntegros após fechar e abrir", b.armazenamentoOk);
  ok("decisão de revisão preservada (20 pendentes, 1 issue)", b.pendentes === "20" && b.issues === 1, [b.pendentes, b.issues]);
  ok("tema preservado", b.tema === "light", b.tema);
  ok("IFCs do usuário não ficam salvos (mesmo comportamento da web)", !b.nomes.some((n) => n.startsWith("FUMACA-")), b.nomes);
  ok("recuperação: projeto continua no COORDIX e reabre os IFCs vinculados", b.projetoRecuperado && b.vinculados && b.recarregados && a && b.analiseRecuperada === a.analiseNovo, [b.projetoRecuperado, b.vinculados, b.recarregados, b.analiseRecuperada]);
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
