/* COORDIX · testes do cadastro de disciplinas (coordix-disciplinas.js). Uso: node testes/disciplinas.test.js */
"use strict";
const D = require("../coordix-disciplinas.js");
let falhas = 0, total = 0;
function ok(nome, cond, det) { total++; if (!cond) falhas++; console.log(`${cond ? "✔" : "✘"} ${nome}${cond ? "" : "  → " + JSON.stringify(det)}`); }
const proj = (extra = {}) => Object.assign({ id: "p" + Math.random(), tests: [], team: [], flexOrder: ["EST", "MET", "ARQ", "SAN", "PSI", "PCI", "CLI", "CON", "HVAC", "ELE", "SUB", "SPD", "SCE"] }, extra);

// 1. catálogo idêntico às estruturas fixas anteriores (GROUPS / CODE_INFO do index.html até a versão 0.4.1)
const GROUPS_ANTES = { EST: "Estrutura", MET: "Estrutura Metálica", ARQ: "Arquitetura", SAN: "Hidrossanitário", HVAC: "HVAC", ELE: "Elétrica", PCI: "Incêndio", FORRO: "Forro", MEP: "MEP", EQUIP: "Equipamentos" };
const CODE_INFO_ANTES = {
  EST: ["Estrutura", "EST"], MET: ["Estrutura Metálica", "MET"], ARQ: ["Arquitetura", "ARQ"], SAN: ["Hidrossanitário", "SAN"], HID: ["Hidráulica", "SAN"],
  PCI: ["Prevenção e combate a incêndio", "PCI"], PSI: ["Piscina", "SAN"], ELE: ["Elétrica", "ELE"], SCE: ["Cabeamento estruturado", "ELE"],
  SPD: ["SPDA", "ELE"], SUB: ["Subestação", "ELE"], CLI: ["Climatização", "HVAC"], CON: ["Climatização", "HVAC"], HVAC: ["HVAC", "HVAC"],
};
ok("catálogo de grupos idêntico ao anterior", JSON.stringify(D.GRUPOS_PADRAO) === JSON.stringify(GROUPS_ANTES));
ok("catálogo de siglas idêntico ao anterior (inclui MET uma única vez)", JSON.stringify(D.SIGLAS_PADRAO) === JSON.stringify(CODE_INFO_ANTES));

// 2. projeto sem cadastro (projetos antigos) se comporta exatamente como antes
const antigo = proj();
const nomes = ["ESRO-ESP-ARQ-PE.ifc", "PROJ_SAN_R00.ifc", "X-SPD-01.IFC", "MODELO MET.ifc", "SEM-CODIGO.ifc", "ESRO-ESP-DRE-PE.ifc"];
const antes = (n) => { const up = n.toUpperCase().replace(/\.IFC$/, ""); for (const p of up.split(/[-_ .]/)) if (CODE_INFO_ANTES[p]) return p; return ""; };
ok("detecção pelo nome do arquivo igual à anterior", nomes.every((n) => D.siglaDoArquivo(antigo, n) === antes(n)), nomes.map((n) => [n, D.siglaDoArquivo(antigo, n), antes(n)]));
ok("grupos utilizáveis = grupos anteriores", JSON.stringify(Object.keys(D.grupos(antigo))) === JSON.stringify(Object.keys(GROUPS_ANTES)));
ok("migração aditiva cria a estrutura sem alterar o resto", (() => { const p = proj({ tests: [{ id: "t1" }] }); D.migrar(p); return Array.isArray(p.disciplinas.extras) && p.tests.length === 1; })());

