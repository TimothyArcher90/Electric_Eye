"""Genera glifos SDF (.pbf) para MapLibre a partir de tipografías TTF (OFL).

Mismo formato que node-fontnik: 24 px, margen 3 px, radio 8, corte 0.25.
Uso: python3 scripts/generar-glifos.py <carpeta con los .ttf>
Requiere: pip install freetype-py scipy numpy
"""
import os
import sys

import freetype
import numpy as np
from scipy.ndimage import distance_transform_edt

TAM, MARGEN, RADIO, CORTE = 24, 3, 8, 0.25
RANGOS = [(0, 255), (256, 511), (512, 767), (768, 1023), (7680, 7935), (8192, 8447)]

# (nombre de la pila, archivo, peso del eje wght)
FUENTES = [
    ('Cinzel Bold', 'Cinzel.ttf', 700),
    ('EB Garamond Medium', 'Garamond.ttf', 500),
    ('EB Garamond Italic', 'GaramondItalic.ttf', 500),
]


def varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n:
            return bytes(out)


def campo(num, tipo, valor):
    clave = varint((num << 3) | tipo)
    if tipo == 0:
        return clave + varint(valor)
    return clave + varint(len(valor)) + valor


def zz(n):
    return (n << 1) ^ (n >> 31)


SOBRE = 4  # sobremuestreo: el campo se calcula a 4× y se reduce, para bordes suaves al ampliar


def alfa_de(cara, cp, escala):
    cara.set_char_size(TAM * escala * 64)
    cara.load_char(chr(cp), freetype.FT_LOAD_RENDER | freetype.FT_LOAD_TARGET_NORMAL)
    g = cara.glyph
    w, h = g.bitmap.width, g.bitmap.rows
    a = np.zeros((h, w), np.float32)
    if w and h:
        a = np.array(g.bitmap.buffer, dtype=np.float32).reshape(h, g.bitmap.pitch)[:, :w] / 255.0
    return a, g.bitmap_left, g.bitmap_top, w, h, int(round(g.advance.x / 64 / escala))


def glifo(cara, cp):
    if cara.get_char_index(cp) == 0:
        return None
    # Métricas a 24 px (las que usa MapLibre para colocar el glifo).
    _, left, top, w, h, avance = alfa_de(cara, cp, 1)
    datos = campo(1, 0, cp)
    if w and h:
        alta, left4, top4, w4, h4, _ = alfa_de(cara, cp, SOBRE)
        S = SOBRE
        W, H = (w + 2 * MARGEN) * S, (h + 2 * MARGEN) * S
        lienzo = np.zeros((H, W), np.float32)
        ox = left4 - left * S + MARGEN * S
        oy = top * S - top4 + MARGEN * S
        x0, y0 = max(0, ox), max(0, oy)
        x1, y1 = min(W, ox + w4), min(H, oy + h4)
        if x1 > x0 and y1 > y0:
            lienzo[y0:y1, x0:x1] = alta[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
        dentro = lienzo >= 0.5
        d = (distance_transform_edt(~dentro) - distance_transform_edt(dentro)) / S
        # Promedio por bloques S×S → rejilla de 24 px.
        d = d.reshape(H // S, S, W // S, S).mean(axis=(1, 3))
        v = np.clip(np.round(255 - 255 * (d / RADIO + CORTE)), 0, 255).astype(np.uint8)
        datos += campo(2, 2, v.tobytes())
    datos += campo(3, 0, w) + campo(4, 0, h)
    datos += campo(5, 0, zz(left)) + campo(6, 0, zz(top - 26)) + campo(7, 0, avance)
    return datos


def main(origen, destino):
    for nombre, archivo, peso in FUENTES:
        cara = freetype.Face(os.path.join(origen, archivo))
        try:
            cara.set_var_design_coords((peso,))
        except Exception:
            pass
        carpeta = os.path.join(destino, nombre)
        os.makedirs(carpeta, exist_ok=True)
        for a, b in RANGOS:
            gl = b''.join(campo(3, 2, x) for cp in range(a, b + 1) if (x := glifo(cara, cp)))
            pila = campo(1, 2, nombre.encode()) + campo(2, 2, f'{a}-{b}'.encode()) + gl
            with open(os.path.join(carpeta, f'{a}-{b}.pbf'), 'wb') as f:
                f.write(campo(1, 2, pila))
        print(nombre, 'ok')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'public/fonts')
