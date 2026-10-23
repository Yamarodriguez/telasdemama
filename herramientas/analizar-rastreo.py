"""analizar-rastreo.py — lee lo que bajó rastrear-ps.mjs y saca el inventario de la Fase 0.

Entrada:  referencia/rastreo-<idioma>.json y los HTML que apunta.
Salida:   informes/analisis-<idioma>.md (para leer) y informes/analisis-<idioma>.json (para scripts).

Uso: python -I herramientas/analizar-rastreo.py --idioma es
Funciona con un rastreo a medias: analiza lo que haya.
"""
import argparse
import html as htmlmod
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

from bs4 import BeautifulSoup

sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # consola de Windows

ap = argparse.ArgumentParser()
ap.add_argument("--idioma", default="es")
ap.add_argument("--salida", default="referencia")
args = ap.parse_args()

MANIFIESTO = Path(args.salida) / f"rastreo-{args.idioma}.json"
if not MANIFIESTO.exists():
    sys.exit(f"No existe {MANIFIESTO}")
filas = json.loads(MANIFIESTO.read_text(encoding="utf-8"))
Path("informes").mkdir(exist_ok=True)

DOMINIO = "https://telasdemama.com"
PFX = f"{DOMINIO}/{args.idioma}/"


def texto(el):
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)) if el else ""


res = {
    "idioma": args.idioma,
    "estados": Counter(),
    "tipos": Counter(),
    "plantillas": Counter(),  # body id + layout
    "h1": {"0": [], "1": 0, "2+": []},
    "categorias": {},
    "productos": {},
    "cms": {},
    "otras": {},
    "modulos": Counter(),
    "tamanos_imagen": Counter(),
    "enlaces_rotos": defaultdict(list),  # destino -> páginas que enlazan
    "enlaces_a_404": defaultdict(list),
    "enlaces_externos": Counter(),
    "smarty_sin_resolver": [],
    "canonical_distinto": [],
    "titulos": defaultdict(list),
    "paginacion": {},
    "fallos_descarga": [],
    "cortas": [],
}

urls_404 = {u for u, f in filas.items() if f.get("estado") == 404}
redirecciones = {u: f.get("redirige_a") for u, f in filas.items() if 300 <= (f.get("estado") or 0) < 400}

