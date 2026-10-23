"""extraer-ps.py — pasa el HTML de referencia de PrestaShop a JSON de catálogo.

Entrada:  referencia/rastreo-<idioma>.json y los HTML que apunta.
Salida:   src/data/catalogo/<idioma>/productos.json, categorias.json, cms.json, otras.json
          informes/extraccion-<idioma>.md (resumen y avisos)
          informes/contraste-csv-<idioma>.md si hay CSV en exports/ (precios y referencias)

De cada ficha se toma el JSON del atributo data-product (referencia, precios con y
sin IVA, tachado, descuento con fecha, stock, imágenes, descripciones, meta,
categoría por defecto) más lo que solo está en el HTML: breadcrumb, canonical,
hreflang, pestaña Accesorios, valoración visible.
NADA se inventa: lo que no está en el HTML queda vacío o null.

Uso: python -I herramientas/extraer-ps.py --idioma es [--seco]
"""
import argparse
import csv
import glob
import html as htmlmod
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

from bs4 import BeautifulSoup

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ap = argparse.ArgumentParser()
ap.add_argument("--idioma", default="es")
ap.add_argument("--referencia", default="referencia")
ap.add_argument("--salida", default="src/data/catalogo")
ap.add_argument("--seco", action="store_true", help="no escribe nada, solo cuenta")
args = ap.parse_args()

IDIOMA = args.idioma
DOMINIO = "https://telasdemama.com"
MANIFIESTO = Path(args.referencia) / f"rastreo-{IDIOMA}.json"
if not MANIFIESTO.exists():
    sys.exit(f"No existe {MANIFIESTO}")
filas = json.loads(MANIFIESTO.read_text(encoding="utf-8"))
SALIDA = Path(args.salida) / IDIOMA
avisos = []


def ruta(url):
    """URL absoluta → ruta sin dominio (como la pide el HTML), sin barra final."""
    if not url:
        return url
    u = re.sub(r"^https?://(www\.)?telasdemama\.com", "", url.strip())
    return u[:-1] if u.endswith("/") and len(u) > 1 else u


def texto(el):
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)) if el else ""


def inner(el):
    return "".join(str(c) for c in el.contents).strip() if el else ""


def cabecera(soup):
    """Lo común a toda página: título, meta, canonical, hreflang, breadcrumb, encabezado visible."""
    t = soup.title.string.strip() if soup.title and soup.title.string else ""
    md = soup.find("meta", attrs={"name": "description"})
    mk = soup.find("meta", attrs={"name": "keywords"})
    can = soup.find("link", rel="canonical")
    alt = {l.get("hreflang"): l.get("href") for l in soup.find_all("link", rel="alternate") if l.get("hreflang")}
    migas = []
    for li in soup.select("nav.breadcrumb li, .breadcrumb li"):
        a = li.find("a")
        migas.append({"texto": texto(li), "url": ruta(a.get("href")) if a and a.get("href") is not None else None})
    h1 = soup.find("h1")
    robots = soup.find("meta", attrs={"name": "robots"})
    return {
        "title": t,
        "meta_description": md.get("content", "").strip() if md else "",
        "meta_keywords": mk.get("content", "").strip() if mk else "",
        "meta_robots": robots.get("content", "") if robots else "",
        "canonical": can.get("href") if can else "",
        "hreflang": alt,
        "breadcrumb": migas,
        "h1": texto(h1) if h1 else "",
    }


def miniaturas(soup, ambito="#js-product-list"):
    """Ids de producto en el listado principal, en orden."""
    return [m.get("data-id-product") for m in soup.select(f"{ambito} .product-miniature") if m.get("data-id-product")]


def imagen_sin_tamano(url):
    """https://…/2318-large_default/popelin-andalucia.jpg → (2318, 'popelin-andalucia.jpg')"""
    m = re.search(r"/(\d+)-[a-z_]+/([^/]+)$", url or "")
    return (int(m.group(1)), m.group(2)) if m else (None, None)


