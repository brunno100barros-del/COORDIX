"""Gera o IFC de teste da camada de dados (Assistente, Auditoria e Quantitativos) com valores CONHECIDOS.

Saída: testes/ifc-dados/DADOS-EST.ifc (IFC4, comprimento em mm, área em m², volume em m³, massa em kg).
Cada elemento existe para provar uma regra; os valores esperados estão em testes/ifc-dados/esperado.json.

  V1  viga  · TÉRREO       · instância: Qto Length 5000 mm, NetVolume 0,12 m³ · material Concreto C30 (instância)
  V2  viga  · 1º PAVIMENTO · sem Qto na instância; o TIPO declara NetVolume 0,20 m³ · material no TIPO (Concreto C40)
  P1  pilar · TÉRREO       · instância NetVolume 0,09 m³ e TIPO NetVolume 0,10 m³ (divergência) · camadas: Concreto C30
  W1  parede· TÉRREO       · NetSideArea 12,5 m² · Pset_WallCommon.FireRating vazio, IsExternal = T · classificação NBR 15965
  W2  parede· 1º PAVIMENTO · sem material, sem classificação, sem Qto (ausências)
  A1  montagem · TÉRREO    · NetVolume 1,0 m³ (declarado na montagem) com duas partes M1 e M2 de 0,3 m³ cada
  T1  tubo  · TÉRREO       · Dimensões.DiametroNominal = 150 mm (IFCPOSITIVELENGTHMEASURE)
  T2  tubo  · TÉRREO       · Dimensões.DiametroNominal = 75 mm
  C1  cabo  · TÉRREO       · Qto Length com unidade própria (metro): 2,5 m
  S1  laje  · TÉRREO       · peso declarado 250 kg (IfcQuantityWeight)
"""
import json, os, uuid

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(RAIZ, "testes", "ifc-dados")
os.makedirs(OUT, exist_ok=True)
_CH = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$"
_seq = [0]


def guid():
    # determinístico (o arquivo gerado não muda entre execuções)
    _seq[0] += 1
    n = uuid.uuid5(uuid.NAMESPACE_URL, "coordix-dados-%d" % _seq[0]).int
    s = ""
    for _ in range(22):
        s = _CH[n % 64] + s
        n //= 64
    return _CH[_CH.index(s[0]) % 4] + s[1:]


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


L = []


def add(t):
    L.append(t)
    return "#%d" % len(L)


origin = add("IFCCARTESIANPOINT((0.,0.,0.))")
dz = add("IFCDIRECTION((0.,0.,1.))")
wcs = add("IFCAXIS2PLACEMENT3D(%s,$,$)" % origin)
p2d = add("IFCAXIS2PLACEMENT2D(%s,$)" % add("IFCCARTESIANPOINT((0.,0.))"))
ctx = add("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,%s,$)" % wcs)
body = add("IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,%s,$,.MODEL_VIEW.,$)" % ctx)
u_len = add("IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)")
u_area = add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)")
u_vol = add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)")
u_mass = add("IFCSIUNIT(*,.MASSUNIT.,.KILO.,.GRAM.)")
u_m = add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)")  # unidade própria de uma quantidade (não está no projeto)
units = add("IFCUNITASSIGNMENT((%s,%s,%s,%s))" % (u_len, u_area, u_vol, u_mass))
proj = add("IFCPROJECT('%s',$,'COORDIX dados',$,$,$,$,(%s),%s)" % (guid(), ctx, units))
lp = add("IFCLOCALPLACEMENT($,%s)" % wcs)
site = add("IFCSITE('%s',$,'Terreno',$,$,%s,$,$,.ELEMENT.,$,$,$,$,$)" % (guid(), lp))
bld = add("IFCBUILDING('%s',$,'Bloco teste',$,$,%s,$,$,.ELEMENT.,$,$,$)" % (guid(), lp))
add("IFCRELAGGREGATES('%s',$,$,$,%s,(%s))" % (guid(), proj, site))
add("IFCRELAGGREGATES('%s',$,$,$,%s,(%s))" % (guid(), site, bld))
ST = {}
for nome, z in (("TÉRREO", 0), ("1º PAVIMENTO", 3500)):
    ST[nome] = add("IFCBUILDINGSTOREY('%s',$,%s,$,$,%s,$,$,.ELEMENT.,%s)" % (guid(), enc(nome), lp, f(z)))
add("IFCRELAGGREGATES('%s',$,$,$,%s,(%s))" % (guid(), bld, ",".join(ST.values())))
cont = {k: [] for k in ST}
GUIDS = {}


def caixa(x, y, z, dx, dy, dz_):
    loc = add("IFCAXIS2PLACEMENT3D(%s,$,$)" % add("IFCCARTESIANPOINT((%s,%s,%s))" % (f(x), f(y), f(z))))
    plc = add("IFCLOCALPLACEMENT(%s,%s)" % (lp, loc))
    prof = add("IFCRECTANGLEPROFILEDEF(.AREA.,$,%s,%s,%s)" % (p2d, f(dx), f(dy)))
    solid = add("IFCEXTRUDEDAREASOLID(%s,$,%s,%s)" % (prof, dz, f(dz_)))
    rep = add("IFCSHAPEREPRESENTATION(%s,'Body','SweptSolid',(%s))" % (body, solid))
    return plc, add("IFCPRODUCTDEFINITIONSHAPE($,$,(%s))" % rep)


