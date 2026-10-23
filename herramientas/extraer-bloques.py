"""extraer-bloques.py — saca de la referencia los bloques fijos que pintan los módulos de PrestaShop
(menú, pie, árbol de categorías, bloques laterales, portada, estrellas de Revi, etiquetas, tienda)
y los deja como datos en src/data/bloques/<idioma>/*.json para que las plantillas de Astro
los lean. Nada se escribe a mano: todo sale del HTML en vivo guardado en referencia/.

Uso: python -I herramientas/extraer-bloques.py --idioma es
"""
import argparse
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ap = argparse.ArgumentParser()
ap.add_argument("--idioma", default="es")
ap.add_argument("--referencia", default="referencia")
args = ap.parse_args()
IDIOMA = args.idioma
REF = Path(args.referencia)
SALIDA = Path("src/data/bloques") / IDIOMA
SALIDA.mkdir(parents=True, exist_ok=True)
DOMINIO = "https://telasdemama.com"
manifiesto = json.loads((REF / f"rastreo-{IDIOMA}.json").read_text(encoding="utf-8"))


def soup(fichero):
    return BeautifulSoup(Path(fichero).read_text(encoding="utf-8", errors="replace"), "lxml")


def texto(el):
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)) if el else ""


def texto_directo(el):
    """Solo el texto propio del elemento, sin el de sus hijos (p. ej. sin el glifo del icono)."""
    return re.sub(r"\s+", " ", "".join(s for s in el.find_all(string=True, recursive=False))).strip() if el else ""


def rel(href):
    """Dirección absoluta de la tienda vieja → ruta relativa a la raíz."""
    if not href:
        return href
    href = href.strip()
    for pref in (DOMINIO, "http://telasdemama.com", "//telasdemama.com", "http://www.telasdemama.com", "https://www.telasdemama.com"):
        if href.startswith(pref):
            href = href[len(pref):] or "/"
    return href


def guardar(nombre, datos):
    p = SALIDA / f"{nombre}.json"
    p.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  {p}: {len(datos) if hasattr(datos, '__len__') else ''}")


def fichero_de(url_rel):
    f = manifiesto.get(DOMINIO + url_rel) or manifiesto.get(DOMINIO + url_rel + "/")
    if not f or not f.get("fichero"):
        sys.exit(f"No está en la referencia: {url_rel}")
    return f["fichero"]


portada = soup(fichero_de(f"/{IDIOMA}/"))

# ---------- 1. Menú principal ----------
def nodo_menu(li):
    a = li.find("a", recursive=False)
    hijos_ul = li.select_one(":scope > div ul.top-menu, :scope > div > div > ul.top-menu")
    return {
        "id": li.get("id", ""),
        "clase": " ".join(li.get("class", [])),
        "texto": a.find(string=True, recursive=False).strip() if a and a.find(string=True, recursive=False) else texto(a),
        "href": rel(a.get("href")) if a else "",
        "hijos": [nodo_menu(x) for x in hijos_ul.find_all("li", recursive=False)] if hijos_ul else [],
    }

menu = [nodo_menu(li) for li in portada.select("#top-menu > li")]
guardar("menu", menu)

# ---------- 2. Cabecera: logo, contacto, idiomas ----------
cab = portada.select_one("#header")
logo = cab.select_one("#_desktop_logo img")
idiomas = []
for li in cab.select("#_desktop_language_selector .dropdown-menu li"):
    a = li.find("a")
    idiomas.append({"codigo": texto(a), "href": rel(a.get("href")), "actual": "current" in li.get("class", [])})
cabecera = {
    "logo": {"src": rel(logo.get("src")), "alt": logo.get("alt", "")},
    "bandera": rel(cab.select_one(".language-selector .lang-flag").get("src")),
    "idioma_actual": texto(cab.select_one(".language-selector .expand-more")),
    "idiomas": idiomas,
    "telefono": texto(cab.select_one(".shop-phone")),
    "telefono_href": cab.select_one(".shop-phone").get("href"),
    "correo": " ".join(s.strip() for s in cab.select_one('a[href^="mailto:"]').find_all(string=True, recursive=False)).strip(),
    "buscador": {
        "accion": rel(cab.select_one("#search_widget form").get("action")),
        "placeholder": cab.select_one("#search_widget input[name=s]").get("placeholder"),
        "titulo": texto(cab.select_one("#searchProducts")),
    },
    "cuenta": {"texto": texto(cab.select_one("#_desktop_user_info a span")), "title": cab.select_one("#_desktop_user_info a").get("title")},
}
guardar("cabecera", cabecera)