for url, f in filas.items():
    estado = f.get("estado")
    res["estados"][str(estado)] += 1
    if estado != 200:
        if estado not in (301, 302, 404):
            res["fallos_descarga"].append({"url": url, "estado": estado, "error": f.get("error")})
        continue
    fichero = Path(f["fichero"]) if f.get("fichero") else None
    if not fichero or not fichero.exists():
        res["fallos_descarga"].append({"url": url, "estado": "sin fichero"})
        continue
    raw = fichero.read_text(encoding="utf-8", errors="replace")
    if f.get("corta"):
        res["cortas"].append(url)
    soup = BeautifulSoup(raw, "lxml")
    body = soup.body
    tipo = body.get("id", "?") if body else "?"
    clases = body.get("class", []) if body else []
    layout = next((c for c in clases if c.startswith("layout-")), "")
    res["tipos"][tipo] += 1
    res["plantillas"][f"{tipo} / {layout}"] += 1

    # H1
    h1s = soup.find_all("h1")
    if len(h1s) == 0:
        res["h1"]["0"].append(url)
    elif len(h1s) == 1:
        res["h1"]["1"] += 1
    else:
        res["h1"]["2+"].append({"url": url, "h1": [texto(h)[:60] for h in h1s]})

    # título, canonical
    t = texto(soup.title)
    res["titulos"][t].append(url)
    can = soup.find("link", rel="canonical")
    can = can.get("href") if can else ""
    url_sin_page = url.split("?page=")[0]
    if can and can != url and can != url_sin_page:
        res["canonical_distinto"].append({"url": url, "canonical": can})

    # módulos e imágenes
    for m in set(re.findall(r"/modules/([a-z0-9_]+)/", raw, re.I)):
        res["modulos"][m] += 1
    for m in re.findall(r"telasdemama\.com/\d+-([a-z_]+)/", raw):
        res["tamanos_imagen"][m] += 1
    if re.search(r"\{\$[a-z_]|\{l s=", raw):
        res["smarty_sin_resolver"].append(url)

    # enlaces
    for a in soup.find_all("a", href=True):
        h = a["href"].strip()
        if h in ("", "#", "javascript:void(0)", "javascript:;", "javascript:void(0);") or h.startswith("javascript:"):
            cls = " ".join(a.get("class", []))
            es_boton = a.get("data-toggle") or a.get("data-target") or a.get("data-link-action") or a.get("data-button-action") \
                or "toggle" in cls or "add-to-cart" in cls or "quick-view" in cls or "js-" in cls
            if not es_boton:
                res["enlaces_rotos"][h or "(vacío)"].append(f"{url} :: {texto(a)[:40] or a.get('class')}")
            continue
        if h.startswith("http") and "telasdemama.com" not in h:
            res["enlaces_externos"][re.sub(r"^(https?://[^/]+).*", r"\1", h)] += 1
            continue
        hn = h.replace("&amp;", "&").split("#")[0]
        if hn in urls_404:
            res["enlaces_a_404"][hn].append(url)

    # por tipo
    if tipo == "category":
        cid = next((c.split("-")[-1] for c in clases if c.startswith("category-id-") and not c.startswith("category-id-parent")), "")
        padre = next((c.split("-")[-1] for c in clases if c.startswith("category-id-parent-")), "")
        nivel = next((c.split("-")[-1] for c in clases if c.startswith("category-depth-level-")), "")
        total = soup.find(class_="total-products")
        n = re.search(r"(\d+)\s+producto", texto(total)) if total else None
        if not n:
            n = re.search(r"Hay\s+(\d+)\s+producto", texto(soup.select_one("#js-product-list-top, #products, #main")))
            if not n and re.search(r"Hay\s+(\d+)\s+producto", texto(soup.body)):
                n = re.search(r"Hay\s+(\d+)\s+producto", texto(soup.body))
        page = re.search(r"\?page=(\d+)", url)
        base = url_sin_page
        c = res["categorias"].setdefault(base, {"id": cid, "nombre": texto(h1s[0]) if h1s else "", "nivel": nivel, "padre": padre,
                                                "productos_declarados": int(n.group(1)) if n else (0 if total is not None else None),
                                                "paginas": 0, "miniaturas": 0, "subcategorias": 0, "descripcion_chars": 0, "facetas": 0})
        c["paginas"] += 1
        c["miniaturas"] += len(soup.select("#products .product-miniature, #js-product-list .product-miniature"))
        if not page:
            c["subcategorias"] = len(soup.select("#subcategories .subcategory-image, .subcategories-list li, #subcategories li"))
            desc = soup.select_one("#category-description")
            c["descripcion_chars"] = len(texto(desc))
            c["facetas"] = len(soup.select("#search_filters .facet"))
            c["imagen_categoria"] = bool(soup.select_one(".category-cover img, #category .category-cover img"))
    elif tipo == "product":
        pid = next((c.split("-")[-1] for c in clases if re.match(r"product-id-\d+$", c)), "")
        dp = soup.find(attrs={"data-product": True})
        d = {}
        if dp:
            try:
                d = json.loads(htmlmod.unescape(dp["data-product"]))
            except Exception:
                d = {}
        precio_visible = soup.select_one(".product-prices .current-price .price, .product-prices .price, #product .current-price .price")
        tachado = soup.select_one(".product-prices .regular-price, #product .regular-price")
        variantes = soup.select(".product-variants select option, .product-variants input[type=radio]")
        ppbs = soup.select_one("#ppbs_widget, .ppbs_widget, [id^=ppbs_]")
        segmento = re.sub(r"^.*?/es/([^/]+)/\d+-.*$", r"\1", url)
        def num(v):
            try:
                return float(str(v).replace(",", "."))
            except (TypeError, ValueError):
                return None
        res["productos"][url] = {
            "id": pid or d.get("id_product"),
            "nombre": texto(h1s[0]) if h1s else d.get("name"),
            "segmento_url": segmento,
            "referencia": d.get("reference"),
            "ean13": d.get("ean13"),
            "precio": num(d.get("price_amount")),
            "precio_sin_iva": num(d.get("price_tax_exc")),
            "precio_sin_reduccion": num(d.get("price_without_reduction")),
            "descuento": bool(d.get("has_discount")),
            "fin_oferta": (d.get("specific_prices") or {}).get("to") if isinstance(d.get("specific_prices"), dict) else None,
            "stock": num(d.get("quantity")),
            "disponibilidad": d.get("availability"),
            "mostrar_precio": str(d.get("show_price")) in ("1", "True"),
            "se_puede_pedir": str(d.get("available_for_order")) in ("1", "True"),
            "categoria_defecto": d.get("id_category_default"),
            "fabricante": d.get("manufacturer_name"),
            "imagenes": len(d.get("images") or []),
            "caracteristicas": len(d.get("features") or []),
            "combinaciones_opciones": len(variantes),
            "precio_por_medida": bool(ppbs),
            "unidad": d.get("unity") or "",
            "cantidad_minima": num(d.get("minimal_quantity")),
            "precio_visible": texto(precio_visible),
            "precio_tachado": texto(tachado),
            "descripcion_chars": len(texto(BeautifulSoup(d.get("description") or "", "lxml"))),
            "descripcion_corta_chars": len(texto(BeautifulSoup(d.get("description_short") or "", "lxml"))),
            "meta_title": d.get("meta_title") or "",
            "meta_description": d.get("meta_description") or "",
            "title": t,
            "hreflang": len(soup.find_all("link", rel="alternate", hreflang=True)),
            "accesorios": len(soup.select("#accessories .product-miniature, .product-accessories .product-miniature")),
            "opiniones_revi": bool(soup.select_one("[class*=revi_widget_product]")),
            "sin_precio": not texto(precio_visible),
            "sin_imagen": not (d.get("images") or []),
        }
    elif tipo == "cms":
        cid = next((c.split("-")[-1] for c in clases if c.startswith("cms-id-")), "")
        cont = soup.select_one("#content, .page-content, #main")
        res["cms"][url] = {"id": cid, "titulo": texto(h1s[0]) if h1s else t, "chars": len(texto(cont)), "title": t}
    else:
        res["otras"][url] = {"tipo": tipo, "titulo": texto(h1s[0]) if h1s else t, "chars": len(texto(body))}

