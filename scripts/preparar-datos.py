"""Convierte Natural Earth (dominio público) en GeoJSON ligeros para el portal.

Uso: python3 scripts/preparar-datos.py   (lee data-raw/, escribe public/data/)
Descarga previa: ver README, sección "Datos".
"""
import json, os

RAW = 'data-raw'
OUT = 'public/data'
os.makedirs(OUT, exist_ok=True)

def rnd(c, d):
    if not c:
        return c
    if isinstance(c[0], (int, float)):
        return [round(c[0], d), round(c[1], d)]
    out = [rnd(x, d) for x in c]
    # Quita vértices consecutivos repetidos tras redondear.
    if out and isinstance(out[0][0], (int, float)):
        ded = [out[0]]
        for p in out[1:]:
            if p != ded[-1]:
                ded.append(p)
        if len(ded) < len(out) and out[0] == out[-1] and ded[-1] != ded[0]:
            ded.append(ded[0])
        out = ded
    return out

def convertir(nombre, salida, campos, dec=4, filtro=None, extra=None):
    d = json.load(open(f'{RAW}/{nombre}.geojson'))
    feats = []
    for f in d['features']:
        p = f['properties'] or {}
        if filtro and not filtro(p):
            continue
        g = f['geometry']
        if not g:
            continue
        props = {k2: p.get(k1) for k1, k2 in campos.items() if p.get(k1) not in (None, '')}
        if extra:
            props.update(extra(p))
        feats.append({'type': 'Feature', 'properties': props,
                      'geometry': {'type': g['type'], 'coordinates': rnd(g['coordinates'], dec)}})
    json.dump({'type': 'FeatureCollection', 'features': feats},
              open(f'{OUT}/{salida}.geojson', 'w'), separators=(',', ':'), ensure_ascii=False)
    print(salida, len(feats), os.path.getsize(f'{OUT}/{salida}.geojson') // 1024, 'KB')

def iso(p):
    a3 = p.get('ISO_A3')
    if not a3 or a3 == '-99':
        a3 = p.get('ADM0_A3')
    return a3

PAISES = {'NAME': 'nombre_en', 'NAME_ES': 'nombre', 'MAPCOLOR7': 'mc7', 'MAPCOLOR9': 'mc9',
          'MIN_LABEL': 'min_label', 'LABELRANK': 'rank'}
convertir('ne_10m_admin_0_countries', 'paises', PAISES, 3, extra=lambda p: {'iso': iso(p)})
convertir('ne_50m_admin_0_countries', 'paises-50m', PAISES, 3, extra=lambda p: {'iso': iso(p)})

# Puntos de etiqueta de cada país (Natural Earth trae LABEL_X/LABEL_Y bien colocados).
d = json.load(open(f'{RAW}/ne_10m_admin_0_countries.geojson'))
pts = []
for f in d['features']:
    p = f['properties']
    if p.get('LABEL_X') is None:
        continue
    pts.append({'type': 'Feature',
                'properties': {'nombre': p.get('NAME_ES') or p.get('NAME'), 'nombre_en': p.get('NAME'),
                               'iso': iso(p), 'min_label': p.get('MIN_LABEL', 3), 'rank': p.get('LABELRANK', 5)},
                'geometry': {'type': 'Point', 'coordinates': [round(p['LABEL_X'], 3), round(p['LABEL_Y'], 3)]}})
json.dump({'type': 'FeatureCollection', 'features': pts}, open(f'{OUT}/paises-etiquetas.geojson', 'w'),
          separators=(',', ':'), ensure_ascii=False)
print('paises-etiquetas', len(pts))

# Natural Earth trae traducciones copiadas por error (Pyongsan → "Pyongyang"): si dos lugares del
# mismo país comparten nombre traducido, el menos poblado conserva solo su nombre local.
_pp = json.load(open(f'{RAW}/ne_10m_populated_places.geojson'))
_mejor = {}
for f in _pp['features']:
    pr = f['properties']
    k = (pr.get('ADM0_A3'), pr.get('NAME_EN'))
    if pr.get('NAME_EN'):
        if k not in _mejor or (pr.get('POP_MAX') or 0) > _mejor[k]:
            _mejor[k] = pr.get('POP_MAX') or 0
def _traduccion_dudosa(pr):
    k = (pr.get('ADM0_A3'), pr.get('NAME_EN'))
    return pr.get('NAME_EN') != pr.get('NAME') and k in _mejor and (pr.get('POP_MAX') or 0) < _mejor[k]

convertir('ne_10m_populated_places', 'ciudades',
          {'NAME_ES': 'nombre', 'NAME_EN': 'nombre_en', 'ADM0NAME': 'pais', 'POP_MAX': 'pob', 'SCALERANK': 'rank'}, 3,
          extra=lambda p: {'capital': 1 if p.get('ADM0CAP') else 0, 'nombre_local': p.get('NAME'),
                           **({'nombre': p.get('NAME'), 'nombre_en': p.get('NAME')} if _traduccion_dudosa(p) else {})})
convertir('ne_10m_rivers_lake_centerlines', 'rios', {'name_en': 'nombre', 'scalerank': 'rank', 'min_zoom': 'min_zoom'}, 3,
          filtro=lambda p: (p.get('scalerank') or 99) <= 9)
convertir('ne_10m_lakes', 'lagos', {'name_es': 'nombre', 'scalerank': 'rank', 'min_label': 'min_label'}, 3,
          filtro=lambda p: (p.get('scalerank') or 99) <= 6)
convertir('ne_10m_geography_marine_polys', 'mares', {'name_es': 'nombre', 'name_en': 'nombre_en',
          'scalerank': 'rank', 'min_label': 'min_label', 'featurecla': 'tipo'}, 2)
convertir('ne_10m_admin_1_states_provinces_lines', 'provincias-lineas', {'ADM0_A3': 'pais'}, 3)

# Un punto de etiqueta por mar (centro de la caja del polígono más grande), para no repetir rótulos.
d = json.load(open(f'{RAW}/ne_10m_geography_marine_polys.geojson'))
pts = []
for f in d['features']:
    p = f['properties']
    g = f['geometry']
    if not g:
        continue
    anillos = [g['coordinates'][0]] if g['type'] == 'Polygon' else [pol[0] for pol in g['coordinates']]
    def area(r):
        return abs(sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1))) / 2
    r = max(anillos, key=area)
    xs = [c[0] for c in r]
    ys = [c[1] for c in r]
    pts.append({'type': 'Feature', 'properties': {'nombre': p.get('name_es'), 'nombre_en': p.get('name_en') or p.get('name'),
                'rank': p.get('scalerank'), 'tipo': p.get('featurecla')},
                'geometry': {'type': 'Point', 'coordinates': [round((min(xs) + max(xs)) / 2, 3), round((min(ys) + max(ys)) / 2, 3)]}})
json.dump({'type': 'FeatureCollection', 'features': pts}, open(f'{OUT}/mares-etiquetas.geojson', 'w'),
          separators=(',', ':'), ensure_ascii=False)
print('mares-etiquetas', len(pts))
