#!/usr/bin/env python3
"""public/data/batimetria.geojson: el mar en terrazas por profundidad (0, 200, 1000 … 6000 m), como los atlas.

Fuente: Natural Earth 10m bathymetry (dominio público), capas ne_10m_bathymetry_{L_0,K_200,…,E_6000}.geojson de
https://github.com/nvkelso/natural-earth-vector. Se simplifica (Douglas–Peucker, ~2 km) y se quitan islas de
profundidad diminutas: son polígonos fijos, así que el mar no "hierve" al mover la cámara.
Uso: python3 scripts/preparar-batimetria.py <carpeta con las capas>
"""
import json
import os
import sys

CAPAS = [('L_0', 0), ('K_200', 200), ('J_1000', 1000), ('I_2000', 2000), ('H_3000', 3000), ('G_4000', 4000),
         ('F_5000', 5000), ('E_6000', 6000)]
TOL = 0.05


def dp(puntos, tol):
    # Douglas–Peucker iterativo.
    if len(puntos) < 4:
        return puntos
    guardar = [False] * len(puntos)
    guardar[0] = guardar[-1] = True
    pila = [(0, len(puntos) - 1)]
    while pila:
        a, b = pila.pop()
        (x1, y1), (x2, y2) = puntos[a], puntos[b]
        dx, dy = x2 - x1, y2 - y1
        n = (dx * dx + dy * dy) ** 0.5 or 1e-12
        mejor, idx = 0, -1
        for i in range(a + 1, b):
            x, y = puntos[i]
            d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / n
            if d > mejor:
                mejor, idx = d, i
        if mejor > tol and idx > 0:
            guardar[idx] = True
            pila += [(a, idx), (idx, b)]
    return [p for p, g in zip(puntos, guardar) if g]


def dp_anillo(r, tol):
    # Anillo cerrado: se parte por el punto más lejano al primero (si no, el primer tramo mide cero).
    if len(r) < 5:
        return r
    x0, y0 = r[0]
    lejos = max(range(len(r)), key=lambda i: (r[i][0] - x0) ** 2 + (r[i][1] - y0) ** 2)
    return dp(r[:lejos + 1], tol) + dp(r[lejos:], tol)[1:]


def area(anillo):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(anillo, anillo[1:]))) / 2


def main():
    origen = sys.argv[1]
    salida = []
    for nombre, prof in CAPAS:
        d = json.load(open(os.path.join(origen, f'{nombre}.geojson')))
        polis = []
        for f in d['features']:
            g = f['geometry']
            if not g:
                continue
            for p in (g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]):
                anillos = []
                for i, r in enumerate(p):
                    r2 = [[round(x, 3), round(y, 3)] for x, y in dp_anillo(r, TOL)]
                    if len(r2) >= 4 and area(r2) > (0.1 if i == 0 else 0.05):
                        anillos.append(r2)
                    elif i == 0:
                        break
                if anillos and anillos[0] == anillos[0]:
                    polis.append(anillos)
        salida.append({'type': 'Feature', 'properties': {'prof': prof}, 'geometry': {'type': 'MultiPolygon', 'coordinates': polis}})
        print(nombre, len(polis), 'polígonos')
    destino = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'batimetria.geojson')
    json.dump({'type': 'FeatureCollection', 'features': salida}, open(destino, 'w'), separators=(',', ':'))
    print('→', destino, os.path.getsize(destino) // 1024, 'KB')


if __name__ == '__main__':
    main()
