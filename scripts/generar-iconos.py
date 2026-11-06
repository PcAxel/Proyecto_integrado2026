"""Genera los íconos de la PWA a partir de public/icon-512.png (logo sobre fondo transparente).

Uso: backend/.venv/bin/python scripts/generar-iconos.py
- icon-192/512.png            «any»: transparentes, tal como están (no se tocan).
- icon-maskable-192/512.png   «maskable»: fondo blanco opaco y logo dentro de la zona segura (80 %).
- apple-touch-icon.png        180×180 opaco: iOS rellena de negro la transparencia.
"""
from pathlib import Path

from PIL import Image

PUBLIC = Path(__file__).resolve().parent.parent / 'public'
logo = Image.open(PUBLIC / 'icon-512.png').convert('RGBA')
logo = logo.crop(logo.getbbox())  # solo el dibujo, sin márgenes


def componer(lado, ocupa):
    lienzo = Image.new('RGBA', (lado, lado), (255, 255, 255, 255))
    max_lado = int(lado * ocupa)
    escala = min(max_lado / logo.width, max_lado / logo.height)
    marca = logo.resize((round(logo.width * escala), round(logo.height * escala)), Image.LANCZOS)
    lienzo.alpha_composite(marca, ((lado - marca.width) // 2, (lado - marca.height) // 2))
    return lienzo.convert('RGB')


componer(512, 0.66).save(PUBLIC / 'icon-maskable-512.png', optimize=True)
componer(192, 0.66).save(PUBLIC / 'icon-maskable-192.png', optimize=True)
componer(180, 0.80).save(PUBLIC / 'apple-touch-icon.png', optimize=True)
print('Íconos generados en', PUBLIC)
