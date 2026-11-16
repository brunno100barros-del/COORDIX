/* COORDIX · disciplinas: catálogo padrão + cadastro por projeto.
 *
 * Dois níveis, como no restante do COORDIX:
 *   sigla (código no nome do arquivo IFC, ex.: SPD) → disciplina (nome) → grupo de análise (ex.: ELE)
 *   grupo de análise: usado na matriz de testes, na ordem de flexibilidade e no responsável.
 *   Há grupos derivados que não são disciplinas (FORRO, MEP, EQUIP): continuam só no catálogo.
 *
 * O catálogo padrão é idêntico às estruturas fixas anteriores (GROUPS e CODE_INFO) e não pode ser apagado nem
 * renomeado; no projeto, uma sigla padrão só pode ser desativada/reativada. Disciplinas novas ficam em
 * P.disciplinas.extras e são editáveis. Desativar nunca apaga nada: rótulos continuam resolvidos para o histórico.
 *
 * Sem dependências; funciona no navegador (global CoordixDisc) e no Node (module.exports). */
(function (raiz) {
  "use strict";

  // grupos de análise padrão (antes: GROUPS)
  const GRUPOS_PADRAO = {
    EST: "Estrutura", MET: "Estrutura Metálica", ARQ: "Arquitetura", SAN: "Hidrossanitário", HVAC: "HVAC",
    ELE: "Elétrica", PCI: "Incêndio", FORRO: "Forro", MEP: "MEP", EQUIP: "Equipamentos",
  };
  const GRUPOS_DERIVADOS = new Set(["FORRO", "MEP", "EQUIP"]); // não vêm de sigla de arquivo
  // siglas padrão (antes: CODE_INFO): sigla → [nome da disciplina, grupo]
  const SIGLAS_PADRAO = {
    EST: ["Estrutura", "EST"], MET: ["Estrutura Metálica", "MET"], ARQ: ["Arquitetura", "ARQ"], SAN: ["Hidrossanitário", "SAN"], HID: ["Hidráulica", "SAN"],
    PCI: ["Prevenção e combate a incêndio", "PCI"], PSI: ["Piscina", "SAN"], ELE: ["Elétrica", "ELE"], SCE: ["Cabeamento estruturado", "ELE"],
    SPD: ["SPDA", "ELE"], SUB: ["Subestação", "ELE"], CLI: ["Climatização", "HVAC"], CON: ["Climatização", "HVAC"], HVAC: ["HVAC", "HVAC"],
  };
  const RE_SIGLA = /^[A-Z][A-Z0-9]{1,5}$/;

  const cfg = (P) => (P && P.disciplinas) || { extras: [], inativas: [] };

  /** garante a estrutura no projeto (migração aditiva: nada existente é alterado) */
  function migrar(P) {
    if (!P.disciplinas || typeof P.disciplinas !== "object") P.disciplinas = { extras: [], inativas: [] };
    if (!Array.isArray(P.disciplinas.extras)) P.disciplinas.extras = [];
    if (!Array.isArray(P.disciplinas.inativas)) P.disciplinas.inativas = [];
    return P;
  }

  /** lista completa (padrão + do projeto), com estado; ordem: padrão na ordem do catálogo, depois as do projeto */
  function lista(P) {
    const c = cfg(P), inat = new Set(c.inativas);
    const out = Object.entries(SIGLAS_PADRAO).map(([s, [nome, grupo]]) => ({ sigla: s, nome, grupo, padrao: true, ativa: !inat.has(s) }));
    for (const x of c.extras) out.push({ sigla: x.sigla, nome: x.nome, grupo: x.grupo || x.sigla, padrao: false, ativa: x.ativa !== false, criada: x.criada || null });
    return out;
  }
  /** sigla → {nome, grupo} só se a disciplina estiver ATIVA (detecção de arquivos, seletores para itens novos) */
  function info(P, sigla) {
    const d = lista(P).find((x) => x.sigla === sigla);
    return d && d.ativa ? d : null;
  }
  /** sigla → {nome, grupo} mesmo inativa (rótulos e histórico) */
  function infoQualquer(P, sigla) { return lista(P).find((x) => x.sigla === sigla) || null; }

  /** grupos de análise: {código: rótulo}. ativos=true → só os utilizáveis em itens novos */
  function grupos(P, ativos = true) {
    const out = {}, todas = lista(P);
    for (const [g, rot] of Object.entries(GRUPOS_PADRAO)) {
      if (!ativos || GRUPOS_DERIVADOS.has(g) || todas.some((d) => d.grupo === g && d.ativa)) out[g] = rot;
    }
    // disciplina do projeto com grupo próprio vira um grupo novo (rótulo = nome da disciplina)
    for (const d of todas) if (!d.padrao && d.grupo === d.sigla && (!ativos || d.ativa)) out[d.sigla] = d.nome;
    return out;
  }
  /** rótulo de um grupo, inclusive inativo ou desconhecido (nunca some do histórico) */
  function rotuloGrupo(P, g) {
    if (GRUPOS_PADRAO[g]) return GRUPOS_PADRAO[g];
    const d = cfg(P).extras.find((x) => x.sigla === g);
    return d ? d.nome : g;
  }
  /** sigla da disciplina pelo nome do arquivo (mesma regra de antes: partes separadas por - _ espaço ou ponto) */
  function siglaDoArquivo(P, nomeArquivo) {
    const up = String(nomeArquivo || "").toUpperCase().replace(/\.IFC$/, "");
    for (const p of up.split(/[-_ .]/)) if (info(P, p)) return p;
    return "";
  }

  /** validação de uma disciplina nova ou editada. Devolve lista de erros (vazia = válida) */
  function validar(P, d, siglaOriginal) {
    const erros = [];
    const sigla = String(d.sigla || "").trim().toUpperCase(), nome = String(d.nome || "").trim();
    if (!RE_SIGLA.test(sigla)) erros.push("A sigla deve ter de 2 a 6 caracteres, começando por letra (A–Z, 0–9).");
    if (!nome) erros.push("Informe o nome da disciplina.");
    if (sigla !== siglaOriginal) {
      if (SIGLAS_PADRAO[sigla]) erros.push(`A sigla ${sigla} já existe no catálogo padrão (${SIGLAS_PADRAO[sigla][0]}).`);
      else if (GRUPOS_PADRAO[sigla]) erros.push(`${sigla} é um grupo de análise padrão e não pode ser usado como sigla nova.`);
      else if (cfg(P).extras.some((x) => x.sigla === sigla)) erros.push(`A sigla ${sigla} já está cadastrada neste projeto.`);
    }
    const g = d.grupo || sigla;
    if (g !== sigla && !GRUPOS_PADRAO[g]) erros.push("Grupo de análise inválido.");
    if (GRUPOS_DERIVADOS.has(g)) erros.push(`${GRUPOS_PADRAO[g]} é um grupo derivado e não pode receber disciplinas.`);
    return erros;
  }
  /** cadastra. grupo: a própria sigla (grupo novo) ou um grupo padrão para herdar testes */
  function adicionar(P, d, agora) {
    migrar(P);
    const sigla = String(d.sigla || "").trim().toUpperCase();
    const erros = validar(P, Object.assign({}, d, { sigla }));
    if (erros.length) return { ok: false, erros };
    const novo = { sigla, nome: String(d.nome).trim(), grupo: d.grupo && d.grupo !== sigla ? d.grupo : sigla, ativa: true, criada: agora || new Date().toISOString() };
    P.disciplinas.extras.push(novo);
    if (Array.isArray(P.flexOrder) && !P.flexOrder.includes(sigla)) P.flexOrder.push(sigla); // nova: a mais flexível; reordenável
    return { ok: true, disciplina: novo };
  }
  /** edita uma disciplina do projeto. emUso: a sigla já está em modelos/testes → só o nome pode mudar */
  function editar(P, siglaAtual, d, emUso) {
    migrar(P);
    const x = P.disciplinas.extras.find((e) => e.sigla === siglaAtual);
    if (!x) return { ok: false, erros: ["Disciplinas do catálogo padrão não são editáveis; podem ser desativadas no projeto."] };
    const sigla = String(d.sigla != null ? d.sigla : x.sigla).trim().toUpperCase();
    if (sigla !== x.sigla && emUso) return { ok: false, erros: [`A sigla ${x.sigla} já está em uso (modelos, testes ou equipe); só o nome pode ser alterado.`] };
    const grupo = d.grupo != null ? d.grupo : (x.grupo === x.sigla ? sigla : x.grupo);
    if (grupo !== (x.grupo === x.sigla ? sigla : x.grupo) && emUso) return { ok: false, erros: ["O grupo de análise de uma disciplina em uso não pode ser alterado (mudaria resultados existentes)."] };
    const erros = validar(P, { sigla, nome: d.nome != null ? d.nome : x.nome, grupo }, x.sigla);
    if (erros.length) return { ok: false, erros };
    if (sigla !== x.sigla && Array.isArray(P.flexOrder)) { const i = P.flexOrder.indexOf(x.sigla); if (i >= 0) P.flexOrder[i] = sigla; }
    x.sigla = sigla; x.nome = String(d.nome != null ? d.nome : x.nome).trim(); x.grupo = grupo === sigla ? sigla : grupo;
    return { ok: true, disciplina: x };
  }
  /** ativa/desativa (padrão ou do projeto). Nunca apaga. */
  function definirAtiva(P, sigla, ativa) {
    migrar(P);
    if (SIGLAS_PADRAO[sigla]) {
      const s = new Set(P.disciplinas.inativas);
      if (ativa) s.delete(sigla); else s.add(sigla);
      P.disciplinas.inativas = [...s];
      return { ok: true };
    }
    const x = P.disciplinas.extras.find((e) => e.sigla === sigla);
    if (!x) return { ok: false, erros: ["Disciplina não encontrada."] };
    x.ativa = !!ativa;
    return { ok: true };
  }
  /** copia as disciplinas do projeto de origem que ainda não existem no destino (siglas iguais são mantidas) */
  function copiarDe(Pdest, Porig) {
    migrar(Pdest);
    let n = 0;
    for (const x of cfg(Porig).extras) {
      if (validar(Pdest, x).length) continue;
      Pdest.disciplinas.extras.push(Object.assign({}, x));
      if (Array.isArray(Pdest.flexOrder) && !Pdest.flexOrder.includes(x.sigla)) Pdest.flexOrder.push(x.sigla);
      n++;
    }
    return n;
  }

  const api = { GRUPOS_PADRAO, SIGLAS_PADRAO, GRUPOS_DERIVADOS, migrar, lista, info, infoQualquer, grupos, rotuloGrupo, siglaDoArquivo, validar, adicionar, editar, definirAtiva, copiarDe };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.CoordixDisc = api;
})(typeof self !== "undefined" ? self : this);