# ---------------------------------------------------------------- productos
def producto(url, f, soup, raw):
    m = re.search(r'<[^>]+\bdata-product="([^"]*)"', raw)
    cab = cabecera(soup)
    sin_datos = False
    if m:
        d = json.loads(htmlmod.unescape(m.group(1)))
    else:
        # Fichas sin precio (show_price=0) en las que el tema no pinta el bloque de datos:
        # se toma lo visible en el HTML y se marca. Nada se inventa.
        sin_datos = True
        avisos.append(f"ficha sin data-product (se extrae del HTML visible): {url}")
        body = soup.body.get("class", [])
        pid = next((c[len("product-id-"):] for c in body if re.match(r"product-id-\d+$", c)), None)
        og = {mt.get("property"): mt.get("content") for mt in soup.select("meta[property]")}
        desc = soup.select_one(".product-description, #description .product-description")
        corta = soup.select_one(".product-information .product-description-short, #product-description-short, .product-description-short")
        imgs = []
        vistos = set()
        for im in soup.select(".product-cover img, .product-images img, .js-qv-product-images img"):
            src = im.get("data-image-large-src") or im.get("src")
            idi, nombre = imagen_sin_tamano(src)
            if idi and idi not in vistos:
                vistos.add(idi)
                imgs.append({"id": idi, "legend": im.get("alt", ""), "cover": not imgs,
                             "bySize": {t: {"url": f"{DOMINIO}/{idi}-{t}/{nombre}"} for t in ("home_default", "medium_default", "large_default")},
                             "large": {"url": f"{DOMINIO}/{idi}-large_default/{nombre}"}, "position": len(imgs) + 1})
        d = {
            "id_product": pid, "name": cab["h1"] or og.get("og:title", ""), "reference": texto(soup.select_one(".product-reference span")),
            "link_rewrite": re.search(r"/\d+-([^/]+)\.html", url).group(1),
            "id_category_default": next((c[len("product-id-category-"):] for c in body if c.startswith("product-id-category-")), 0),
            "category": re.search(r"/[a-z]{2}/([^/]+)/\d+-", url).group(1), "category_name": cab["breadcrumb"][1]["texto"] if len(cab["breadcrumb"]) > 2 else "",
            "show_price": "0", "description": inner(desc) if desc else "", "description_short": inner(corta) if corta else "",
            "images": imgs, "cover": imgs[0] if imgs else {}, "id_manufacturer": next((c[len("product-id-manufacturer-"):] for c in body if c.startswith("product-id-manufacturer-")), 0),
            "available_for_order": "1" if soup.select_one("#add-to-cart-or-refresh") else "0",
        }

    # imágenes en el orden de la ficha; se guardan id, nombre de fichero y las rutas por tamaño que usa el HTML
    imgs = []
    for im in d.get("images") or []:
        idi, nombre = imagen_sin_tamano(im.get("large", {}).get("url") or next(iter(im.get("bySize", {}).values()), {}).get("url"))
        imgs.append({
            "id": idi,
            "fichero": nombre,
            "portada": bool(im.get("cover")),
            "leyenda": im.get("legend", ""),
            "posicion": im.get("position"),
            "por_tamano": {k: ruta(v["url"]) for k, v in (im.get("bySize") or {}).items()},
        })
    portada = d.get("cover") or {}
    idp, nombrep = imagen_sin_tamano((portada.get("large") or {}).get("url"))

    # accesorios (pestaña), en orden
    acc = []
    for mi in soup.select("#accessories .product-miniature, .product-accessories .product-miniature"):
        a = mi.select_one("a.product-thumbnail") or mi.find("a", href=True)
        acc.append({"id": mi.get("data-id-product"), "url": ruta(a.get("href")) if a else None, "nombre": texto(mi.select_one(".product-title, h2, h3"))})

    # valoración visible (productcomments) y Revi
    rating = soup.select_one("[itemprop=aggregateRating]")
    valoracion = None
    if rating:
        valoracion = {
            "media": (rating.find(attrs={"itemprop": "ratingValue"}) or {}).get("content"),
            "opiniones": (rating.find(attrs={"itemprop": "reviewCount"}) or {}).get("content"),
        }
    comentarios = []
    for c in soup.select("#product-comments-list .product-comment, .product-comment-list-item"):
        comentarios.append({"titulo": texto(c.select_one(".comment-title, h4")), "texto": texto(c.select_one(".comment-content p, .comment-text")), "autor": texto(c.select_one(".comment-author, .comment-infos"))})

    # precio con y sin IVA, tachado, descuento y fecha de fin (specific_prices puede ser lista vacía o dict)
    sp = d.get("specific_prices")
    sp = sp if isinstance(sp, dict) else None
    etiqueta_disp = soup.select_one("#product-availability")
    cantidad_visible = soup.select_one(".product-quantities span")

    p = {
        "id": int(d["id_product"]),
        "url": ruta(url),
        "canonical": cab["canonical"],
        "hreflang": cab["hreflang"],
        "nombre": d.get("name", ""),
        "referencia": d.get("reference") or "",
        "ean13": d.get("ean13") or None,
        "mpn": d.get("mpn") or None,
        "link_rewrite": d.get("link_rewrite", ""),
        "categoria_defecto": {"id": int(d.get("id_category_default") or 0), "slug": d.get("category", ""), "nombre": d.get("category_name", "")},
        "breadcrumb": cab["breadcrumb"],
        "h1": cab["h1"],
        "title": cab["title"],
        "meta_title": d.get("meta_title") or "",
        "meta_description_visible": cab["meta_description"],
        "meta_description": d.get("meta_description") or "",
        "meta_keywords": d.get("meta_keywords") or "",
        "muestra_precio": d.get("show_price") == "1",
        "precio_visible": (d.get("price") or "").replace("\xa0", " "),
        "precio_con_iva": d.get("price_amount"),
        "precio_sin_iva": d.get("price_tax_exc"),
        "iva": d.get("rate"),
        "nombre_impuesto": d.get("tax_name", ""),
        "tiene_descuento": bool(d.get("has_discount")),
        "precio_tachado": d.get("price_without_reduction") if d.get("has_discount") else None,
        "descuento_tipo": d.get("discount_type"),
        "descuento_porcentaje": d.get("discount_percentage"),
        "descuento_importe": (d.get("discount_amount") or "").replace("\xa0", " ") or None,
        "oferta_desde": sp.get("from") if sp else None,
        "oferta_hasta": sp.get("to") if sp else None,
        "unidad": d.get("unity") or "",
        "precio_unidad": (d.get("unit_price") or "").replace("\xa0", " "),
        "stock": d.get("quantity"),
        "disponibilidad": d.get("availability"),
        "mensaje_disponibilidad": d.get("availability_message", "") or (texto(etiqueta_disp) if etiqueta_disp else ""),
        "muestra_cantidades": bool(d.get("show_quantities")),
        "cantidad_visible": texto(cantidad_visible) if cantidad_visible else "",
        "etiqueta_cantidad": d.get("quantity_label", ""),
        "cantidad_minima": int(d.get("minimal_quantity") or 1),
        "permitir_sin_stock": d.get("allow_oosp"),
        "disponible_para_pedido": d.get("available_for_order") == "1",
        "en_oferta": d.get("on_sale") == "1",
        "solo_online": d.get("online_only") == "1",
        "nuevo": str(d.get("new")) == "1",
        "estado": d.get("condition"),
        "fabricante_id": int(d.get("id_manufacturer") or 0),
        "fabricante": d.get("manufacturer_name") or "",
        "descripcion_corta": d.get("description_short") or "",
        "descripcion": d.get("description") or "",
        "caracteristicas": [{"nombre": x.get("name"), "valor": x.get("value")} for x in (d.get("features") or [])],
        "adjuntos": d.get("attachments") or [],
        "imagen_portada": {"id": idp, "fichero": nombrep},
        "imagenes": imgs,
        "combinaciones": d.get("combinations") or {},
        "atributos": d.get("attributes") or {},
        "accesorios": acc,
        "valoracion": valoracion,
        "opiniones": comentarios,
        "fecha_alta": d.get("date_add"),
        "fecha_modificacion": d.get("date_upd"),
        "sin_data_product": sin_datos,
        "fichero_referencia": f,
    }
    if (p["precio_con_iva"] is None or p["precio_con_iva"] == 0) and p["muestra_precio"]:
        avisos.append(f"precio 0 con precio visible: {url}")
    if not imgs:
        avisos.append(f"ficha sin imágenes: {url}")
    return p


