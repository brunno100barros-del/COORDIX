"""Gera modelos IFC4 de exemplo (um por disciplina) com conflitos planejados.
Unidades em milímetro. Saída: /home/claude/bimora/samples/*.ifc
"""
import os, uuid

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "exemplos")
os.makedirs(OUT, exist_ok=True)

_CH = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$"


def guid():
    n = uuid.uuid4().int
    s = ""
    for i in range(22):
        s = _CH[n % 64] + s
        n //= 64
    # first char must encode only 2 bits
    return _CH[int(_CH.index(s[0]) % 4)] + s[1:]


def enc(s):
    out = []
    for ch in s:
        if ord(ch) < 128 and ch not in "'\\":
            out.append(ch)
        elif ch == "'":
            out.append("''")
        elif ch == "\\":
            out.append("\\\\")
        else:
            out.append("\\X2\\%04X\\X0\\" % ord(ch))
    return "'" + "".join(out) + "'"


def f(x):
    return "%.6f" % float(x)


class W:
    def __init__(self, name):
        self.lines = []
        self.n = 0
        self.name = name

    def add(self, txt):
        self.n += 1
        self.lines.append("#%d=%s;" % (self.n, txt))
        return "#%d" % self.n

    def pt(self, x, y, z):
        return self.add("IFCCARTESIANPOINT((%s,%s,%s))" % (f(x), f(y), f(z)))

    def d(self, x, y, z):
        return self.add("IFCDIRECTION((%s,%s,%s))" % (f(x), f(y), f(z)))

    def save(self, schema="IFC4"):
        head = (
            "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\n"
            "FILE_NAME(%s,'2026-10-28T09:00:00',('BIMORA'),('BIMORA'),'BIMORA sample','BIMORA','');\n"
            "FILE_SCHEMA(('%s'));\nENDSEC;\nDATA;\n" % (enc(self.name), schema)
        )
        with open(os.path.join(OUT, self.name), "w", encoding="ascii") as fh:
            fh.write(head + "\n".join(self.lines) + "\nENDSEC;\nEND-ISO-10303-21;\n")


LEVELS = [("Térreo", 0.0), ("1º Pavimento", 3500.0), ("Cobertura", 7000.0)]

COLORS = {
    "concreto": (0.72, 0.72, 0.70),
    "alvenaria": (0.86, 0.80, 0.70),
    "forro": (0.93, 0.93, 0.90),
    "esgoto": (0.55, 0.38, 0.22),
    "aguafria": (0.20, 0.55, 0.85),
    "eletrica": (0.95, 0.75, 0.10),
    "cabeamento": (0.20, 0.70, 0.45),
    "duto": (0.62, 0.70, 0.78),
    "luminaria": (0.98, 0.98, 0.85),
}


