"""COORDIX · gera IFCs de carga (pequeno, médio e grande) para medir leitura e análise.
Estrutura (pilares e vigas em grade) e hidrossanitário (tubos que atravessam os pilares), em mm.
Reaproveita as classes do gerador de exemplos sem executá-lo. Saída: testes/ifc-carga/
Uso: python ferramentas/gerar_ifc_carga.py"""
import os, random

AQUI = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(AQUI, "gerar_ifc_exemplo.py"), encoding="utf-8").read()
ns = {"__file__": os.path.join(AQUI, "gerar_ifc_exemplo.py")}
exec(src.split("\nXS = [")[0], ns)  # só as definições (W, Model, guid…), sem gerar os exemplos
ns["OUT"] = os.path.join(AQUI, "..", "testes", "ifc-carga")
os.makedirs(ns["OUT"], exist_ok=True)
Model = ns["Model"]

TAMANHOS = {"P": (4, 4, 6), "M": (14, 12, 60), "G": (30, 26, 260)}  # pilares nx × ny por pavimento, tubos por pavimento

for nome, (nx, ny, ntubos) in TAMANHOS.items():
    rnd = random.Random(42)
    est = Model(f"CARGA-{nome}-EST.ifc", "EST", "Estrutura")
    san = Model(f"CARGA-{nome}-SAN.ifc", "SAN", "Hidrossanitário")
    for lv, z0 in ns["LEVELS"][:2]:
        for i in range(nx):
            for j in range(ny):
                x, y = i * 5000, j * 5000
                est.element("COLUMN", f"P{i}-{j}", lv, (x, y, z0), "z", 3000, ("rect", 300, 300), "concreto", type_name="Pilar 30x30")
                if i < nx - 1:
                    est.element("BEAM", f"V{i}-{j}", lv, (x + 150, y, z0 + 2600), "x", 4700, ("rect", 400, 150), "concreto", type_name="Viga 15x40")
        for k in range(ntubos):
            y = rnd.uniform(-200, (ny - 1) * 5000 + 200)
            z = z0 + rnd.uniform(300, 2900)
            x0 = rnd.uniform(-1000, (nx - 1) * 5000 * 0.5)
            comp = rnd.uniform(4000, (nx - 1) * 5000)
            san.element("PIPESEGMENT", f"Tubo {lv[:1]}{k}", lv, (x0, y, z), "x", comp, ("circ", rnd.choice([40, 75, 100, 150])), "aguafria",
                        type_name="Tubo PVC", system="Água fria")
    est.finish()
    san.finish()
    n_est = len(est.w.lines)
    print(f"{nome}: {sum(len(v) for v in est.contained.values())} elementos EST, {sum(len(v) for v in san.contained.values())} SAN")