# ---------- 3. Pie ----------
pie = portada.select_one("#footer")
def lista_enlaces(ul):
    return [{"texto": texto(a), "href": rel(a.get("href")), "title": a.get("title", ""), "id": a.get("id", "")} for a in ul.select("a")]
columnas = []
for w in pie.select(".col-lg-4.links .wrapper"):
    columnas.append({"titulo": texto(w.select_one("p.h3")), "id": w.select_one("ul").get("id"), "enlaces": lista_enlaces(w.select_one("ul"))})
cuenta = pie.select_one("#block_myaccount_infos")
contacto_ul = pie.select_one("#footer_contact")
sobre = pie.select_one("#footer_block_1")
redes = []
for a in sobre.select("p a"):
    img = a.find("img")
    redes.append({"href": a.get("href"), "img": rel(img.get("src")), "alt": img.get("alt", ""), "width": img.get("width")})
leader = pie.select_one(".footer-one center")
pie_datos = {
    "boletin": {
        "titulo": texto(pie.select_one(".block_newsletter .h3")),
        "texto": texto(pie.select_one(".block_newsletter .conditions")),
        "placeholder": pie.select_one(".block_newsletter input[type=email]").get("placeholder"),
        "boton": texto(pie.select_one(".block_newsletter button")),
    },
    "sobre_nosotros": {
        "titulo": texto(pie.select_one(".footer-block.links .title .h3")),
        "logo": {"src": rel(sobre.select_one("img").get("src")), "alt": sobre.select_one("img").get("alt"), "width": sobre.select_one("img").get("width")},
        "copyright_html": str(sobre.select("p")[1]).strip(),
        "redes": redes,
    },
    "columnas": columnas,
    "cuenta": {"titulo": texto(cuenta.select_one("p.h3 a")), "href": rel(cuenta.select_one("p.h3 a").get("href")), "enlaces": lista_enlaces(cuenta.select_one("ul"))},
    "tienda": {
        "titulo": texto(pie.select_one(".block-contact-title")),
        "direccion_html": str(contacto_ul.select_one(".address-item")).strip(),
        "telefono_etiqueta": contacto_ul.select_one(".phone").find(string=True, recursive=False).strip(),
        "telefono": texto(contacto_ul.select_one(".phone span")),
        "correo_etiqueta": contacto_ul.select_one(".e-mail").find(string=True, recursive=False).strip(),
        "correo": texto(contacto_ul.select_one(".e-mail span")),
    },
    "leader": {"texto": texto(leader.select_one("p")), "img": rel(leader.select_one("img").get("src")), "width": leader.select_one("img").get("width"), "hr_style": leader.select_one("hr").get("style")},
}
guardar("pie", pie_datos)

# ---------- 4. Árbol de categorías en orden (del mapa del sitio) ----------
mapa = soup(fichero_de(f"/{IDIOMA}/mapa%20del%20sitio"))
def nodo_arbol(li):
    a = li.find("a", recursive=False)
    sub = li.find("ul", recursive=False)
    m = re.search(r"category-page-(\d+)", a.get("id", ""))
    return {"id": int(m.group(1)) if m else None, "nombre": texto(a), "href": rel(a.get("href")), "hijos": [nodo_arbol(x) for x in sub.find_all("li", recursive=False)] if sub else []}