# Derivados
productos = list(res["productos"].values())
cats = res["categorias"]
dup_titulos = {k: v for k, v in res["titulos"].items() if len(v) > 1}
dup_meta = Counter(p["meta_title"] for p in productos if p["meta_title"])
dup_meta = {k: v for k, v in dup_meta.items() if v > 1}
niveles = Counter(c["nivel"] for c in cats.values())
segmentos = Counter(p["segmento_url"] for p in productos)
total_declarado = {u: c["productos_declarados"] for u, c in cats.items()}

salida_json = {
    "idioma": args.idioma,
    "estados": dict(res["estados"]),
    "tipos": dict(res["tipos"]),
    "plantillas": dict(res["plantillas"]),
    "h1": {"0": res["h1"]["0"], "1": res["h1"]["1"], "2+": res["h1"]["2+"]},
    "categorias": cats,
    "productos": res["productos"],
    "cms": res["cms"],
    "otras": res["otras"],
    "modulos": dict(res["modulos"]),
    "tamanos_imagen": dict(res["tamanos_imagen"]),
    "enlaces_rotos": {k: v for k, v in res["enlaces_rotos"].items()},
    "enlaces_a_404": {k: v for k, v in res["enlaces_a_404"].items()},
    "enlaces_externos": dict(res["enlaces_externos"]),
    "smarty_sin_resolver": res["smarty_sin_resolver"],
    "canonical_distinto": res["canonical_distinto"],
    "titulos_duplicados": dup_titulos,
    "meta_title_duplicados": dup_meta,
    "redirecciones": redirecciones,
    "urls_404": sorted(urls_404),
    "fallos_descarga": res["fallos_descarga"],
    "cortas": res["cortas"],
}
Path(f"informes/analisis-{args.idioma}.json").write_text(json.dumps(salida_json, ensure_ascii=False, indent=1), encoding="utf-8")

