"""estructura-viva.py — apunta los encabezados (h1…h6) de cada página de referencia,
en orden, para que la comprobación C1 compare la web nueva con el original.

Aplica la regla del H1 APROBADA por Yama el 23-10-2026:
  - las páginas que ya tienen un H1 no se tocan;
  - en las que no tienen ninguno (más vendidos ×26, rebajados, novedades, marca, contacto)
    el título visible (h2.page-heading sin el «Hay N productos») pasa a ser el H1;
    en contacto, el H1 es «Contacte con nosotros» (título de la página).
  - una página con dos o más H1 se avisa (en el original no hay ninguna).

Entrada:  referencia/rastreo-<idioma>.json y los HTML.
Salida:   src/data/estructura-viva.json (clave: ruta sin dominio) e informes/estructura-viva-<idioma>.md

Uso: python -I herramientas/estructura-viva.py --idioma es
"""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

from bs4 import BeautifulSoup

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ap = argparse.ArgumentParser()
ap.add_argument("--idioma", default="es")
ap.add_argument("--referencia", default="referencia")
ap.add_argument("--salida", default="src/data/estructura-viva.json")
args = ap.parse_args()

MANIFIESTO = Path(args.referencia) / f"rastreo-{args.idioma}.json"
filas = json.loads(MANIFIESTO.read_text(encoding="utf-8"))
SALIDA = Path(args.salida)
estructura = json.loads(SALIDA.read_text(encoding="utf-8")) if SALIDA.exists() else {}
# Reglas de contenido aprobadas por Yama (títulos/H1): mismo fichero que leen las plantillas.
_REGLAS = Path("src/data/reglas-contenido") / f"{args.idioma}.json"
REGLAS_H1 = {k: v["h1"] for k, v in (json.loads(_REGLAS.read_text(encoding="utf-8")).get("titulos", {}).get("categorias", {}) if _REGLAS.exists() else {}).items() if isinstance(v, dict) and v.get("h1")}

# Título del H1 para la página de contacto, por idioma (el <title> del original es
# «Contacte con nosotros - Telas de Mamá»; se toma la parte antes del guion).
def ruta(url):
    u = re.sub(r"^https?://(www\.)?telasdemama\.com", "", url.strip())
    return u[:-1] if u.endswith("/") and len(u) > 1 else u


def texto(el):
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True))


aplicadas = []
dobles = []
sin_titulo = []
contador = Counter()
for url, f in filas.items():
    if f.get("estado") != 200 or not f.get("fichero"):
        continue
    raw = Path(f["fichero"]).read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(raw, "lxml")
    # Las ventanas modales (ocultas; formularios de reseñas que necesitaban el servidor) no cuentan:
    # sus encabezados no forman parte de la lectura de la página.
    for modal in soup.select("div.modal"):
        modal.decompose()
    # Dec. 8 (sin cuentas de cliente): en el mapa del sitio desaparece la columna «Su cuenta».
    if f.get("tipo") == "sitemap":
        for col in soup.select(".sitemap .col-md-3"):
            if col.find("h2") and texto(col.find("h2")) == "Su cuenta":
                col.decompose()
    encs = []
    for h in soup.find_all(re.compile(r"^h[1-6]$")):
        t = texto(h)
        encs.append({"n": int(h.name[1]), "t": t})
    # Reglas de contenido aprobadas (src/data/reglas-contenido/<idioma>.json): H1 nuevo en ciertas categorías.
    if f.get("tipo") == "category" and REGLAS_H1.get(str(f.get("id"))):
        nuevo_h1 = REGLAS_H1[str(f.get("id"))]
        for e in encs:
            if e["n"] == 1:
                e["t"] = nuevo_h1
                break
    n_h1 = sum(1 for e in encs if e["n"] == 1)
    regla = None
    if n_h1 == 0:
        heading = soup.select_one("h2.page-heading")
        if heading:
            titulo = re.sub(r"\s*Hay \d+ productos?\.?\s*$", "", texto(heading))
            # el h2.page-heading pasa a h1 en su misma posición
            for e in encs:
                if e["n"] == 2 and e["t"] == texto(heading):
                    e["n"] = 1
                    e["t"] = titulo
                    break
            regla = {"h1_nuevo": titulo, "origen": "h2.page-heading"}
        elif f.get("tipo") == "contact":
            titulo = (soup.title.string or "").split(" - ")[0].strip() if soup.title else ""
            encs.insert(0, {"n": 1, "t": titulo})
            regla = {"h1_nuevo": titulo, "origen": "title de la página"}
        else:
            sin_titulo.append(ruta(url))
        if regla:
            aplicadas.append((ruta(url), regla["h1_nuevo"]))
    elif n_h1 > 1:
        dobles.append(ruta(url))
    contador[f.get("tipo")] += 1
    estructura[ruta(url)] = {
        "idioma": args.idioma,
        "tipo": f.get("tipo"),
        "fichero": f["fichero"].replace("\\", "/"),
        "encabezados": encs,
        **({"regla_h1": regla} if regla else {}),
    }

SALIDA.parent.mkdir(parents=True, exist_ok=True)
SALIDA.write_text(json.dumps(estructura, ensure_ascii=False, indent=1), encoding="utf-8")
lineas = [
    f"# Estructura viva ({args.idioma})",
    "",
    f"{sum(contador.values())} páginas; por tipo: {dict(contador)}.",
    f"Regla del H1 aplicada en {len(aplicadas)} páginas; con dos o más H1: {len(dobles)}; sin ningún título que promover: {len(sin_titulo)}.",
    "",
    "## Páginas en las que el título visible pasa a H1",
    *(f"- `{r}` → «{t}»" for r, t in aplicadas),
    "",
    "## Con dos o más H1 (avisar)",
    *([f"- `{r}`" for r in dobles] or ["- ninguna"]),
    "",
    "## Sin H1 ni título visible (avisar)",
    *([f"- `{r}`" for r in sin_titulo] or ["- ninguna"]),
]
Path("informes").mkdir(exist_ok=True)
Path(f"informes/estructura-viva-{args.idioma}.md").write_text("\n".join(lineas) + "\n", encoding="utf-8")
print("\n".join(lineas[:4]))
print(f"Escrito {SALIDA} ({len(estructura)} páginas en total)")
if dobles or sin_titulo:
    print("SE HA PARADO EN: estructura-viva (hay páginas con dos H1 o sin título)")
    sys.exit(1)