col_cats = next(c for c in mapa.select(".sitemap .col-md-3") if "Categor" in texto(c.find("h2")))
arbol = [nodo_arbol(li) for li in col_cats.find("ul").find_all("li", recursive=False)]
guardar("arbol-categorias", arbol)
mapa_datos = {
    "titulo": texto(mapa.select_one(".sitemap-title")),
    "columnas": [],
}
for c in mapa.select(".sitemap .col-md-3"):
    titulo = texto(c.find("h2"))
    if "Categor" in titulo:
        mapa_datos["columnas"].append({"titulo": titulo, "tipo": "categorias"})
        continue
    def nodo_simple(li):
        a = li.find("a", recursive=False)
        sub = li.find("ul", recursive=False)
        return {"texto": texto(a), "href": rel(a.get("href")), "id": a.get("id", ""), "title": a.get("title", ""), "hijos": [nodo_simple(x) for x in sub.find_all("li", recursive=False)] if sub else []}
    mapa_datos["columnas"].append({"titulo": titulo, "tipo": "lista", "enlaces": [nodo_simple(li) for li in c.find("ul").find_all("li", recursive=False)]})
guardar("mapa-del-sitio", mapa_datos)

# ---------- 5. Bloques laterales (más vendidos, en oferta) ----------
cat = soup(fichero_de(f"/{IDIOMA}/3-telas"))
laterales = []
for sec in cat.select("#left-column section.featured-products"):
    todos = sec.select_one("a.all-product-link")
    laterales.append({"titulo": texto(sec.select_one("p.h6")), "productos": [int(a["data-id-product"]) for a in sec.select("article")],
                      "todos": {"texto": texto(todos), "href": rel(todos.get("href"))} if todos else None,
                      "con_descripcion": any(a.select_one("p.product_desc") for a in sec.select("article"))})
revi_lateral = cat.select_one("#left-column .revi_widget_vertical_99, #left-column [class^=revi_widget_vertical]")
guardar("laterales", {"bloques": laterales, "revi_vertical": bool(revi_lateral)})

# ---------- 6. Portada ----------
def banner_top(div):
    a = div.select_one("a.banner-link"); img = div.select_one("img.img-banner"); h = div.select_one("figcaption h4"); b = div.select_one("figcaption button")
    return {"clase": " ".join(div.get("class", [])), "href": rel(a.get("href")), "img": rel(img.get("src")), "alt": img.get("alt", ""), "titulo": texto(h), "titulo_clase": " ".join(h.get("class", [])), "boton": texto(b) if b else None}
def feature(div):
    a = div.select_one(".banner-link"); img = div.select_one("img.img-banner"); ic = div.select_one(".wrap-icon img")
    return {"href": rel(a.get("href")) if a.name == "a" else None, "img": rel(img.get("src")) if img else None, "img_alt": img.get("alt", "") if img else None,
            "icono": rel(ic.get("src")), "icono_alt": ic.get("alt", ""), "titulo": texto(div.select_one("figcaption h4")), "texto": texto(div.select_one("figcaption > p:not(.wrap-icon)"))}
destacados = portada.select_one(".js-carousel-featured")
promo = portada.select_one(".promo_about-us__inner")
portada_datos = {
    "banners_superiores": [banner_top(d) for d in portada.select("#htmlbanners1 .top-banner")],
    "destacados": {
        "titulo": texto(portada.select_one(".home-section .headline-section")),
        "productos": [int(a["data-id-product"]) for a in destacados.select("article")],
        "data": {k: v for k, v in destacados.attrs.items() if k.startswith("data-")},
        "mas": {"texto": texto(portada.select_one(".home-section .more-btn")), "href": rel(portada.select_one(".home-section .more-btn").get("href"))},
    },
    "promo": {"html": "".join(str(x) for x in promo.contents).strip(), "data": {k: v for k, v in portada.select_one(".htmlbanners3-inner").attrs.items() if k.startswith("data-")}},
    "caracteristicas": [feature(d) for d in portada.select("#htmlbanners5 .feature-item")],
    "revi_wide": re.search(r'revi\.io/widgets/wide/[^"]+', str(portada)).group(0) if re.search(r'revi\.io/widgets/wide/[^"]+', str(portada)) else None,
    "revi_texto": texto(portada.select_one(".revi_align_center")),
}
# rutas absolutas dentro del HTML de la promo → relativas
portada_datos["promo"]["html"] = portada_datos["promo"]["html"].replace(DOMINIO + "/", "/").replace("http://telasdemama.com/", "/")
guardar("portada", portada_datos)

