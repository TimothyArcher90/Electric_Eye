#!/usr/bin/env python3
"""Genera el relieve fijo de Electric Eye: public/relieve/{z}/{x}/{y}.webp (niveles 0–6).

Por qué: el sombreado calculado en vivo (hillshade de MapLibre) cambia de nivel de detalle al acercar la cámara
y la tierra parece que "hierve". Aquí se calcula UNA vez, como una imagen de atlas (lo que hacen los mapas de
documental: un relieve fijo que solo se escala). Solo se marcan las montañas (grabado gris); las llanuras y el
mar quedan limpios, y la imagen es transparente para colorear debajo cada país.

Uso: python3 scripts/generar-relieve.py <carpeta con teselas Terrarium z6 'x_y.png'>
Las teselas se descargan de https://s3.amazonaws.com/elevation-tiles-prod/terrarium/6/{x}/{y}.png
(Mapzen/Joerd, AWS Open Data; atribución en el mapa).
"""
import math
import os
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

Z = 6
N = 2 ** Z
ORIGEN = sys.argv[1] if len(sys.argv) > 1 else 'dem6'
DESTINO = os.path.join(os.path.dirname(__file__), '..', 'public', 'relieve')

SOMBRA = np.array([52, 40, 30], np.float32)  # tinta cálida, como el grabado de un atlas
LUZ = np.array([255, 251, 242], np.float32)


def elevacion(x, y):
    x %= N
    if y < 0 or y >= N:
        return np.zeros((256, 256), np.float32)
    ruta = os.path.join(ORIGEN, f'{x}_{y}.png')
    if not os.path.exists(ruta):
        return np.zeros((256, 256), np.float32)
    a = np.asarray(Image.open(ruta).convert('RGB'), np.float32)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


def lat_de_fila(y, filas):
    # Latitud del centro de cada fila de píxeles de la tesela y (Mercator).
    n = (y * 256 + np.arange(filas) + 0.5) / (256 * N)
    return np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * n))))


def sombrear(x, y):
    # Tesela con 8 px de margen de las vecinas, para que no haya costuras.
    m = 8
    bloque = np.block([[elevacion(x + dx, y + dy) for dx in (-1, 0, 1)] for dy in (-1, 0, 1)])
    e = bloque[256 - m:512 + m, 256 - m:512 + m]
    if e.max() <= 0:
        return None
    e = gaussian_filter(e, 0.9)  # quita el ruido del modelo de elevación
    # Tamaño del píxel en metros en cada fila (Mercator: igual en x y en y).
    filas = (y * 256 - m + np.arange(256 + 2 * m) + 0.5) / (256 * N)
    lat = np.arctan(np.sinh(np.pi * (1 - 2 * filas)))
    px = (40075016.686 / (256 * N)) * np.cos(lat)[:, None]
    exag = 2.2
    gy, gx = np.gradient(e * exag)
    gx /= px
    gy /= px
    pendiente = np.arctan(np.hypot(gx, gy))
    orientacion = np.arctan2(-gx, gy)
    zen = np.radians(45)
    sombra = np.zeros_like(e)
    for az, peso in ((315, 0.6), (270, 0.2), (0, 0.2)):  # luz principal del noroeste y dos de relleno
        a = np.radians(az)
        sombra += peso * (np.cos(zen) * np.cos(pendiente) + np.sin(zen) * np.sin(pendiente) * np.cos(a - orientacion))
    delta = sombra - np.cos(zen)
    # Solo montaña: por debajo de ~1,5° de pendiente no se marca nada (llanuras limpias); pleno a partir de ~9°.
    grados = np.degrees(pendiente) / exag
    peso = np.clip((grados - 1.5) / 7.5, 0, 1)
    tierra = np.clip(e / 20, 0, 1)  # bajo el nivel del mar, nada (el mar tiene sus terrazas)
    peso *= tierra
    a_sombra = np.clip(-delta * 2.2, 0, 0.82) * peso
    a_luz = np.clip(delta * 1.4, 0, 0.5) * peso
    a_sombra = a_sombra[m:-m, m:-m]
    a_luz = a_luz[m:-m, m:-m]
    alfa = np.maximum(a_sombra, a_luz)
    if alfa.max() < 0.02:
        return None
    color = np.where((a_sombra >= a_luz)[..., None], SOMBRA, LUZ)
    rgba = np.dstack([color, alfa[..., None] * 255]).clip(0, 255).astype(np.uint8)
    return rgba


def guardar(z, x, y, rgba):
    carpeta = os.path.join(DESTINO, str(z), str(x))
    os.makedirs(carpeta, exist_ok=True)
    Image.fromarray(rgba, 'RGBA').save(os.path.join(carpeta, f'{y}.webp'), 'WEBP', quality=82, method=4)


def reducir(hijos):
    # 2×2 teselas → una, promediando con alfa premultiplicado.
    lienzo = np.zeros((512, 512, 4), np.float32)
    for (dx, dy), t in hijos.items():
        if t is not None:
            lienzo[dy * 256:(dy + 1) * 256, dx * 256:(dx + 1) * 256] = t
    a = lienzo[..., 3:4] / 255
    pre = np.concatenate([lienzo[..., :3] * a, a], axis=2)
    pre = pre.reshape(256, 2, 256, 2, 4).mean(axis=(1, 3))
    alfa = pre[..., 3:4]
    rgb = np.where(alfa > 1e-4, pre[..., :3] / np.maximum(alfa, 1e-4), 0)
    out = np.concatenate([rgb, alfa * 255], axis=2).clip(0, 255).astype(np.uint8)
    return out if out[..., 3].max() > 4 else None


def main():
    nivel = {}
    for x in range(N):
        for y in range(N):
            t = sombrear(x, y)
            if t is not None:
                guardar(Z, x, y, t)
                nivel[(x, y)] = t.astype(np.float32)
        print(f'z{Z} columna {x + 1}/{N}', end='\r', flush=True)
    print()
    for z in range(Z - 1, -1, -1):
        siguiente = {}
        for x in range(2 ** z):
            for y in range(2 ** z):
                hijos = {(dx, dy): nivel.get((2 * x + dx, 2 * y + dy)) for dx in (0, 1) for dy in (0, 1)}
                if all(h is None for h in hijos.values()):
                    continue
                t = reducir(hijos)
                if t is not None:
                    guardar(z, x, y, t)
                    siguiente[(x, y)] = t.astype(np.float32)
        nivel = siguiente
        print(f'z{z}: {len(nivel)} teselas')


if __name__ == '__main__':
    main()