# ---------------------------------------------------------------- categorías
def categoria(url, f, soup, raw, fila):
    cab = cabecera(soup)
    body = soup.body.get("class", [])
    def cls(prefijo):
        for c in body:
            if c.startswith(prefijo):
                return c[len(prefijo):]
        return None
    bc = soup.select_one(".block-category")
    desc = bc.select_one("#category-description, .category-description, .block-category-description") if bc else None
    img = bc.select_one("img") if bc else None
    subs = []
    for a in soup.select("#subcategories a, .subcategories a, #category-subcategories a"):
        subs.append({"url": ruta(a.get("href")), "nombre": texto(a)})
    sub_sel = soup.select_one(".block-categories, #search_filters")  # árbol lateral: lo pinta el módulo de facetas
    pag = soup.select_one(".pagination")
    total = None
    mtot = re.search(r"(\d+)\s*producto", texto(soup.select_one(".total-products, .showing, h2.page-heading")) if soup.select_one(".total-products, .showing, h2.page-heading") else "")
    if mtot:
        total = int(mtot.group(1))
    return {
        "id": int(fila.get("id") or cls("category-id-") or 0),
        "url": ruta(url),
        "canonical": cab["canonical"],
        "hreflang": cab["hreflang"],
        "nombre": cab["h1"],
        "h1": cab["h1"],
        "title": cab["title"],
        "meta_description": cab["meta_description"],
        "meta_keywords": cab["meta_keywords"],
        "breadcrumb": cab["breadcrumb"],
        "padre_id": int(cls("category-id-parent-") or 0),
        "nivel": int(cls("category-depth-level-") or 0),
        "slug": cls("category-") if cls("category-") and not cls("category-")[0].isdigit() else None,
        "descripcion": inner(desc) if desc else "",
        "imagen": ruta(img.get("src")) if img else None,
        "subcategorias": subs,
        "total_productos_declarado": total,
        "productos": miniaturas(soup),  # solo esta página; se juntan después con la paginación
        "paginas": 1,
        "fichero_referencia": f,
    }