# ---------- 7. Estrellas de Revi y etiquetas por producto (de todas las miniaturas y fichas) ----------
revi = {}
flags = {}
fichas = {}
for url, f in manifiesto.items():
    if f.get("estado") != 200 or not f.get("fichero"):
        continue
    s = soup(f["fichero"])
    for art in s.select("article.product-miniature"):
        pid = art.get("data-id-product")
        if pid not in revi:
            cont = art.select_one(".revi_stars_product_list_container")
            if cont:
                revi[pid] = {"estrellas": [int(re.search(r"ministar_active(\d)", " ".join(sp.get("class", []))).group(1)) for sp in cont.select(".ministar")], "texto": texto(cont.select_one(".revi_num_reviews"))}
            elif art.select_one(".revi_product_list_blank") is not None:
                revi[pid] = None
        fl = [{"clase": " ".join(li.get("class", [])), "texto": texto(li)} for li in art.select(".product-flags li")]
        if fl and pid not in flags:
            flags[pid] = {"miniatura": fl}
    if f.get("tipo") == "product":
        pid = str(f.get("id"))
        fl = [{"clase": " ".join(li.get("class", [])), "texto": texto(li)} for li in s.select(".product-cover .product-flags li")]
        if fl:
            flags.setdefault(pid, {})["ficha"] = fl
        ar = s.select_one(".product-comments-additional-info")
        disp = s.select_one("#product-availability")
        revi_rating = s.select_one(".product-additional-info .revi_rating_container")
        clase_producto = [c for c in s.body.get("class", []) if c.startswith("product-") and not re.match(r"product-(id-|available)", c)]
        leyendas = {}
        for im in s.select(".js-qv-product-images img.js-thumb"):
            m = re.search(r"/(\d+)-large_default/", im.get("data-image-large-src", ""))
            if m:
                leyendas[m.group(1)] = im.get("alt", "")
        fichas[pid] = {
            "clase_producto": clase_producto[0] if clase_producto else None,
            "leyendas": leyendas,
            "revi_rating_html": str(revi_rating) if revi_rating else "",
            "resenas_texto": texto(ar.select_one(".reviews_count")) if ar else "",
            "resenas_title": ar.select_one(".reviews_count").get("title") if ar and ar.select_one(".reviews_count") else "",
            "agregado": {m.get("itemprop"): m.get("content") for m in ar.select("[itemprop=aggregateRating] meta")} if ar else {},
            "disponibilidad_html": "".join(str(x) for x in disp.contents).strip() if disp else "",
            "otros_titulo": texto(s.select_one(".category-products .headline-section")),
            "otros": [int(a["data-id-product"]) for a in s.select(".category-products article")],
            "revi_script": (re.search(r'revi\.io/widgets/product/[^"]+', str(s)) or [None]) and (re.search(r'revi\.io/widgets/product/[^"]+', str(s)).group(0) if re.search(r'revi\.io/widgets/product/[^"]+', str(s)) else None),
        }
guardar("revi-miniaturas", revi)
guardar("etiquetas", flags)
guardar("fichas-extra", fichas)