// 3. cadastro
const P = proj(); D.migrar(P);
let r = D.adicionar(P, { sigla: "drn", nome: "Drenagem" });
ok("cadastra DRN (sigla normalizada em maiúsculas)", r.ok && r.disciplina.sigla === "DRN" && r.disciplina.grupo === "DRN", r);
ok("nova disciplina entra na ordem de flexibilidade (a mais flexível)", P.flexOrder[P.flexOrder.length - 1] === "DRN");
ok("arquivo com a sigla nova passa a ser reconhecido", D.siglaDoArquivo(P, "ESRO-ESP-DRN-PE.ifc") === "DRN");
ok("grupo próprio aparece na matriz com o nome da disciplina", D.grupos(P).DRN === "Drenagem");
r = D.adicionar(P, { sigla: "DRN", nome: "Outra" });
ok("sigla duplicada no projeto é recusada", !r.ok && /já está cadastrada/.test(r.erros.join()), r);
r = D.adicionar(P, { sigla: "EST", nome: "Estrutura 2" });
ok("sigla do catálogo padrão é recusada", !r.ok && /catálogo padrão/.test(r.erros.join()), r);
r = D.adicionar(P, { sigla: "MEP", nome: "x" });
ok("grupo padrão não pode virar sigla", !r.ok, r);
r = D.adicionar(P, { sigla: "1AB", nome: "x" });
ok("sigla inválida é recusada", !r.ok, r);
r = D.adicionar(P, { sigla: "GAS", nome: "Gás", grupo: "SAN" });
ok("disciplina que herda testes de um grupo existente (GAS → SAN)", r.ok && D.info(P, "GAS").grupo === "SAN" && !D.grupos(P).GAS, r);
r = D.adicionar(P, { sigla: "XYZ", nome: "x", grupo: "FORRO" });
ok("grupo derivado (FORRO) não recebe disciplinas", !r.ok, r);

// 4. edição
r = D.editar(P, "DRN", { nome: "Drenagem pluvial" }, true);
ok("nome editável mesmo em uso", r.ok && D.infoQualquer(P, "DRN").nome === "Drenagem pluvial");
r = D.editar(P, "DRN", { sigla: "DRP" }, true);
ok("sigla em uso não pode mudar", !r.ok, r);
r = D.editar(P, "DRN", { sigla: "DRP" }, false);
ok("sigla sem uso pode mudar (e acompanha na ordem de flexibilidade)", r.ok && D.infoQualquer(P, "DRP") && P.flexOrder.includes("DRP") && !P.flexOrder.includes("DRN"), [r, P.flexOrder]);
r = D.editar(P, "EST", { nome: "x" }, false);
ok("disciplina padrão não é editável", !r.ok);

// 5. desativar / reativar
D.definirAtiva(P, "SPD", false);
ok("padrão desativada: não é mais detectada no nome do arquivo", D.siglaDoArquivo(P, "X-SPD-01.ifc") === "");
ok("padrão desativada: rótulo continua resolvido para o histórico", D.infoQualquer(P, "SPD").nome === "SPDA" && D.rotuloGrupo(P, "ELE") === "Elétrica");
D.definirAtiva(P, "DRP", false);
ok("do projeto desativada: sai dos grupos utilizáveis, mas o rótulo permanece", !D.grupos(P).DRP && D.rotuloGrupo(P, "DRP") === "Drenagem pluvial");
ok("grupos com inativas incluídos quando pedido", D.grupos(P, false).DRP === "Drenagem pluvial");
D.definirAtiva(P, "SPD", true); D.definirAtiva(P, "DRP", true);
ok("reativação restaura", D.siglaDoArquivo(P, "X-SPD-01.ifc") === "SPD" && D.grupos(P).DRP);

// 6. separação entre projetos e cópia
const Q = proj(); D.migrar(Q);
ok("outro projeto não enxerga as disciplinas do primeiro", !D.info(Q, "DRP") && D.siglaDoArquivo(Q, "A-DRP-B.ifc") === "");
const n = D.copiarDe(Q, P);
ok("copiar disciplinas de outro projeto", n === 2 && D.info(Q, "DRP") && D.info(Q, "GAS"), n);
ok("cópia é independente (alterar uma não altera a outra)", (() => { D.editar(Q, "DRP", { nome: "Q" }, false); return D.infoQualquer(P, "DRP").nome === "Drenagem pluvial"; })());
ok("copiar de novo não duplica", D.copiarDe(Q, P) === 0 && Q.disciplinas.extras.length === 2);

console.log(`\n${total - falhas} de ${total} testes de disciplinas aprovados.`);
process.exit(falhas ? 1 : 0);