# ---------------------------------------------------------------- CMS
def cms(url, f, soup, raw, fila):
    cab = cabecera(soup)
    cont = soup.select_one("#content.page-content, .page-content.page-cms, #content")
    return {
        "id": int(fila.get("id") or re.search(r"/content/(\d+)-", url).group(1)),
        "url": ruta(url),
        "canonical": cab["canonical"],
        "hreflang": cab["hreflang"],
        "nombre": cab["h1"],
        "h1": cab["h1"],
        "title": cab["title"],
        "meta_description": cab["meta_description"],
        "meta_keywords": cab["meta_keywords"],
        "breadcrumb": cab["breadcrumb"],
        "contenido": inner(cont) if cont else "",
        "caracteres": len(texto(cont)) if cont else 0,
        "fichero_referencia": f,
    }


# ---------------------------------------------------------------- otras
def otra(url, f, soup, raw, fila):
    cab = cabecera(soup)
    heading = soup.select_one("h2.page-heading")
    o = {
        "tipo": fila.get("tipo"),
        "url": ruta(url),
        "canonical": cab["canonical"],
        "hreflang": cab["hreflang"],
        "h1": cab["h1"],
        "titulo_visible": re.sub(r"\s*Hay \d+ productos?\.?\s*$", "", texto(heading)) if heading else cab["h1"],
        "title": cab["title"],
        "meta_description": cab["meta_description"],
        "breadcrumb": cab["breadcrumb"],
        "productos": miniaturas(soup),
        "fichero_referencia": f,
    }
    if fila.get("tipo") == "index":
        o["destacados"] = miniaturas(soup, "#main")
        o["banners"] = [{"src": ruta(i.get("src")), "alt": i.get("alt", ""), "enlace": ruta(i.find_parent("a").get("href")) if i.find_parent("a") else None}
                        for i in soup.select("#main img, .htmlbanners img, #carousel img")]
    if fila.get("tipo") == "manufacturer":
        o["id"] = int(fila.get("id") or 0)
    return o


