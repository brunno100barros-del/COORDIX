/* COORDIX · camada comum de dados dos modelos IFC.
 *
 * Usada por Quantitativos, Auditoria de Qualidade e Assistente IFC (e disponível para o Clash Detection).
 * Não abre nem relê arquivos: trabalha sobre o leitor IFC já aberto de cada modelo e sobre os elementos já
 * carregados pelo COORDIX. Não guarda geometria.
 *
 * Princípios:
 *  - Valor ausente (a propriedade não existe) ≠ valor vazio (existe, sem conteúdo) ≠ valor preenchido.
 *  - Todo valor carrega a origem: "elemento" (declarado na ocorrência) ou "tipo" (declarado no tipo).
 *  - Quantidades guardam o valor bruto do IFC, a unidade declarada e o valor convertido para o SI
 *    (m, m², m³, kg). Sem unidade declarada, o valor convertido fica nulo — nunca é presumido.
 *  - Toda consulta devolve os elementos que a compõem e quantos não tinham o dado.
 *
 * Sem dependências; navegador (global CoordixDados) e Node (module.exports). */
(function (raiz) {
  "use strict";

  /* ------------------------------------------------------------------ valores IFC */
  const bruto = (x) => (x == null ? null : typeof x === "object" && "value" in x ? x.value : x);
  /** nome do tipo de medida de um valor IFC (ex.: IFCLENGTHMEASURE), quando o leitor o informa */
  const medidaDe = (x) => (x && typeof x === "object" && typeof x.name === "string" ? x.name.toUpperCase() : null);
  function normalizar(v) {
    if (v === "T" || v === ".T.") return true;
    if (v === "F" || v === ".F.") return false;
    return v;
  }
  const vazio = (v) => v == null || (typeof v === "string" && v.trim() === "");

  /* ------------------------------------------------------------------ unidades */
  const PREFIXO = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18 };
  const GRANDEZA_DA_UNIDADE = { LENGTHUNIT: "comprimento", AREAUNIT: "area", VOLUMEUNIT: "volume", MASSUNIT: "massa" };
  const UNIDADE_SI = { comprimento: "m", area: "m²", volume: "m³", massa: "kg", contagem: "un", tempo: "s" };
  const EXPOENTE = { comprimento: 1, area: 2, volume: 3 };
  const ROTULO_SI = {
    comprimento: { 1: "m", 1e-3: "mm", 1e-2: "cm", 1e-1: "dm", 1e3: "km" },
    area: { 1: "m²", 1e-6: "mm²", 1e-4: "cm²" }, volume: { 1: "m³", 1e-9: "mm³", 1e-6: "cm³", 1e-3: "dm³" },
    massa: { 1: "kg", 1e-3: "g", 1e3: "t" },
  };

  /** fator para o SI de uma unidade "plana" ({type, UnitType, Prefix, Name, ConversionFactor}) */
  function fatorUnidade(u) {
    if (!u) return null;
    const g = GRANDEZA_DA_UNIDADE[u.UnitType];
    if (!g) return null;
    if (u.type === "IFCSIUNIT") {
      const p = u.Prefix ? PREFIXO[u.Prefix] : 1;
      if (p == null) return null;
      if (g === "massa") { if (u.Name !== "GRAM") return null; return { grandeza: g, fator: p * 1e-3 }; }
      const nomeOk = { comprimento: "METRE", area: "SQUARE_METRE", volume: "CUBIC_METRE" }[g];
      if (u.Name !== nomeOk) return null;
      return { grandeza: g, fator: Math.pow(p, EXPOENTE[g]) };
    }
    if (u.type === "IFCCONVERSIONBASEDUNIT" && u.ConversionFactor) {
      const base = fatorUnidade(Object.assign({}, u.ConversionFactor.UnitComponent || {}, { UnitType: u.UnitType }));
      const k = Number(u.ConversionFactor.ValueComponent);
      if (!base || !isFinite(k)) return null;
      return { grandeza: g, fator: k * base.fator, nome: u.Name || "" };
    }
    return null;
  }
  function rotuloUnidade(grandeza, fator, nome) {
    if (nome) return nome;
    const tab = ROTULO_SI[grandeza] || {};
    for (const k of Object.keys(tab)) if (Math.abs(Number(k) - fator) <= Number(k) * 1e-9) return tab[k];
    return `${UNIDADE_SI[grandeza]} × ${fator}`;
  }
  /** unidades declaradas no projeto IFC → {comprimento:{fator,rotulo}|null, area, volume, massa, conflitos:[]} */
  function unidadesDoProjeto(lista) {
    const out = { comprimento: null, area: null, volume: null, massa: null, conflitos: [] };
    for (const u of lista || []) {
      const f = fatorUnidade(u);
      if (!f) continue;
      const atual = out[f.grandeza];
      const novo = { fator: f.fator, rotulo: rotuloUnidade(f.grandeza, f.fator, f.nome) };
      if (atual && Math.abs(atual.fator - novo.fator) > 1e-12 * Math.max(atual.fator, novo.fator)) out.conflitos.push(f.grandeza);
      else out[f.grandeza] = novo;
    }
    for (const g of out.conflitos) out[g] = null; // conflito: nada é presumido
    return out;
  }

  // grandeza de cada tipo de medida IFC (valores de propriedade) e de cada tipo de quantidade
  const MEDIDA_GRANDEZA = {
    IFCLENGTHMEASURE: "comprimento", IFCPOSITIVELENGTHMEASURE: "comprimento", IFCNONNEGATIVELENGTHMEASURE: "comprimento",
    IFCAREAMEASURE: "area", IFCVOLUMEMEASURE: "volume", IFCMASSMEASURE: "massa", IFCCOUNTMEASURE: "contagem",
  };
  const QUANTIDADE = {
    IFCQUANTITYLENGTH: ["comprimento", "LengthValue"], IFCQUANTITYAREA: ["area", "AreaValue"], IFCQUANTITYVOLUME: ["volume", "VolumeValue"],
    IFCQUANTITYCOUNT: ["contagem", "CountValue"], IFCQUANTITYWEIGHT: ["massa", "WeightValue"], IFCQUANTITYTIME: ["tempo", "TimeValue"],
  };

  /** converte um valor bruto para o SI. Devolve {si, unidade} ou {si:null, motivo} */
  function paraSI(valor, grandeza, unidades, unidadePropria) {
    if (typeof valor !== "number" || !isFinite(valor)) return { si: null, motivo: "valor não numérico" };
    if (grandeza === "contagem") return { si: valor, unidade: "un" };
    if (grandeza === "tempo") return { si: null, motivo: "grandeza de tempo não é consolidada" };
    const u = unidadePropria || (unidades && unidades[grandeza]);
    if (!u) return { si: null, motivo: (unidades && unidades.conflitos.includes(grandeza)) ? "unidades conflitantes no arquivo" : "unidade não declarada no arquivo" };
    return { si: valor * u.fator, unidade: u.rotulo };
  }

  /* ------------------------------------------------------------------ leitura de uma definição de propriedades */
  /**
   * Lê um IfcPropertySet ou IfcElementQuantity (linha obtida com o leitor, com referências expandidas).
   * fonte: {nomeTipo(linha)→"IFCPROPERTYSET", texto(s)→string decodificada, unidade(id)→unidade plana|null}
   * Devolve {nome, tipo:"pset"|"qto", itens:[...]} ou null se não for um conjunto de propriedades.
   */
  function lerConjunto(linha, fonte, unidades) {
    const tn = fonte.nomeTipo(linha);
    const nome = fonte.texto(bruto(linha.Name)) || tn;
    const itens = [];
    if (tn === "IFCPROPERTYSET") {
      for (const p of linha.HasProperties || []) {
        if (!p || typeof p !== "object") continue;
        const pn = fonte.texto(bruto(p.Name));
        let v = null, medida = null, forma = "simples";
        if ("NominalValue" in p) { v = normalizar(bruto(p.NominalValue)); medida = medidaDe(p.NominalValue); if (typeof v === "string") v = fonte.texto(v); }
        else if (p.EnumerationValues) { forma = "enumeração"; v = (p.EnumerationValues || []).map((x) => fonte.texto(String(bruto(x)))).join(", "); }
        else if (p.ListValues) { forma = "lista"; v = (p.ListValues || []).map((x) => fonte.texto(String(bruto(x)))).join(", "); }
        else if (p.UpperBoundValue || p.LowerBoundValue) { forma = "intervalo"; v = [bruto(p.LowerBoundValue), bruto(p.UpperBoundValue)].filter((x) => x != null).join(" – "); }
        else forma = "outra";
        const grandeza = medida ? MEDIDA_GRANDEZA[medida] || null : null;
        const item = { nome: pn, valor: v, vazio: vazio(v), medida, forma };
        if (grandeza && typeof v === "number") { item.grandeza = grandeza; Object.assign(item, conv(paraSI(v, grandeza, unidades))); }
        itens.push(item);
      }
      return { nome, tipo: "pset", itens };
    }
    if (tn === "IFCELEMENTQUANTITY") {
      for (const q of linha.Quantities || []) {
        if (!q || typeof q !== "object") continue;
        const qt = QUANTIDADE[fonte.nomeTipo(q)];
        if (!qt) continue; // IfcPhysicalComplexQuantity e outras: fora do escopo
        const [grandeza, campo] = qt;
        const v = bruto(q[campo]);
        let propria = null;
        const ref = q.Unit && typeof q.Unit === "object" && "expressID" in q.Unit ? q.Unit.expressID : bruto(q.Unit);
        if (ref != null && fonte.unidade) { const f = fatorUnidade(fonte.unidade(ref)); if (f && f.grandeza === grandeza) propria = { fator: f.fator, rotulo: rotuloUnidade(grandeza, f.fator, f.nome) }; }
        itens.push(Object.assign({ nome: fonte.texto(bruto(q.Name)), valor: typeof v === "number" ? v : v == null ? null : Number(v), vazio: v == null, grandeza, quantidade: true, unidadePropria: !!propria }, conv(paraSI(typeof v === "number" ? v : Number(v), grandeza, unidades, propria))));
      }
      return { nome, tipo: "qto", itens };
    }
    return null;
  }
  const conv = (r) => (r.si == null ? { si: null, motivoSI: r.motivo } : { si: r.si, unidadeOriginal: r.unidade });

  /* ------------------------------------------------------------------ material e classificação */
  /** nomes dos materiais de uma IfcRelAssociatesMaterial.RelatingMaterial (todas as formas do IFC2X3/IFC4) */
  function nomesMaterial(id, fonte, prof = 0, vistos = new Set()) {
    if (id == null || prof > 6 || vistos.has(id)) return [];
    vistos.add(id);
    let l; try { l = fonte.linha(id); } catch (e) { return []; }
    if (!l) return [];
    const tn = fonte.nomeTipo(l), ref = (x) => bruto(x);
    const sub = (x) => nomesMaterial(ref(x), fonte, prof + 1, vistos);
    const muitos = (arr) => (arr || []).flatMap((x) => sub(x));
    switch (tn) {
      case "IFCMATERIAL": { const n = fonte.texto(bruto(l.Name)); return n ? [n] : []; }
      case "IFCMATERIALLIST": return muitos(l.Materials);
      case "IFCMATERIALLAYER": return sub(l.Material);
      case "IFCMATERIALLAYERSET": return muitos(l.MaterialLayers);
      case "IFCMATERIALLAYERSETUSAGE": return sub(l.ForLayerSet);
      case "IFCMATERIALPROFILE": return sub(l.Material);
      case "IFCMATERIALPROFILESET": return muitos(l.MaterialProfiles);
      case "IFCMATERIALPROFILESETUSAGE": case "IFCMATERIALPROFILESETUSAGETAPERING": return sub(l.ForProfileSet);
      case "IFCMATERIALCONSTITUENT": return sub(l.Material);
      case "IFCMATERIALCONSTITUENTSET": return muitos(l.MaterialConstituents);
      default: return [];
    }
  }
  function lerClassificacao(id, fonte) {
    let l; try { l = fonte.linha(id); } catch (e) { return null; }
    if (!l) return null;
    const tn = fonte.nomeTipo(l);
    if (tn === "IFCCLASSIFICATIONREFERENCE") {
      let sistema = "";
      try { const src = bruto(l.ReferencedSource); if (src != null) { const s = fonte.linha(src); sistema = fonte.texto(bruto(s.Name)) || ""; } } catch (e) {}
      return { sistema, codigo: fonte.texto(bruto(l.Identification != null ? l.Identification : l.ItemReference)) || "", nome: fonte.texto(bruto(l.Name)) || "" };
    }
    if (tn === "IFCCLASSIFICATION") return { sistema: fonte.texto(bruto(l.Name)) || "", codigo: "", nome: "" };
    return null;
  }

  /* ------------------------------------------------------------------ dados de um elemento */
  /**
   * ctx (por modelo): {fonte, psetsOf, typeOf, materialOf, classifOf, unidades, cache:{conj:Map, tipo:Map, mat:Map, cls:Map}}
   * Lê os conjuntos da ocorrência e do tipo (o tipo é lido uma vez por modelo), material e classificação.
   */
  function dadosDoElemento(ctx, eid) {
    const c = ctx.cache, f = ctx.fonte;
    const conj = (id) => {
      if (c.conj.has(id)) return c.conj.get(id);
      let r = null;
      try { r = lerConjunto(f.linha(id, true), f, ctx.unidades); } catch (e) { r = { erro: String((e && e.message) || e) }; }
      c.conj.set(id, r); return r;
    };
    const conjuntos = [];
    for (const id of ctx.psetsOf[eid] || []) { const r = conj(id); if (r && !r.erro) conjuntos.push({ id, origem: "elemento", nome: r.nome, tipo: r.tipo, itens: r.itens }); }
    const t = ctx.typeOf[eid];
    if (t != null) {
      let ids = c.tipo.get(t);
      if (!ids) { ids = []; try { const tl = f.linha(t); for (const r of tl.HasPropertySets || []) ids.push(bruto(r)); } catch (e) {} c.tipo.set(t, ids); }
      for (const id of ids) { const r = conj(id); if (r && !r.erro) conjuntos.push({ id, origem: "tipo", nome: r.nome, tipo: r.tipo, itens: r.itens }); }
    }
    const mat = (rid) => { if (!c.mat.has(rid)) c.mat.set(rid, [...new Set(nomesMaterial(rid, f))]); return c.mat.get(rid); };
    let materiais = [], materialOrigem = null;
    if (ctx.materialOf[eid] != null) { materiais = mat(ctx.materialOf[eid]); materialOrigem = "elemento"; }
    if (!materiais.length && t != null && ctx.materialOf[t] != null) { materiais = mat(ctx.materialOf[t]); materialOrigem = materiais.length ? "tipo" : null; }
    if (!materiais.length) materialOrigem = null;
    const cls = (rid) => { if (!c.cls.has(rid)) c.cls.set(rid, lerClassificacao(rid, f)); return c.cls.get(rid); };
    const classificacoes = [];
    for (const rid of ctx.classifOf[eid] || []) { const x = cls(rid); if (x) classificacoes.push(Object.assign({ origem: "elemento" }, x)); }
    if (!classificacoes.length && t != null) for (const rid of ctx.classifOf[t] || []) { const x = cls(rid); if (x) classificacoes.push(Object.assign({ origem: "tipo" }, x)); }
    return { conjuntos, materiais, materialOrigem, classificacoes };
  }
  const novoCache = () => ({ conj: new Map(), tipo: new Map(), mat: new Map(), cls: new Map() });

  /* ------------------------------------------------------------------ acesso a propriedades e quantidades */
  /**
   * Propriedade "Conjunto.Propriedade" de um registro. O valor da ocorrência prevalece sobre o do tipo.
   * Devolve {estado:"ausente"} | {estado:"vazio"|"preenchido", valor, origem, conjunto, divergeTipo?, valorTipo?}
   */
  function propriedade(reg, conjunto, nome) {
    let el = null, tp = null;
    for (const c of reg.conjuntos) {
      if (c.nome !== conjunto) continue;
      const it = c.itens.find((i) => i.nome === nome);
      if (!it) continue;
      if (c.origem === "elemento" && !el) el = { it, c };
      if (c.origem === "tipo" && !tp) tp = { it, c };
    }
    const usar = el || tp;
    if (!usar) return { estado: "ausente" };
    const r = { estado: usar.it.vazio ? "vazio" : "preenchido", valor: usar.it.valor, origem: usar.c.origem, conjunto, nome, item: usar.it };
    if (el && tp && !el.it.vazio && !tp.it.vazio && !iguais(el.it, tp.it)) { r.divergeTipo = true; r.valorTipo = tp.it.valor; }
    return r;
  }
  function iguais(a, b) {
    if (a.si != null && b.si != null) return Math.abs(a.si - b.si) <= 1e-9 * Math.max(1, Math.abs(a.si), Math.abs(b.si));
    return String(a.valor).trim().toLowerCase() === String(b.valor).trim().toLowerCase();
  }
  /** todas as propriedades (exceto quantidades) por "Conjunto.Propriedade" → resultado de propriedade() */
  function chavesDePropriedades(reg) {
    const s = new Set();
    for (const c of reg.conjuntos) if (c.tipo === "pset") for (const i of c.itens) s.add(c.nome + "\u0000" + i.nome);
    return [...s].map((k) => k.split("\u0000"));
  }
  /**
   * Quantidade declarada pelo nome (ex.: "NetVolume"), opcionalmente num conjunto (ex.: "Qto_BeamBaseQuantities").
   * Regra: a ocorrência prevalece; o tipo só é usado quando a ocorrência não declara. Duas declarações diferentes
   * na ocorrência (dois conjuntos com o mesmo nome de quantidade) são sinalizadas, nunca somadas.
   */
  function quantidade(reg, nome, conjunto) {
    const achados = [];
    for (const c of reg.conjuntos) {
      if (c.tipo !== "qto" || (conjunto && c.nome !== conjunto)) continue;
      for (const i of c.itens) if (i.nome === nome && !i.vazio) achados.push({ origem: c.origem, conjunto: c.nome, item: i });
    }
    if (!achados.length) return { estado: "ausente" };
    const doEl = achados.filter((a) => a.origem === "elemento");
    const base = doEl.length ? doEl : achados.filter((a) => a.origem === "tipo");
    const r = { estado: "declarado", origem: base[0].origem, conjunto: base[0].conjunto, grandeza: base[0].item.grandeza, valor: base[0].item.valor, si: base[0].item.si, unidadeOriginal: base[0].item.unidadeOriginal, motivoSI: base[0].item.motivoSI };
    if (base.length > 1 && base.some((a) => !iguais(a.item, base[0].item))) { r.conflito = base.map((a) => ({ conjunto: a.conjunto, valor: a.item.valor, si: a.item.si })); }
    if (doEl.length) { const tp = achados.find((a) => a.origem === "tipo"); if (tp && !iguais(tp.item, doEl[0].item)) { r.divergeTipo = true; r.valorTipo = tp.item.si != null ? tp.item.si : tp.item.valor; } }
    return r;
  }
  /** nomes de quantidades presentes: [{conjunto, nome, grandeza}] */
  function quantidadesDisponiveis(reg) {
    const out = new Map();
    for (const c of reg.conjuntos) if (c.tipo === "qto") for (const i of c.itens) { const k = c.nome + "." + i.nome; if (!out.has(k)) out.set(k, { conjunto: c.nome, nome: i.nome, grandeza: i.grandeza }); }
    return [...out.values()];
  }

  /* ------------------------------------------------------------------ consulta estruturada */
  /**
   * Campos de filtro e agrupamento:
   *   modelo, arquivo, disciplina, grupo, classe, entidade, pavimento, tipo, nome, sistema, guid, tag,
   *   material, classificacao, "pset:Conjunto.Propriedade", "qto:Nome" (ou "qto:Conjunto.Nome")
   * Operadores: = ≠ contém começa existe ausente vazio preenchido > ≥ < ≤ entre
   * Comparações numéricas em propriedades/quantidades com unidade usam o valor no SI; "valor" do filtro pode
   * vir com unidade: {valor:100, unidade:"mm"} é convertido antes de comparar.
   */
  const UNIDADES_FILTRO = { mm: ["comprimento", 1e-3], cm: ["comprimento", 1e-2], m: ["comprimento", 1], km: ["comprimento", 1e3], "mm²": ["area", 1e-6], "cm²": ["area", 1e-4], "m²": ["area", 1], "cm³": ["volume", 1e-6], "dm³": ["volume", 1e-3], l: ["volume", 1e-3], "m³": ["volume", 1], g: ["massa", 1e-3], kg: ["massa", 1], t: ["massa", 1e3] };

  function separarCampo(campo) {
    const m = /^(pset|qto):(.+)$/.exec(campo);
    if (!m) return { tipo: "basico", campo };
    const s = m[2], i = s.lastIndexOf(".");
    if (m[1] === "qto") return i > 0 ? { tipo: "qto", conjunto: s.slice(0, i), nome: s.slice(i + 1) } : { tipo: "qto", conjunto: null, nome: s };
    return i > 0 ? { tipo: "pset", conjunto: s.slice(0, i), nome: s.slice(i + 1) } : { tipo: "pset-qualquer", nome: s };
  }
  /** valor de um campo num registro: {estado, valor, si?, origem?} */
  function valorCampo(reg, campo, basico) {
    const c = separarCampo(campo);
    if (c.tipo === "basico") {
      if (c.campo === "material") return reg.materiais.length ? { estado: "preenchido", valor: reg.materiais.join(" / "), lista: reg.materiais, origem: reg.materialOrigem } : { estado: "ausente" };
      if (c.campo === "classificacao") return reg.classificacoes.length ? { estado: "preenchido", valor: reg.classificacoes.map((x) => [x.sistema, x.codigo, x.nome].filter(Boolean).join(" ")).join(" / "), origem: reg.classificacoes[0].origem } : { estado: "ausente" };
      const v = basico(reg, c.campo);
      return v == null || v === "" ? { estado: v == null ? "ausente" : "vazio", valor: v } : { estado: "preenchido", valor: v };
    }
    if (c.tipo === "qto") { const q = quantidade(reg, c.nome, c.conjunto); return q.estado === "ausente" ? q : Object.assign({}, q, { estado: "preenchido" }); }
    if (c.tipo === "pset") { const p = propriedade(reg, c.conjunto, c.nome); return Object.assign({}, p, { si: p.item && p.item.si }); }
    // propriedade pelo nome, em qualquer conjunto (a primeira encontrada; ambiguidade é informada)
    const achados = chavesDePropriedades(reg).filter(([, n]) => n === c.nome);
    if (!achados.length) return { estado: "ausente" };
    const p = propriedade(reg, achados[0][0], c.nome);
    return Object.assign({}, p, { si: p.item && p.item.si, ambiguo: achados.length > 1 ? achados.map((a) => a[0]) : null });
  }
  function alvoNumerico(f) {
    const n = (x) => (typeof x === "number" ? x : Number(String(x).replace(",", ".")));
    if (f.unidade && UNIDADES_FILTRO[f.unidade]) {
      const [g, k] = UNIDADES_FILTRO[f.unidade];
      return { grandeza: g, a: n(f.valor) * k, b: f.valor2 != null ? n(f.valor2) * k : null };
    }
    return { grandeza: null, a: n(f.valor), b: f.valor2 != null ? n(f.valor2) : null };
  }
  /** avalia um filtro num registro → true/false; numérico sem dado comparável → false (e é contado à parte) */
  function avaliar(reg, f, basico) {
    const v = valorCampo(reg, f.campo, basico);
    const op = f.op || "=";
    if (op === "existe") return v.estado !== "ausente";
    if (op === "ausente") return v.estado === "ausente";
    if (op === "vazio") return v.estado === "vazio";
    if (op === "preenchido") return v.estado === "preenchido";
    if (v.estado !== "preenchido") return false;
    if ([">", "≥", "<", "≤", "entre"].includes(op)) {
      const t = alvoNumerico(f);
      let x;
      if (t.grandeza) { if (v.si == null || (v.grandeza && v.grandeza !== t.grandeza) || (v.item && v.item.grandeza && v.item.grandeza !== t.grandeza)) return false; x = v.si; }
      else x = typeof v.valor === "number" ? v.valor : Number(String(v.valor).replace(",", "."));
      if (!isFinite(x) || !isFinite(t.a)) return false;
      return op === ">" ? x > t.a : op === "≥" ? x >= t.a : op === "<" ? x < t.a : op === "≤" ? x <= t.a : x >= t.a && x <= t.b;
    }
    const have = String(v.valor).trim().toLowerCase(), want = String(f.valor == null ? "" : f.valor).trim().toLowerCase();
    if (v.lista && (op === "=" || op === "≠")) { const hit = v.lista.some((m) => m.trim().toLowerCase() === want); return op === "=" ? hit : !hit; }
    if (op === "=") return have === want;
    if (op === "≠") return have !== want;
    if (op === "contém") return have.includes(want);
    if (op === "começa") return have.startsWith(want);
    return false;
  }

  /**
   * Executa uma consulta.
   * consulta: {filtros:[{campo,op,valor,valor2?,unidade?}], medida?:{campo:"qto:NetVolume"}, agrupar?:["pavimento",...]}
   * basico(reg, campo): valor de um campo básico (fornecido pelo app a partir dos elementos já carregados)
   * Devolve: {consultados, modelos, itens:[reg], medida?:{grandeza, unidade, total, comValor, semValor:[reg], semSI:[reg], porOrigem, conflitos, divergencias, partesDeMontagem}, grupos?}
   */
  function consultar(registros, consulta, basico) {
    const filtros = (consulta && consulta.filtros) || [];
    const itens = registros.filter((r) => filtros.every((f) => avaliar(r, f, basico)));
    const modelos = [...new Set(registros.map((r) => basico(r, "arquivo")))];
    const out = { consultados: registros.length, modelos, itens };
    if (consulta && consulta.medida) out.medida = medir(itens, consulta.medida.campo, basico);
    if (consulta && consulta.agrupar && consulta.agrupar.length) {
      const g = new Map();
      for (const r of itens) {
        const chave = consulta.agrupar.map((c) => { const v = valorCampo(r, c, basico); return v.estado === "preenchido" ? String(v.valor) : "(sem valor)"; });
        const k = chave.join("\u0000");
        if (!g.has(k)) g.set(k, { chave, itens: [] });
        g.get(k).itens.push(r);
      }
      out.grupos = [...g.values()].map((x) => Object.assign(x, consulta.medida ? { medida: medir(x.itens, consulta.medida.campo, basico) } : {}));
    }
    return out;
  }
  /** soma uma medida sem misturar grandezas, sem presumir unidades e sem contar montagem e partes em dobro */
  function medir(itens, campo, basico) {
    const comValor = [], semValor = [], semSI = [], conflitos = [], divergencias = [], partesDeMontagem = [];
    const porOrigem = { elemento: 0, tipo: 0 };
    let grandeza = null, total = 0, mistura = false;
    const guids = new Map();
    // montagens: se uma montagem e suas partes estão no resultado, conta só as partes que têm o dado
    const comDado = new Set(itens.filter((r) => valorCampo(r, campo, basico).estado === "preenchido").map((r) => r));
    const temParteComDado = new Set();
    for (const r of comDado) if (r.pai != null) temParteComDado.add(r.modelo + ":" + r.pai);
    for (const r of itens) {
      const v = valorCampo(r, campo, basico);
      if (v.estado !== "preenchido") { semValor.push(r); continue; }
      if (r.temPartes && temParteComDado.has(r.modelo + ":" + r.eid)) { partesDeMontagem.push(r); continue; }
      const g = v.grandeza || (v.item && v.item.grandeza) || null;
      if (v.si == null) { semSI.push(r); continue; }
      if (grandeza && g && g !== grandeza) { mistura = true; continue; }
      grandeza = grandeza || g;
      const k = basico(r, "guid");
      if (k && guids.has(k)) { conflitos.push({ tipo: "guid-duplicado", guid: k, registros: [guids.get(k), r] }); continue; }
      if (k) guids.set(k, r);
      if (v.conflito) conflitos.push({ tipo: "declaracoes-diferentes", registro: r, valores: v.conflito });
      if (v.divergeTipo) divergencias.push({ registro: r, valor: v.si, valorTipo: v.valorTipo });
      total += v.si; comValor.push(r); porOrigem[v.origem] = (porOrigem[v.origem] || 0) + 1;
    }
    return { grandeza, unidade: grandeza ? UNIDADE_SI[grandeza] : null, total, comValor, semValor, semSI, porOrigem, conflitos, divergencias, partesDeMontagem, misturaDeGrandezas: mistura };
  }

  /** valores distintos de um campo (para listas de escolha e para o vocabulário do assistente) */
  function valoresDistintos(registros, campo, basico, limite = 2000) {
    const s = new Map();
    for (const r of registros) {
      const v = valorCampo(r, campo, basico);
      if (v.estado !== "preenchido") continue;
      for (const x of v.lista || [v.valor]) { const k = String(x); s.set(k, (s.get(k) || 0) + 1); if (s.size >= limite) break; }
    }
    return [...s.entries()].sort((a, b) => b[1] - a[1]).map(([valor, n]) => ({ valor, n }));
  }
  /** catálogo de PropertySets/propriedades e quantidades presentes (para filtros e para o assistente) */
  function catalogo(registros) {
    const props = new Map(), qtos = new Map();
    for (const r of registros) for (const c of r.conjuntos) for (const i of c.itens) {
      const k = c.nome + "." + i.nome, mapa = c.tipo === "qto" ? qtos : props;
      const e = mapa.get(k) || { conjunto: c.nome, nome: i.nome, grandeza: i.grandeza || null, elementos: 0, vazios: 0, doTipo: 0 };
      e.elementos++; if (i.vazio) e.vazios++; if (c.origem === "tipo") e.doTipo++;
      mapa.set(k, e);
    }
    return { propriedades: [...props.values()], quantidades: [...qtos.values()] };
  }

  const api = {
    bruto, medidaDe, vazio, fatorUnidade, unidadesDoProjeto, paraSI, lerConjunto, nomesMaterial, lerClassificacao,
    dadosDoElemento, novoCache, propriedade, quantidade, quantidadesDisponiveis, chavesDePropriedades,
    valorCampo, avaliar, consultar, medir, valoresDistintos, catalogo, separarCampo,
    UNIDADE_SI, UNIDADES_FILTRO, MEDIDA_GRANDEZA, QUANTIDADE,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.CoordixDados = api;
})(typeof self !== "undefined" ? self : this);