# ---------- 7b. Facetas por categoría (solo las categorías las tienen) ----------
facetas = {}
for url, f in manifiesto.items():
    if f.get("estado") != 200 or f.get("tipo") != "category" or "?page=" in url:
        continue
    s = soup(f["fichero"])
    lista = []
    for fac in s.select("#search_filters .facet"):
        titulo = texto(fac.select_one(".facet-title.hidden-md-down"))
        slider = fac.select_one("ul.faceted-slider")
        if slider:
            lista.append({"titulo": titulo, "tipo": "slider", "min": slider.get("data-slider-min"), "max": slider.get("data-slider-max"),
                          "unidad": slider.get("data-slider-unit"), "etiqueta": texto(slider.select_one(".slider-title")), "especificaciones": slider.get("data-slider-specifications")})
        else:
            lista.append({"titulo": titulo, "tipo": "lista", "valores": [
                {"texto": a.find(string=True, recursive=False).strip() if a.find(string=True, recursive=False) else texto(a).split(" (")[0],
                 "magnitud": texto(a.select_one(".magnitude")), "q": re.sub(r".*\?q=", "", a.get("href", ""))}
                for a in fac.select("ul li a.search-link")]})
    clases_body = [c for c in s.body.get("class", []) if c.startswith("category-") and not re.match(r"category-(id|depth)", c)]
    facetas[str(f.get("id"))] = {"titulo": texto(s.select_one("#search_filters > p")), "facetas": lista,
                                 "activos_titulo": texto(s.select_one("#js-active-search-filters .active-filter-title")),
                                 "clase_body": clases_body[0] if clases_body else None,
                                 "orden": texto_directo(s.select_one(".products-sort-order .select-title"))}
guardar("facetas", facetas)

# ---------- 7c. Texto del orden por defecto en cada tipo de listado ----------
ordenes = {}
for url, f in manifiesto.items():
    if f.get("estado") != 200 or f.get("tipo") not in ("best-sales", "new-products", "prices-drop", "manufacturer") or "?page=" in url:
        continue
    s = soup(f["fichero"])
    st = s.select_one(".products-sort-order .select-title")
    if st:
        ordenes[f["tipo"]] = texto_directo(st)
guardar("ordenes", ordenes)

# ---------- 7d. Marcas: descripciones de la página de cada marca ----------
marcas = {}
for url, f in manifiesto.items():
    if f.get("estado") != 200 or f.get("tipo") != "manufacturer" or "/brand/" not in url:
        continue
    s = soup(f["fichero"])
    corta = s.select_one("#manufacturer-short_description")
    larga = s.select_one("#manufacturer-description")
    marcas[rel(url)] = {
        "descripcion_corta_html": "".join(str(x) for x in corta.contents).strip() if corta else "",
        "descripcion_html": "".join(str(x) for x in larga.contents).strip() if larga else "",
    }
guardar("marcas", marcas)

# ---------- 8. Tienda física ----------
tiendas = soup(fichero_de(f"/{IDIOMA}/tiendas"))
art = tiendas.select_one(".store-item")
tiendas_datos = {
    "intro": texto(tiendas.select_one("#main > p")),
    "tienda": {
        "id": art.get("id"),
        "img": rel(art.select_one(".store-picture img").get("src")), "img_alt": art.select_one(".store-picture img").get("alt"),
        "nombre": texto(art.select_one(".card-title")),
        "direccion_html": "".join(str(x) for x in art.select_one("address").contents).strip(),
        "horario": [{"dia": texto(tr.find("th")), "horas": [texto(li) for li in tr.select("td li")]} for tr in art.select("table tr")],
    },
}
guardar("tiendas", tiendas_datos)

# ---------- 9. Contacto ----------
contacto = soup(fichero_de(f"/{IDIOMA}/contactenos"))
form = contacto.select_one(".contact-form form")
contacto_datos = {
    "titulo": texto(form.select_one("h3")),
    "info_titulo": texto(contacto.select_one(".contact-rich h4")),
    "bloques": [{"icono": texto(b.select_one(".icon i")), "html": "".join(str(x) for x in b.select_one(".data").contents).strip(), "extra_html": str(b.select_one(":scope > a")) if b.select_one(":scope > a") else ""} for b in contacto.select(".contact-rich .block")],
    "campos": [{"etiqueta": texto(g.select_one("label")), "comentario": texto(g.select_one(".form-control-comment"))} for g in form.select(".form-group") if g.select_one("label")],
    "asuntos": [texto(o) for o in form.select("select option")],
    "placeholder_correo": form.select_one("input[name=from]").get("placeholder"),
    "placeholder_mensaje": form.select_one("textarea").get("placeholder"),
    "boton_adjunto": form.select_one("input[type=file]").get("data-buttontext"),
    "boton": form.select_one("input[type=submit]").get("value"),
}
guardar("contacto", contacto_datos)
print("Hecho.")