# ---------------------------------------------------------------- recorrido
productos, categorias, paginas, cmss, otras = {}, {}, defaultdict(dict), {}, {}
redirecciones = {}
estados = Counter()
for url, fila in filas.items():
    estados[str(fila.get("estado"))] += 1
    if 300 <= (fila.get("estado") or 0) < 400:
        redirecciones[ruta(url)] = ruta(fila.get("redirige_a"))
        continue
    if fila.get("estado") != 200 or not fila.get("fichero"):
        continue
    f = fila["fichero"].replace("\\", "/")
    raw = Path(f).read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(raw, "lxml")
    tipo = fila.get("tipo")
    if tipo == "product":
        p = producto(url, f, soup, raw)
        if p:
            productos[p["id"]] = p
    elif tipo == "category":
        c = categoria(url, f, soup, raw, fila)
        n = int(re.search(r"page=(\d+)", url).group(1)) if "page=" in url else 1
        paginas[c["id"]][n] = c
    elif tipo == "cms":
        c = cms(url, f, soup, raw, fila)
        cmss[c["id"]] = c
    else:
        n = int(re.search(r"page=(\d+)", url).group(1)) if "page=" in url else 1
        o = otra(url, f, soup, raw, fila)
        clave = ruta(url).split("?")[0]
        if n == 1:
            o["paginas"] = 1
            otras[clave] = o
        else:
            otras.setdefault(clave, {"productos": [], "paginas": 1})
            otras[clave].setdefault("_pags", {})[n] = o["productos"]

# juntar paginación de categorías
for cid, pags in paginas.items():
    base = pags.get(1)
    if not base:
        avisos.append(f"categoría {cid} sin página 1")
        base = pags[min(pags)]
    ids = []
    for n in sorted(pags):
        ids.extend(pags[n]["productos"])
    base["productos"] = ids
    base["paginas"] = max(pags)
    if base["total_productos_declarado"] is not None and base["total_productos_declarado"] != len(ids):
        avisos.append(f"categoría {cid} {base['url']}: declara {base['total_productos_declarado']} productos y lista {len(ids)}")
    categorias[cid] = base
for clave, o in otras.items():
    if "_pags" in o:
        for n in sorted(o["_pags"]):
            o["productos"].extend(o["_pags"][n])
        o["paginas"] = max(o["_pags"]) if o["_pags"] else 1
        del o["_pags"]

# comprobaciones cruzadas
ids_listados = set()
for c in categorias.values():
    ids_listados.update(int(x) for x in c["productos"])
sin_listar = sorted(set(productos) - ids_listados)
no_rastreados = sorted(ids_listados - set(productos))
if sin_listar:
    avisos.append(f"{len(sin_listar)} fichas que no aparecen en ningún listado de categoría: {sin_listar[:20]}")
if no_rastreados:
    avisos.append(f"{len(no_rastreados)} productos listados sin ficha bajada: {no_rastreados[:20]}")
for p in productos.values():
    for a in p["accesorios"]:
        if a["id"] and int(a["id"]) not in productos:
            avisos.append(f"accesorio {a['id']} de la ficha {p['id']} no tiene ficha")
smarty = [p["url"] for p in productos.values() if re.search(r"\{\$|\{l s=", p["descripcion"] + p["descripcion_corta"])]
if smarty:
    avisos.append(f"variables de Smarty sin resolver en {len(smarty)} descripciones")