class Model:
    def __init__(self, fname, disc_code, disc_name):
        self.w = W(fname)
        w = self.w
        self.disc = disc_name
        self.origin = w.pt(0, 0, 0)
        self.dz = w.d(0, 0, 1)
        self.dx = w.d(1, 0, 0)
        self.wcs = w.add("IFCAXIS2PLACEMENT3D(%s,$,$)" % self.origin)
        o2 = w.add("IFCCARTESIANPOINT((0.,0.))")
        self.p2d = w.add("IFCAXIS2PLACEMENT2D(%s,$)" % o2)
        ctx = w.add("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,%s,$)" % self.wcs)
        self.body = w.add("IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,%s,$,.MODEL_VIEW.,$)" % ctx)
        u = [
            w.add("IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)"),
            w.add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)"),
            w.add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)"),
            w.add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)"),
        ]
        units = w.add("IFCUNITASSIGNMENT((%s))" % ",".join(u))
        proj = w.add("IFCPROJECT('%s',$,%s,$,$,$,$,(%s),%s)" % (guid(), enc("EDIFÍCIO EDUCACIONAL MODELO"), ctx, units))
        lp = w.add("IFCLOCALPLACEMENT($,%s)" % self.wcs)
        site = w.add("IFCSITE('%s',$,'Terreno',$,$,%s,$,$,.ELEMENT.,$,$,$,$,$)" % (guid(), lp))
        bld = w.add("IFCBUILDING('%s',$,%s,$,$,%s,$,$,.ELEMENT.,$,$,$)" % (guid(), enc("Bloco Pedagógico"), lp))
        w.add("IFCRELAGGREGATES('%s',$,$,$,%s,(%s))" % (guid(), proj, site))
        w.add("IFCRELAGGREGATES('%s',$,$,$,%s,(%s))" % (guid(), site, bld))
        self.storeys = {}
        sts = []
        for name, z in LEVELS:
            s = w.add("IFCBUILDINGSTOREY('%s',$,%s,$,$,%s,$,$,.ELEMENT.,%s)" % (guid(), enc(name), lp, f(z)))
            self.storeys[name] = s
            sts.append(s)
        w.add("IFCRELAGGREGATES('%s',$,$,$,%s,(%s))" % (guid(), bld, ",".join(sts)))
        self.contained = {k: [] for k in self.storeys}
        self.styles = {}
        self.types = {}
        self.systems = {}
        self.layers = {}
        self.disc_code = disc_code

    def style(self, key):
        if key not in self.styles:
            r, g, b = COLORS[key]
            c = self.w.add("IFCCOLOURRGB($,%s,%s,%s)" % (f(r), f(g), f(b)))
            sh = self.w.add("IFCSURFACESTYLESHADING(%s,0.)" % c)
            self.styles[key] = self.w.add("IFCSURFACESTYLE(%s,.BOTH.,(%s))" % (enc(key), sh))
        return self.styles[key]

    def element(self, cls, name, storey, start, axis, length, profile, color,
                predef="NOTDEFINED", type_name=None, psets=None, system=None, layer=None, ref=None):
        w = self.w
        ax = {"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}[axis]
        rd = (0, 1, 0) if axis == "x" else (1, 0, 0)
        loc = w.add("IFCAXIS2PLACEMENT3D(%s,%s,%s)" % (w.pt(*start), w.d(*ax), w.d(*rd)))
        plc = w.add("IFCLOCALPLACEMENT($,%s)" % loc)
        if profile[0] == "rect":
            prof = w.add("IFCRECTANGLEPROFILEDEF(.AREA.,$,%s,%s,%s)" % (self.p2d, f(profile[1]), f(profile[2])))
        else:
            prof = w.add("IFCCIRCLEPROFILEDEF(.AREA.,$,%s,%s)" % (self.p2d, f(profile[1] / 2.0)))
        solid = w.add("IFCEXTRUDEDAREASOLID(%s,$,%s,%s)" % (prof, self.dz, f(length)))
        w.add("IFCSTYLEDITEM(%s,(%s),$)" % (solid, w.add("IFCPRESENTATIONSTYLEASSIGNMENT((%s))" % self.style(color))))
        rep = w.add("IFCSHAPEREPRESENTATION(%s,'Body','SweptSolid',(%s))" % (self.body, solid))
        pds = w.add("IFCPRODUCTDEFINITIONSHAPE($,$,(%s))" % rep)
        g = guid()
        e = w.add("IFC%s('%s',$,%s,$,%s,%s,%s,%s,.%s.)" % (
            cls, g, enc(name), enc(type_name or name), plc, pds, enc(ref or name), predef))
        self.contained[storey].append(e)
        if type_name:
            key = (cls, type_name)
            if key not in self.types:
                self.types[key] = [w.add("IFC%sTYPE('%s',$,%s,$,$,$,$,$,$,.%s.)" % (cls, guid(), enc(type_name), predef)), []]
            self.types[key][1].append(e)
        if layer:
            self.layers.setdefault(layer, []).append(rep)
        if system:
            self.systems.setdefault(system, []).append(e)
        for pname, props in (psets or {}).items():
            items = []
            for k, v in props.items():
                if isinstance(v, bool):
                    val = "IFCBOOLEAN(.%s.)" % ("T" if v else "F")
                elif isinstance(v, (int, float)):
                    val = "IFCLENGTHMEASURE(%s)" % f(v) if k.lower().startswith(("di", "comp", "larg", "alt", "esp", "se")) else "IFCREAL(%s)" % f(v)
                else:
                    val = "IFCLABEL(%s)" % enc(str(v))
                items.append(w.add("IFCPROPERTYSINGLEVALUE(%s,$,%s,$)" % (enc(k), val)))
            ps = w.add("IFCPROPERTYSET('%s',$,%s,$,(%s))" % (guid(), enc(pname), ",".join(items)))
            w.add("IFCRELDEFINESBYPROPERTIES('%s',$,$,$,(%s),%s)" % (guid(), e, ps))
        return e

    def finish(self):
        w = self.w
        for name, els in self.contained.items():
            if els:
                w.add("IFCRELCONTAINEDINSPATIALSTRUCTURE('%s',$,$,$,(%s),%s)" % (guid(), ",".join(els), self.storeys[name]))
        for (cls, tn), (t, els) in self.types.items():
            w.add("IFCRELDEFINESBYTYPE('%s',$,$,$,(%s),%s)" % (guid(), ",".join(els), t))
        for sname, els in self.systems.items():
            s = w.add("IFCDISTRIBUTIONSYSTEM('%s',$,%s,$,$,$,.NOTDEFINED.)" % (guid(), enc(sname)))
            w.add("IFCRELASSIGNSTOGROUP('%s',$,$,$,(%s),$,%s)" % (guid(), ",".join(els), s))
        for lname, reps in self.layers.items():
            w.add("IFCPRESENTATIONLAYERASSIGNMENT(%s,$,(%s),$)" % (enc(lname), ",".join(reps)))
        w.save()


def common(cls, **kw):
    d = {"Reference": kw.pop("ref", "-"), "Status": kw.pop("status", "Novo")}
    d.update(kw)
    return {"Pset_%sCommon" % cls.title().replace("_", ""): d}


def merge(*ds):
    out = {}
    for d in ds:
        out.update(d)
    return out


def orc(eap1, eap2, desc):
    return {"Pset_ORCAMENTO": {"EAP Nível 01": eap1, "EAP Nível 02": eap2, "Descrição": desc}}


XS = [0, 6000, 12000]
YS = [0, 6000]

# ---------------- ESTRUTURA ----------------
est = Model("EXEMPLO-EST.ifc", "EST", "Estrutura")
for li, (lv, z0) in enumerate(LEVELS[:2]):
    for x in XS:
        for y in YS:
            est.element("COLUMN", "P%d%d" % (XS.index(x) + 1, YS.index(y) + 1), lv, (x, y, z0), "z", 2880,
                        ("rect", 300, 300), "concreto", "COLUMN", "Pilar 30x30",
                        merge(common("column", ref="P30x30", LoadBearing=True, IsExternal=False),
                              {"Pset_ConcreteElementGeneral": {"StrengthClass": "C30", "Cobrimento": "30 mm"}},
                              orc("02 Estrutura", "02.01 Pilares", "Pilar concreto armado 30x30")),
                        layer="EST_Pilares")
    top = z0 + 3500
    upper = LEVELS[li + 1][0]
    for y in YS:
        est.element("BEAM", "V%d" % (YS.index(y) + 1 + li * 10), lv, (0, y, top - 120 - 250), "x", 12000,
                    ("rect", 150, 500), "concreto", "BEAM", "Viga 15x50",
                    merge(common("beam", ref="V15x50", LoadBearing=True, Span=6000),
                          orc("02 Estrutura", "02.02 Vigas", "Viga concreto armado 15x50")),
                    layer="EST_Vigas")
    for x in XS:
        est.element("BEAM", "V%d" % (XS.index(x) + 3 + li * 10), lv, (x, 0, top - 120 - 250), "y", 6000,
                    ("rect", 150, 500), "concreto", "BEAM", "Viga 15x50",
                    merge(common("beam", ref="V15x50", LoadBearing=True, Span=6000),
                          orc("02 Estrutura", "02.02 Vigas", "Viga concreto armado 15x50")),
                    layer="EST_Vigas")
    est.element("SLAB", "L%d" % (li + 1), upper, (6000, 3000, top - 120), "z", 120,
                ("rect", 12300, 6300), "concreto", "FLOOR", "Laje maciça h=12",
                merge(common("slab", ref="LM12", LoadBearing=True), orc("02 Estrutura", "02.03 Lajes", "Laje maciça h=12 cm")),
                layer="EST_Lajes")
est.finish()

# ---------------- ARQUITETURA ----------------
arq = Model("EXEMPLO-ARQ.ifc", "ARQ", "Arquitetura")
for li, (lv, z0) in enumerate(LEVELS[:2]):
    # parede ao longo de y=6000, entre pilares; a primeira invade o pilar em 20 mm (P4)
    arq.element("WALL", "Alvenaria eixo B-%d" % li, lv, (150 - 20, 6000, z0 + 1440), "x", 5700 + 20,
                ("rect", 140, 2880), "alvenaria", "STANDARD", "Alvenaria bloco cerâmico 14 cm",
                merge(common("wall", ref="ALV14", IsExternal=True, LoadBearing=False),
                      {"Pset_Fase": {"Fase": "Existente" if li == 0 else "Nova"}}, orc("03 Vedações", "03.01 Alvenaria", "Alvenaria bloco cerâmico 14 cm")),
                layer="ARQ_Paredes")
    arq.element("WALL", "Alvenaria eixo 3-%d" % li, lv, (12000, 150, z0 + 1440), "y", 5700,
                ("rect", 140, 2880), "alvenaria", "STANDARD", "Alvenaria bloco cerâmico 14 cm",
                merge(common("wall", ref="ALV14", IsExternal=True, LoadBearing=False),
                      {"Pset_Fase": {"Fase": "Nova"}},
                      orc("03 Vedações", "03.01 Alvenaria", "Alvenaria bloco cerâmico 14 cm")),
                layer="ARQ_Paredes")
arq.element("COVERING", "Forro gesso sala 01", "1º Pavimento", (3000, 3000, 3500 + 2175), "z", 15,
            ("rect", 5600, 5600), "forro", "CEILING", "Forro de gesso acartonado",
            merge(common("covering", ref="FG12"), orc("05 Acabamentos", "05.03 Forros", "Forro de gesso acartonado")),
            layer="ARQ_Forros")
arq.finish()

# ---------------- HIDROSSANITÁRIO ----------------
san = Model("EXEMPLO-SAN.ifc", "SAN", "Hidrossanitário")
qi = lambda d, c: {"Pset_AltoQi_QiBuilder": {"Diâmetro": d, "Comprimento": c, "Inclinação": 1.0}}
# P1: tubo Ø100 atravessando viga V1 (y=0) do térreo — viga ocupa z 2880-3380
san.element("PIPESEGMENT", "Esgoto TQ-01", "Térreo", (3000, -800, 3100), "y", 1600, ("circ", 100), "esgoto",
            "RIGIDSEGMENT", "Tubo rígido c/ ponta lisa - 100 mm - 4\"",
            merge(common("pipesegment", ref="ES100"), qi(100, 1600), orc("06 Instalações", "06.02 Esgoto", "PVC Esgoto - Tubo rígido c/ ponta lisa - 100 mm")),
            system="Esgoto sanitário", layer="Sanitário_Esgoto_Conduto")
# P2: prumada Ø100 atravessando laje L1 (z 3380-3500)
san.element("PIPESEGMENT", "Prumada TQ-02", "Térreo", (9000, 3000, 2000), "z", 3000, ("circ", 100), "esgoto",
            "RIGIDSEGMENT", "Tubo rígido c/ ponta lisa - 100 mm - 4\"",
            merge(common("pipesegment", ref="ES100"), qi(100, 3000), orc("06 Instalações", "06.02 Esgoto", "PVC Esgoto - Prumada 100 mm")),
            system="Esgoto sanitário", layer="Sanitário_Esgoto_Conduto")
# Falso clash: conexão sobreposta ao próprio tubo
san.element("PIPEFITTING", "Junção 100 mm", "Térreo", (9000, 3000, 1900), "z", 220, ("circ", 116), "esgoto",
            "JUNCTION", "Junção simples 100x100",
            merge(common("pipefitting", ref="JS100"), qi(100, 0.22), orc("06 Instalações", "06.02 Esgoto", "PVC Esgoto - Junção 100 mm")),
            system="Esgoto sanitário", layer="Sanitário_Esgoto_Conexao")
# P3: tubo Ø25 de água fria atravessando parede de alvenaria (y=6000) no 1º pav
san.element("PIPESEGMENT", "AF ramal 25", "1º Pavimento", (2500, 5400, 3500 + 1100), "y", 1200, ("circ", 25), "aguafria",
            "RIGIDSEGMENT", "Tubo soldável - 25 mm",
            merge(common("pipesegment", ref="AF25"), qi(25, 1200), orc("06 Instalações", "06.01 Água fria", "PVC soldável 25 mm")),
            system="Água fria", layer="Hidráulica_AF_Conduto")
# Abaixo da tolerância: tubo Ø50 encostando 3 mm na face da viga V3 (x=0, largura 150 => face em x=75)
san.element("PIPESEGMENT", "AF ramal 50", "Térreo", (75 + 25 - 3, 1000, 3100), "y", 3000, ("circ", 50), "aguafria",
            "RIGIDSEGMENT", "Tubo soldável - 50 mm",
            merge(common("pipesegment", ref="AF50"), qi(50, 3000), orc("06 Instalações", "06.01 Água fria", "PVC soldável 50 mm")),
            system="Água fria", layer="Hidráulica_AF_Conduto")
# P2: tubo AF Ø75 cruzando o duto de climatização no 1º pav
san.element("PIPESEGMENT", "AF barrilete 75", "1º Pavimento", (7500, 1000, 3500 + 2350), "y", 4000, ("circ", 75), "aguafria",
            "RIGIDSEGMENT", "Tubo soldável - 75 mm",
            merge(common("pipesegment", ref="AF75"), qi(75, 4000), orc("06 Instalações", "06.01 Água fria", "PVC soldável 75 mm")),
            system="Água fria", layer="Hidráulica_AF_Conduto")
san.finish()

# ---------------- ELÉTRICA ----------------
ele = Model("EXEMPLO-ELE.ifc", "ELE", "Elétrica")
ele.element("CABLECARRIERSEGMENT", "Eletrocalha EL-01", "Térreo", (500, 2000, 2600), "x", 11000, ("rect", 300, 100), "eletrica",
            "CABLETRAYSEGMENT", "Eletrocalha perfurada 300x100",
            merge(common("cablecarriersegment", ref="ELC300"), {"Pset_Eletrica": {"Circuito": "QD-T / C1-C8", "Tensão": "220 V"}},
                  orc("07 Elétrica", "07.02 Infraestrutura", "Eletrocalha perfurada 300x100")),
            system="Força e iluminação", layer="ELE_Eletrocalhas")
for i, x in enumerate([1500, 4500]):
    ele.element("LIGHTFIXTURE", "Luminária L%d" % (i + 1), "Térreo", (x, 4000, 2780), "z", 60, ("rect", 620, 620), "luminaria",
                "POINTSOURCE", "Luminária LED de embutir 60x60",
                merge(common("lightfixture", ref="LUM60"), {"Pset_Eletrica": {"Circuito": "C%d" % (i + 3), "Potência": "40 W"}},
                      orc("07 Elétrica", "07.03 Iluminação", "Luminária LED 60x60")),
                system="Força e iluminação", layer="ELE_Luminarias")
ele.finish()

# ---------------- CABEAMENTO ESTRUTURADO ----------------
sce = Model("EXEMPLO-SCE.ifc", "SCE", "Cabeamento estruturado")
# P2: eletrocalha de dados cruzando a eletrocalha elétrica na mesma cota
sce.element("CABLECARRIERSEGMENT", "Eletrocalha DADOS-01", "Térreo", (6600, 500, 2600), "y", 5000, ("rect", 200, 100), "cabeamento",
            "CABLETRAYSEGMENT", "Eletrocalha lisa 200x100",
            merge(common("cablecarriersegment", ref="ELD200"), {"Pset_Cabeamento": {"Categoria": "CAT6", "Rack": "RK-01"}},
                  orc("08 Cabeamento", "08.01 Infraestrutura", "Eletrocalha lisa 200x100")),
            system="Cabeamento estruturado", layer="SCE_Eletrocalhas")
# P3: eletroduto de dados encostando em luminária
sce.element("CABLECARRIERSEGMENT", "Eletrocalha DADOS-02", "Térreo", (500, 4000, 2830), "x", 2200, ("rect", 100, 50), "cabeamento",
            "CABLETRAYSEGMENT", "Eletrocalha lisa 100x50",
            merge(common("cablecarriersegment", ref="ELD100"), {"Pset_Cabeamento": {"Categoria": "CAT6", "Rack": "RK-01"}},
                  orc("08 Cabeamento", "08.01 Infraestrutura", "Eletrocalha lisa 100x50")),
            system="Cabeamento estruturado", layer="SCE_Eletrocalhas")
sce.finish()

# ---------------- CLIMATIZAÇÃO ----------------
cli = Model("EXEMPLO-CLI.ifc", "CLI", "Climatização")
# duto 400x300 no 1º pav: cruza AF 75 (P2) e passa a 10 mm do forro (folga < 25 mm => clearance)
cli.element("DUCTSEGMENT", "Duto insuflamento D-01", "1º Pavimento", (1000, 2500, 3500 + 2350), "x", 10000, ("rect", 400, 300), "duto",
            "RIGIDSEGMENT", "Duto chapa galvanizada 400x300",
            merge(common("ductsegment", ref="DT400"), {"Pset_Climatizacao": {"Vazão": "1200 m³/h", "Sistema": "Insuflamento"}},
                  orc("09 Climatização", "09.01 Dutos", "Duto chapa galvanizada 400x300")),
            system="Insuflamento", layer="CLI_Dutos")
cli.finish()

print(sorted(os.listdir(OUT)))