L = []
w = L.append
w(f"# Análisis del rastreo ({args.idioma}) — {len(filas)} URL en el manifiesto\n")
w("## Estados HTTP\n")
for k, v in sorted(res["estados"].items()):
    w(f"- {k}: {v}")
if res["fallos_descarga"]:
    w(f"\n**Fallos de descarga definitivos: {len(res['fallos_descarga'])}** (hay que relanzar el rastreo)")
    for x in res["fallos_descarga"][:20]:
        w(f"- {x['estado']} {x['url']} {x.get('error') or ''}")
w("\n## Tipos de plantilla (body id / layout)\n")
for k, v in res["plantillas"].most_common():
    w(f"- {v:4d}  {k}")
w("\n## Recuentos\n")
w(f"- Categorías: {len(cats)} (niveles: {dict(sorted(niveles.items()))})")
w(f"- Páginas de paginación: {sum(c['paginas'] for c in cats.values()) - len(cats)} (categorías con más de una página: {sum(1 for c in cats.values() if c['paginas'] > 1)})")
w(f"- Productos (fichas distintas): {len(productos)}")
w(f"- Tramo intermedio de la URL de ficha: {dict(segmentos.most_common())}")
w(f"- Páginas CMS: {len(res['cms'])}")
w(f"- Otras páginas: {len(res['otras'])}")
w(f"- Redirecciones: {len(redirecciones)} · 404: {len(urls_404)}")
if productos:
    w("\n## Productos: cosas que importan para la Dec. 8 y 9\n")
    w(f"- Con descuento (precio tachado): {sum(1 for p in productos if p['descuento'])}")
    w(f"- Sin precio visible: {sum(1 for p in productos if p['sin_precio'])}")
    w(f"- Sin imagen: {sum(1 for p in productos if p['sin_imagen'])}")
    w(f"- Con selector de combinaciones (talla/color): {sum(1 for p in productos if p['combinaciones_opciones'])}")
    w(f"- Con precio por medida (módulo productpricebysize): {sum(1 for p in productos if p['precio_por_medida'])}")
    w(f"- Con unidad declarada (p. ej. metro): {Counter(p['unidad'] for p in productos).most_common(5)}")
    w(f"- Cantidad mínima > 1: {sum(1 for p in productos if (p['cantidad_minima'] or 1) > 1)}")
    w(f"- Stock 0 o negativo: {sum(1 for p in productos if (p['stock'] or 0) <= 0)} · disponibilidad: {Counter(p['disponibilidad'] for p in productos).most_common()}")
    w(f"- No se puede pedir (available_for_order=0): {sum(1 for p in productos if not p['se_puede_pedir'])}")
    w(f"- Con fabricante/marca: {sum(1 for p in productos if p['fabricante'])}")
    w(f"- Con características (ficha técnica): {sum(1 for p in productos if p['caracteristicas'])}")
    w(f"- Con accesorios: {sum(1 for p in productos if p['accesorios'])}")
    w(f"- Con EAN: {sum(1 for p in productos if p['ean13'])} · con referencia: {sum(1 for p in productos if p['referencia'])}")
    w(f"- Imágenes por ficha: {Counter(p['imagenes'] for p in productos).most_common(8)}")
    w(f"- Descripción larga vacía: {sum(1 for p in productos if p['descripcion_chars'] == 0)} · corta vacía: {sum(1 for p in productos if p['descripcion_corta_chars'] == 0)}")
    w(f"- Meta description vacía: {sum(1 for p in productos if not p['meta_description'])} · meta title vacío: {sum(1 for p in productos if not p['meta_title'])}")
    w(f"- hreflang por ficha: {Counter(p['hreflang'] for p in productos).most_common(3)}")
    rango = sorted(p["precio"] for p in productos if isinstance(p["precio"], (int, float)))
    if rango:
        w(f"- Precio mínimo/mediano/máximo: {rango[0]} / {rango[len(rango)//2]} / {rango[-1]} €")
    sin_precio = [p for p in productos if p["sin_precio"]]
    if sin_precio:
        w("\nFichas sin precio visible:")
        for p in sin_precio[:30]:
            w(f"- {p['id']} {p['nombre']} (mostrar_precio={p['mostrar_precio']}, stock={p['stock']})")