# ---------------------------------------------------------------- contraste con CSV del Back Office (si lo hay)
contraste = []
csvs = sorted(glob.glob("exports/*.csv"))
if csvs:
    for ruta_csv in csvs:
        with open(ruta_csv, encoding="utf-8-sig", newline="") as fh:
            muestra = fh.read(4096)
            fh.seek(0)
            dialecto = csv.Sniffer().sniff(muestra, delimiters=";,\t")
            lector = csv.DictReader(fh, dialect=dialecto)
            cols = {c.lower().strip(): c for c in lector.fieldnames or []}
            col_id = next((cols[c] for c in cols if c in ("id", "id_product", "product id", "id producto")), None)
            col_ref = next((cols[c] for c in cols if c in ("reference", "referencia", "product reference")), None)
            col_precio = next((cols[c] for c in cols if "price" in c or "precio" in c), None)
            if not col_id and not col_ref:
                contraste.append(f"{ruta_csv}: no reconozco columnas de id ni referencia ({lector.fieldnames})")
                continue
            vistos = 0
            for fila_csv in lector:
                pid = fila_csv.get(col_id) if col_id else None
                p = productos.get(int(pid)) if pid and pid.isdigit() else None
                if not p and col_ref:
                    p = next((x for x in productos.values() if x["referencia"] == fila_csv.get(col_ref)), None)
                if not p:
                    contraste.append(f"en CSV y no en el rastreo: id {pid} ref {fila_csv.get(col_ref)}")
                    continue
                vistos += 1
                if col_ref and (fila_csv.get(col_ref) or "") != p["referencia"]:
                    contraste.append(f"referencia distinta en {p['id']}: CSV «{fila_csv.get(col_ref)}» web «{p['referencia']}»")
                if col_precio:
                    try:
                        v = float((fila_csv.get(col_precio) or "").replace(",", "."))
                        if abs(v - float(p["precio_sin_iva"] or 0)) > 0.01 and abs(v - float(p["precio_con_iva"] or 0)) > 0.01:
                            contraste.append(f"precio distinto en {p['id']}: CSV {v} web {p['precio_sin_iva']} sin IVA / {p['precio_con_iva']} con IVA")
                    except ValueError:
                        pass
            contraste.append(f"{ruta_csv}: {vistos} productos cotejados")

# ---------------------------------------------------------------- salida
resumen = [
    f"# Extracción del catálogo ({IDIOMA})",
    "",
    f"Fuente: `{MANIFIESTO}` ({len(filas)} URL; estados {dict(estados)}).",
    "",
    f"- Productos: {len(productos)} (con precio visible {sum(1 for p in productos.values() if p['muestra_precio'])}, con descuento {sum(1 for p in productos.values() if p['tiene_descuento'])}, por metro {sum(1 for p in productos.values() if p['unidad'])}, sin imagen {sum(1 for p in productos.values() if not p['imagenes'])}, con accesorios {sum(1 for p in productos.values() if p['accesorios'])})",
    f"- Categorías: {len(categorias)} ({sum(c['paginas'] for c in categorias.values())} páginas de listado; vacías {sum(1 for c in categorias.values() if not c['productos'])})",
    f"- Páginas CMS: {len(cmss)} → " + ", ".join(f"{c['nombre']} ({c['caracteres']} caracteres)" for c in cmss.values()),
    f"- Otras páginas: {len(otras)} → " + ", ".join(sorted(otras)),
    f"- Redirecciones: {len(redirecciones)}",
    "",
    "## Avisos",
    *([f"- {a}" for a in avisos] or ["- ninguno"]),
    "",
    "## Contraste con CSV del Back Office",
    *([f"- {c}" for c in contraste] if csvs else ["- No hay ningún CSV en `exports/`: el contraste no se ha hecho. El catálogo sale solo del HTML en vivo."]),
]
print("\n".join(resumen))
if args.seco:
    sys.exit(0)
SALIDA.mkdir(parents=True, exist_ok=True)
def escribir(nombre, datos):
    (SALIDA / nombre).write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
escribir("productos.json", [productos[k] for k in sorted(productos)])
escribir("categorias.json", [categorias[k] for k in sorted(categorias)])
escribir("cms.json", [cmss[k] for k in sorted(cmss)])
escribir("otras.json", otras)
escribir("redirecciones.json", redirecciones)
Path("informes").mkdir(exist_ok=True)
Path(f"informes/extraccion-{IDIOMA}.md").write_text("\n".join(resumen) + "\n", encoding="utf-8")
if csvs:
    Path(f"informes/contraste-csv-{IDIOMA}.md").write_text("\n".join(f"- {c}" for c in contraste) + "\n", encoding="utf-8")
print(f"\nEscrito en {SALIDA}/ e informes/extraccion-{IDIOMA}.md")