def elemento(rotulo, cls, nome, andar, pos, predef="NOTDEFINED", tem_andar=True):
    plc, pds = caixa(*pos)
    g = guid()
    GUIDS[rotulo] = g
    if cls == "ELEMENTASSEMBLY":
        e = add("IFCELEMENTASSEMBLY('%s',$,%s,$,$,%s,%s,$,.NOTDEFINED.,.%s.)" % (g, enc(nome), plc, pds, predef))
    else:
        e = add("IFC%s('%s',$,%s,$,$,%s,%s,$,.%s.)" % (cls, g, enc(nome), plc, pds, predef))
    if tem_andar:
        cont[andar].append(e)
    return e


def pset(alvos, nome, props):
    itens = []
    for k, (tipo, v) in props.items():
        if v is None:
            itens.append(add("IFCPROPERTYSINGLEVALUE(%s,$,$,$)" % enc(k)))
        elif tipo == "LABEL":
            itens.append(add("IFCPROPERTYSINGLEVALUE(%s,$,IFCLABEL(%s),$)" % (enc(k), enc(v))))
        elif tipo == "BOOLEAN":
            itens.append(add("IFCPROPERTYSINGLEVALUE(%s,$,IFCBOOLEAN(.%s.),$)" % (enc(k), "T" if v else "F")))
        else:
            itens.append(add("IFCPROPERTYSINGLEVALUE(%s,$,IFC%s(%s),$)" % (enc(k), tipo, f(v))))
    ps = add("IFCPROPERTYSET('%s',$,%s,$,(%s))" % (guid(), enc(nome), ",".join(itens)))
    if alvos:
        add("IFCRELDEFINESBYPROPERTIES('%s',$,$,$,(%s),%s)" % (guid(), ",".join(alvos), ps))
    return ps


def qto(alvos, nome, qs):
    itens = []
    for k, (tipo, v, *resto) in qs.items():
        campo_unid = resto[0] if resto else "$"
        itens.append(add("IFCQUANTITY%s(%s,$,%s,%s,$)" % (tipo, enc(k), campo_unid, f(v))))
    q = add("IFCELEMENTQUANTITY('%s',$,%s,$,$,(%s))" % (guid(), enc(nome), ",".join(itens)))
    if alvos:
        add("IFCRELDEFINESBYPROPERTIES('%s',$,$,$,(%s),%s)" % (guid(), ",".join(alvos), q))
    return q


def material(alvos, rel):
    add("IFCRELASSOCIATESMATERIAL('%s',$,$,$,(%s),%s)" % (guid(), ",".join(alvos), rel))


c30 = add("IFCMATERIAL('Concreto C30',$,$)")
c40 = add("IFCMATERIAL('Concreto C40',$,$)")

V1 = elemento("V1", "BEAM", "V1", "TÉRREO", (0, 0, 3000, 200, 400, 5000))
qto([V1], "Qto_BeamBaseQuantities", {"Length": ("LENGTH", 5000), "NetVolume": ("VOLUME", 0.12)})
material([V1], c30)

V2 = elemento("V2", "BEAM", "V2", "1º PAVIMENTO", (3000, 0, 6500, 200, 500, 4000))
tv = add("IFCBEAMTYPE('%s',$,'Viga tipo 20x50',$,$,(%s),$,$,$,.BEAM.)" % (guid(), qto([], "Qto_BeamBaseQuantities", {"NetVolume": ("VOLUME", 0.20)})))
add("IFCRELDEFINESBYTYPE('%s',$,$,$,(%s),%s)" % (guid(), V2, tv))
material([tv], c40)

P1 = elemento("P1", "COLUMN", "P1", "TÉRREO", (6000, 0, 0, 300, 300, 3000))
qto([P1], "Qto_ColumnBaseQuantities", {"NetVolume": ("VOLUME", 0.09)})
tp = add("IFCCOLUMNTYPE('%s',$,'Pilar 30x30',$,$,(%s),$,$,$,.COLUMN.)" % (guid(), qto([], "Qto_ColumnBaseQuantities", {"NetVolume": ("VOLUME", 0.10)})))
add("IFCRELDEFINESBYTYPE('%s',$,$,$,(%s),%s)" % (guid(), P1, tp))
camada = add("IFCMATERIALLAYER(%s,%s,$,$,$,$,$)" % (c30, f(300)))
lset = add("IFCMATERIALLAYERSET((%s),'Pilar',$)" % camada)
material([P1], add("IFCMATERIALLAYERSETUSAGE(%s,.AXIS2.,.POSITIVE.,0.,$)" % lset))