w("\n## H1\n")
w(f"- Páginas con 1 H1: {res['h1']['1']}")
w(f"- Páginas con 0 H1: {len(res['h1']['0'])}")
for u in res["h1"]["0"][:30]:
    w(f"  - {u}")
w(f"- Páginas con 2 o más H1: {len(res['h1']['2+'])}")
for x in res["h1"]["2+"][:30]:
    w(f"  - {x['url']} → {x['h1']}")
w("\n## Categorías\n")
w("| id | nivel | nombre | productos | páginas | miniaturas | subcat. | descr. | facetas | URL |")
w("|---|---|---|---|---|---|---|---|---|---|")
for u, c in sorted(cats.items(), key=lambda kv: (kv[1]["nivel"], int(kv[1]["id"] or 0))):
    w(f"| {c['id']} | {c['nivel']} | {c['nombre']} | {c['productos_declarados']} | {c['paginas']} | {c['miniaturas']} | {c['subcategorias']} | {c['descripcion_chars']} | {c['facetas']} | {u.replace(DOMINIO, '')} |")
w("\n## Páginas CMS\n")
for u, c in sorted(res["cms"].items(), key=lambda kv: int(kv[1]["id"] or 0)):
    w(f"- {c['id']} · {c['titulo']} · {c['chars']} caracteres · {u.replace(DOMINIO, '')}")
w("\n## Otras páginas\n")
for u, c in sorted(res["otras"].items()):
    w(f"- {c['tipo']} · {c['titulo'][:60]} · {u.replace(DOMINIO, '')}")
w("\n## Redirecciones encontradas\n")
for u, d in sorted(redirecciones.items()):
    w(f"- {u.replace(DOMINIO, '')} → {d}")
w("\n## URL que dan 404 (y quién enlaza)\n")
for u in sorted(urls_404):
    quien = res["enlaces_a_404"].get(u, [])
    w(f"- {u.replace(DOMINIO, '')} ← {len(quien)} páginas" + (f" (p. ej. {quien[0].replace(DOMINIO, '')})" if quien else ""))
w("\n## Enlaces rotos en el HTML (# o vacíos, sin ser botones)\n")
for h, lista in sorted(res["enlaces_rotos"].items(), key=lambda kv: -len(kv[1])):
    w(f"- `{h}` en {len(lista)} sitios; p. ej.: {lista[0]}")
w("\n## Dominios externos enlazados\n")
for k, v in res["enlaces_externos"].most_common():
    w(f"- {k}: {v}")
w("\n## Módulos de PrestaShop que escriben en el HTML (nº de páginas)\n")
for k, v in res["modulos"].most_common():
    w(f"- {k}: {v}")
w("\n## Tamaños de imagen usados en el HTML\n")
for k, v in res["tamanos_imagen"].most_common():
    w(f"- {k}: {v}")
w("\n## Canonical distinto de la URL\n")
for x in res["canonical_distinto"][:40]:
    w(f"- {x['url']} → {x['canonical']}")
w(f"\n## Títulos duplicados: {len(dup_titulos)} títulos repartidos en {sum(len(v) for v in dup_titulos.values())} páginas\n")
for k, v in sorted(dup_titulos.items(), key=lambda kv: -len(kv[1]))[:25]:
    w(f"- «{k}» ×{len(v)}: {', '.join(x.replace(DOMINIO, '') for x in v[:4])}{' …' if len(v) > 4 else ''}")
w(f"\n## Variables de Smarty sin resolver: {len(res['smarty_sin_resolver'])}\n")
for u in res["smarty_sin_resolver"][:10]:
    w(f"- {u}")
w(f"\n## Páginas cortas (< 5000 caracteres): {len(res['cortas'])}\n")
for u in res["cortas"][:20]:
    w(f"- {u}")

Path(f"informes/analisis-{args.idioma}.md").write_text("\n".join(L) + "\n", encoding="utf-8")
print("\n".join(L[:60]))
print(f"\n… informe completo en informes/analisis-{args.idioma}.md y .json")
