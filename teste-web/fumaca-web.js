/* Teste de fumaça da versão WEB (branch temporária de teste; não vai para a main).
 * Serve a pasta por HTTP, abre o COORDIX no Chromium (Playwright) e percorre o mesmo roteiro do desktop. */
"use strict";
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), os = require("os");
const RAIZ = path.resolve(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "coordix-web-"));
const arquivos = ["ARQ", "SAN"].map((d) => {
  const txt = fs.readFileSync(path.join(RAIZ, "exemplos", `EXEMPLO-${d}.ifc`), "latin1");
  const out = txt.split("IFCLOCALPLACEMENT($,").join("IFCLOCALPLACEMENT(#15,").replace("#15=IFCLOCALPLACEMENT(#15,#4);", "#15=IFCLOCALPLACEMENT($,#999002);")
    .replace("DATA;", "DATA;\n#999001=IFCCARTESIANPOINT((512345678.,9030612345.,0.));\n#999002=IFCAXIS2PLACEMENT3D(#999001,$,$);");
  const p = path.join(tmp, `FUMACA-${d}.ifc`); fs.writeFileSync(p, out, "latin1"); return p;
});
const res = [];
const ok = (nome, cond, det) => { res.push(!!cond); console.log(`${cond ? "✔" : "✘"} ${nome}${cond ? "" : "  → " + JSON.stringify(det)}`); };
(async () => {
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const erros = [], falhas = [];
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("requestfailed", (r) => falhas.push(r.url()));
  await page.goto("http://localhost:8000/", { waitUntil: "load" });
  const $ = (s) => page.locator(s).first();
  const sl = (ms) => page.waitForTimeout(ms);
  const geo = () => page.evaluate(() => [...document.querySelectorAll("#main .muted")].map((e) => e.textContent).find((t) => t.includes("Pares verificados")) || null);
  const toast = (re) => page.waitForFunction((src) => [...document.querySelectorAll(".toast")].some((t) => new RegExp(src).test(t.textContent)), re.source, { timeout: 180000 }).then(() => true, () => false);
  const motor = await page.waitForSelector("#reviewPill:not([hidden]) .num", { timeout: 180000 }).then(() => true, () => false);
  ok("motor IFC (web-ifc 0.0.78 por CDN) e análise automática do exemplo", motor);
  ok("versão 2.5 em 'Sobre'", await (async () => { await $("#aboutBtn").click(); await sl(500); const t = await $("#aboutKv").innerText(); await $("[data-about-close]").click(); return /2\.5/.test(t); })());
  const telas = {};
  for (const v of ["projeto", "modelos", "visualizador", "regras", "clashes", "revisao", "issues", "bcf"]) { await $(`[data-nav=${v}]`).click(); await sl(600); telas[v] = (await $("#main").innerText()).length; }
  ok("8 telas abrem com conteúdo", Object.values(telas).every((n) => n > 50), telas);
  await $("[data-nav=clashes]").click(); await sl(500);
  const g = await geo();
  ok("resultado geométrico de referência (igual ao desktop 0.4.0)", /21 confirmado · 1 abaixo da tolerância · 10 contato · Elementos analisados: 33 sólidos válidos/.test(g || ""), g);
  await $("[data-nav=revisao]").click(); await sl(1200);
  await $("#rvConfirm").click(); await sl(1000);
  ok("validação vira issue (21 → 20 pendentes)", (await $("#reviewPill .num").innerText()) === "20");
  await $("[data-nav=bcf]").click(); await sl(500);
  ok("BCF 2.1 com tópico", ((await $("#xml-mk").textContent()) || "").includes("<Topic"));
  await $("[data-nav=regras]").click(); await sl(500);
  const met = await page.evaluate(() => { const s = [...document.querySelectorAll("#main select")]; return { n: s.filter((x) => x.value === "MET").length, op: s.some((x) => [...x.options].some((o) => o.textContent === "Estrutura Metálica")) }; });
  ok("disciplina MET com 7 testes", met.n >= 7 && met.op, met);
  ok("nenhuma menção a 'Visus' na interface", !/visus/i.test(await page.evaluate(() => document.body.innerText)));
  // IFCs georreferenciados no projeto de exemplo → alerta de outro sistema de coordenadas
  await $("[data-nav=modelos]").click(); await sl(500);
  await $("#fileInput").setInputFiles(arquivos);
  await page.waitForFunction(() => (document.querySelector("#main tbody")?.innerText.match(/FUMACA-/g) || []).length >= 2 && !/Lendo|lendo/.test(document.querySelector("#main tbody")?.innerText || "") && document.querySelectorAll("#main tbody .chip.ok").length >= 8, null, { timeout: 180000 }).catch(() => {});
  ok("IFC georreferenciado misturado ao exemplo: alerta de outro sistema de coordenadas", /km dos demais modelos do projeto/.test(await $("#main").innerText()));
  // projeto novo com os IFCs georreferenciados
  await $("#projMenuBtn").click(); await sl(200); await $("#newProjectBtn").click(); await sl(800);
  await $("#pName").fill("Projeto Web"); await $("#pName").dispatchEvent("change"); await sl(300);
  await $("[data-nav=modelos]").click(); await sl(500);
  await $("#fileInput").setInputFiles(arquivos);
  await page.waitForFunction(() => document.querySelectorAll("#main tbody .chip.ok").length >= 2, null, { timeout: 180000 }).catch(() => {});
  const alertaNovo = /km dos demais modelos do projeto/.test(await $("#main").innerText());
  await $("[data-nav=visualizador]").click(); await sl(800);
  const diag = await page.evaluate(() => window.coordixDiagnostico && window.coordixDiagnostico());
  ok("projeto novo: origem local ≈ 9.030 km e sem alerta", diag && Math.max(...diag.origem.map(Math.abs)) > 9e6 && !alertaNovo, [diag, alertaNovo]);
  ok("desenho relativo ao centro: vértices pequenos", diag && diag.malhas > 0 && diag.maiorVertice < 200, diag);
  await page.screenshot({ path: path.join(RAIZ, "teste-web", "visualizador-georreferenciado.png") });
  await $("[data-nav=clashes]").click(); await sl(300);
  await $("[data-run]").click();
  const painel = await page.waitForSelector("#progressPanel:not([hidden])", { timeout: 20000 }).then(() => true, () => false);
  const fim = await toast(/clashes encontrados/);
  const gNovo = await geo();
  ok("análise em segundo plano com painel de progresso", fim && !!gNovo, [painel, fim, gNovo]);
  console.log("  análise do projeto novo: " + gNovo);
  // Etapa 1 · camada de dados
  const dados = await page.evaluate(async () => {
    const q1 = await window.coordixDados.consultar({ filtros: [{ campo: "classe", op: "=", valor: "IFCWALL" }, { campo: "pset:Pset_WallCommon.Reference", op: "existe" }] });
    const q2 = await window.coordixDados.consultar({});
    return { paredes: q1 && q1.itens.length, consultados: q2 && q2.consultados, modelos: q2 && q2.modelos.length };
  });
  ok("camada de dados: 4 paredes com Pset_WallCommon lidas do leitor aberto, 2 modelos", dados.paredes === 4 && dados.consultados > 0 && dados.modelos === 2, dados);
  // Etapa 1 · disciplinas
  await $("[data-nav=projeto]").click(); await sl(500);
  await $("#dSig").fill("EST"); await $("#dNome").fill("Duplicada"); await $("#addDisc").click(); await sl(300);
  ok("disciplinas: sigla do catálogo padrão recusada", /catálogo padrão/.test(await $("#discErr").innerText()));
  await $("#dSig").fill("drn"); await $("#dNome").fill("Drenagem"); await $("#addDisc").click(); await sl(600);
  ok("disciplinas: DRN cadastrada", await page.locator('tr[data-disc-row="DRN"]').count() === 1);
  await $('[data-disc-toggle="SPD"]').click(); await sl(400);
  const inat = /Inativa/.test(await $('tr[data-disc-row="SPD"]').innerText());
  await $('[data-disc-toggle="SPD"]').click(); await sl(400);
  ok("disciplinas: desativar e reativar", inat && !/Inativa/.test(await $('tr[data-disc-row="SPD"]').innerText()));
  await page.screenshot({ path: path.join(RAIZ, "teste-web", "disciplinas.png"), fullPage: true });
  // Etapa 1 · seleção
  await $("[data-nav=regras]").click(); await sl(600);
  ok("disciplinas: DRN disponível na matriz", await page.evaluate(() => [...document.querySelectorAll("#main tr[data-test] select")].some((s) => [...s.options].some((o) => o.textContent === "Drenagem"))));
  const est = () => page.evaluate(() => [...document.querySelectorAll("#main tr[data-test]")].map((tr) => [tr.dataset.test, tr.querySelector("[data-tf=on]").checked, tr.querySelector("[data-tf=tol]").value]));
  const orig = await est();
  await page.locator('[data-selcmd="0"][data-selgrp="testes"]').click(); await sl(500);
  const d0 = await est();
  ok("seleção: desmarcar tudo sem mudar tolerâncias", d0.every((x) => !x[1]) && d0.every((x, i) => x[2] === orig[i][2]));
  await $("#testFiltro").selectOption("MET"); await sl(500);
  const vis = (await est()).length;
  await page.locator('[data-selcmd="1"][data-selgrp="testes"]').click(); await sl(500);
  const aviso = /oculto.s. pelo filtro/.test(await $('.selbar[data-selgrp="testes"]').innerText());
  await page.screenshot({ path: path.join(RAIZ, "teste-web", "selecao.png") });
  await $("#testFiltro").selectOption(""); await sl(500);
  const d1 = await est();
  ok("seleção: com filtro só os visíveis, ocultos informados, estado intermediário", vis > 0 && vis < orig.length && d1.filter((x) => x[1]).length === vis && aviso && await page.evaluate(() => document.querySelector('[data-selall="testes"]').indeterminate), [vis, aviso]);
  for (const [id, on] of orig) { const cb = page.locator(`tr[data-test="${id}"] [data-tf=on]`); if ((await cb.isChecked()) !== on) await cb.setChecked(on); }
  await sl(400);
  ok("seleção: estado original restaurado", JSON.stringify(await est()) === JSON.stringify(orig));
  await page.evaluate(() => { document.documentElement.setAttribute("data-theme", "dark"); });
  await $("[data-nav=projeto]").click(); await sl(500);
  await page.screenshot({ path: path.join(RAIZ, "teste-web", "disciplinas-escuro.png"), fullPage: true });
  await page.evaluate(() => { document.documentElement.setAttribute("data-theme", "light"); });
  // salvar (.coordix baixado), excluir e abrir
  await $("#projMenuBtn").click(); await sl(200);
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), $("[data-pact=salvar]").click()]);
  const arq = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(arq);
  const o = JSON.parse(fs.readFileSync(arq, "utf8"));
  ok("projeto salvo como .coordix (formato, referências SHA-256, origem local)", o.formato === "coordix-projeto" && o.versao === 1 && o.modelos.length === 2 && o.modelos.every((m) => /^[0-9a-f]{64}$/.test(m.sha256)) && Array.isArray(o.projeto.origemLocal) && o.projeto.disciplinas.extras.some((d) => d.sigla === "DRN"), { formato: o.formato, modelos: o.modelos.length, origem: o.projeto.origemLocal, nome: dl.suggestedFilename() });
  await sl(500);
  await $("#projMenuBtn").click(); await sl(200); await $("[data-pact=excluir]").click(); await sl(500);
  await $("#confirmDlg .btn.danger").click();
  ok("projeto excluído com confirmação", await toast(/excluído/));
  await $("#projMenuBtn").click(); await sl(200);
  const [fc] = await Promise.all([page.waitForEvent("filechooser", { timeout: 10000 }), $("[data-pact=abrir]").click()]);
  await fc.setFiles(arq);
  ok("projeto reaberto do arquivo", await toast(/aberto/));
  await $("[data-nav=modelos]").click(); await sl(600);
  ok("modelos vinculados listados para recarregar", /Modelos vinculados ao projeto/i.test(await $("#main").innerText()));
  ok("sem erros no console", erros.length === 0, erros.slice(0, 5));
  ok("sem requisições com falha", falhas.filter((u) => !/fonts\./.test(u)).length === 0, falhas.slice(0, 5));
  await browser.close();
  const n = res.filter(Boolean).length;
  console.log(`\n${n} de ${res.length} verificações aprovadas (web).`);
  process.exit(n === res.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