W1 = elemento("W1", "WALL", "Parede W1", "TÉRREO", (0, 2000, 0, 5000, 150, 2500))
qto([W1], "Qto_WallBaseQuantities", {"NetSideArea": ("AREA", 12.5)})
pset([W1], "Pset_WallCommon", {"FireRating": ("LABEL", ""), "IsExternal": ("BOOLEAN", True)})
fonte_cls = add("IFCCLASSIFICATION('ABNT','2015',$,'NBR 15965',$,$,$)")
ref_cls = add("IFCCLASSIFICATIONREFERENCE($,'3E.01.20.10',%s,%s,$,$)" % (enc("Parede de vedação"), fonte_cls))
add("IFCRELASSOCIATESCLASSIFICATION('%s',$,$,$,(%s),%s)" % (guid(), W1, ref_cls))

W2 = elemento("W2", "WALL", "Parede W2", "1º PAVIMENTO", (0, 4000, 3500, 5000, 150, 2500))
pset([W2], "Pset_WallCommon", {"IsExternal": ("BOOLEAN", False)})

A1 = elemento("A1", "ELEMENTASSEMBLY", "Treliça A1", "TÉRREO", (9000, 0, 0, 100, 100, 100))
qto([A1], "Qto_AssemblyQuantities", {"NetVolume": ("VOLUME", 1.0)})
M1 = elemento("M1", "MEMBER", "Banzo M1", "TÉRREO", (9000, 0, 200, 100, 100, 3000), tem_andar=False)
M2 = elemento("M2", "MEMBER", "Banzo M2", "TÉRREO", (9000, 500, 200, 100, 100, 3000), tem_andar=False)
qto([M1], "Qto_MemberBaseQuantities", {"NetVolume": ("VOLUME", 0.3)})
qto([M2], "Qto_MemberBaseQuantities", {"NetVolume": ("VOLUME", 0.3)})
add("IFCRELAGGREGATES('%s',$,$,$,%s,(%s,%s))" % (guid(), A1, M1, M2))

T1 = elemento("T1", "PIPESEGMENT", "Tubo 150", "TÉRREO", (0, 8000, 2800, 160, 160, 3000))
pset([T1], "Dimensões", {"DiametroNominal": ("POSITIVELENGTHMEASURE", 150)})
T2 = elemento("T2", "PIPESEGMENT", "Tubo 75", "TÉRREO", (0, 9000, 2800, 80, 80, 3000))
pset([T2], "Dimensões", {"DiametroNominal": ("POSITIVELENGTHMEASURE", 75)})

C1 = elemento("C1", "CABLESEGMENT", "Cabo C1", "TÉRREO", (0, 10000, 2900, 20, 20, 2500))
qto([C1], "Qto_CableSegmentBaseQuantities", {"Length": ("LENGTH", 2.5, u_m)})

S1 = elemento("S1", "SLAB", "Laje S1", "TÉRREO", (0, 12000, 0, 2000, 2000, 120))
qto([S1], "Qto_SlabBaseQuantities", {"GrossWeight": ("WEIGHT", 250)})

for nome, els in cont.items():
    add("IFCRELCONTAINEDINSPATIALSTRUCTURE('%s',$,$,$,(%s),%s)" % (guid(), ",".join(els), ST[nome]))

cab = ("ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\n"
       "FILE_NAME('DADOS-EST.ifc','2026-11-15T09:00:00',('COORDIX'),('COORDIX'),'COORDIX teste','COORDIX','');\n"
       "FILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n")
with open(os.path.join(OUT, "DADOS-EST.ifc"), "w", encoding="ascii", newline="\n") as fh:
    fh.write(cab + "\n".join("#%d=%s;" % (i + 1, t) for i, t in enumerate(L)) + "\nENDSEC;\nEND-ISO-10303-21;\n")

esperado = {
    "guids": GUIDS,
    "netVolume_total_m3": 0.12 + 0.20 + 0.09 + 0.3 + 0.3,  # V1 + V2 (tipo) + P1 (instância) + partes M1+M2 (montagem A1 não somada)
    "netVolume_origem": {"elemento": 4, "tipo": 1},
    "divergencias_tipo": ["P1"],
    "montagem_nao_somada": ["A1"],
    "comprimento_V1_m": 5.0,
    "comprimento_C1_m": 2.5,
    "area_W1_m2": 12.5,
    "massa_S1_kg": 250.0,
    "material": {"V1": ["Concreto C30"], "V2": ["Concreto C40"], "P1": ["Concreto C30"], "W2": []},
    "material_origem": {"V1": "elemento", "V2": "tipo", "P1": "elemento"},
    "classificacao_W1": {"sistema": "NBR 15965", "codigo": "3E.01.20.10", "nome": "Parede de vedação"},
    "tubos_acima_100mm": ["T1"],
    "pavimentos": {"TÉRREO": 10, "1º PAVIMENTO": 2},  # M1 e M2 ficam no térreo pela montagem A1
}
with open(os.path.join(OUT, "esperado.json"), "w", encoding="utf-8") as fh:
    json.dump(esperado, fh, ensure_ascii=False, indent=1)
print("gerado:", os.path.join(OUT, "DADOS-EST.ifc"), len(L), "entidades")
