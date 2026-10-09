#!/usr/bin/env python3
"""Control de calidad de un vídeo de Electric Eye (necesita ffmpeg y numpy).

Uso: python3 scripts/analizar-video.py video.mp4 [--hoja hoja.png]

Mide, fotograma a fotograma:
  - saltos: cambios bruscos entre fotogramas (cámara demasiado rápida, teselas que aparecen de golpe, parpadeos);
  - textura: detalle fino de la imagen (un mar o una tierra con surcos que, en movimiento, parecen hervir);
  - ritmo: cuánto se mueve la imagen en cada tramo (para ver si la cámara arranca y frena de golpe).
Con --hoja guarda una hoja de contactos (1 fotograma por segundo).
"""
import json
import subprocess
import sys

import numpy as np


def leer(video, ancho=270):
    info = json.loads(subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate',
         '-of', 'json', video], capture_output=True, text=True, check=True).stdout)['streams'][0]
    w, h = info['width'], info['height']
    num, den = map(int, info['r_frame_rate'].split('/'))
    fps = num / den
    alto = int(round(h * ancho / w / 2) * 2)
    crudo = subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-vf', f'scale={ancho}:{alto},format=gray',
                            '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(crudo, np.uint8).reshape(-1, alto, ancho).astype(np.float32), fps, (w, h)


def laplaciano(a):
    return np.abs(4 * a[..., 1:-1, 1:-1] - a[..., :-2, 1:-1] - a[..., 2:, 1:-1] - a[..., 1:-1, :-2] - a[..., 1:-1, 2:])


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    video = sys.argv[1]
    f, fps, (w, h) = leer(video)
    n = len(f)
    cambio = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))
    mediana = float(np.median(cambio)) if len(cambio) else 0.0
    umbral = max(mediana * 3, 6)
    saltos = [round((i + 1) / fps, 2) for i, v in enumerate(cambio) if v > umbral]
    # Textura: energía de alta frecuencia de cada fotograma (relieve con surcos, ruido). Sirve para comparar versiones.
    textura = float(laplaciano(f[::max(1, int(fps))]).mean())
    print(f'Vídeo: {video}')
    print(f'  {w}×{h} · {fps:.0f} fps · {n} fotogramas · {n / fps:.1f} s')
    print(f'  Movimiento medio entre fotogramas: {mediana:.2f}')
    print(f'  Saltos (> {umbral:.1f}): {", ".join(f"{t:.2f} s" for t in saltos) if saltos else "ninguno ✓"}')
    print(f'  Textura fina media: {textura:.2f} (comparar versiones: más baja = más limpia)')
    tramos = max(1, int(n / fps))
    ritmo = [float(cambio[int(s * fps):int((s + 1) * fps)].mean()) for s in range(tramos) if int(s * fps) < len(cambio)]
    print('  Ritmo por segundo: ' + ' '.join(f'{r:.1f}' for r in ritmo))
    if '--hoja' in sys.argv:
        destino = sys.argv[sys.argv.index('--hoja') + 1]
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-vf',
                        f'fps=1,scale=270:-1,tile={min(8, tramos)}x{max(1, -(-tramos // 8))}', '-frames:v', '1', destino],
                       check=True)
        print(f'  Hoja de contactos: {destino}')


if __name__ == '__main__':
    main()
