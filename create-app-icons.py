"""Render the existing blue note mark as opaque Home Screen PNG icons."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent / "icons"
scale = 4
canvas = Image.new("RGB", (512 * scale, 512 * scale), "#1769e0")
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle(tuple(v * scale for v in (158, 112, 354, 400)), radius=12 * scale, fill="white")
for y, right in [(192, 304), (256, 304), (320, 272)]:
    draw.line([(208 * scale, y * scale), (right * scale, y * scale)], fill="#1769e0", width=20 * scale)
    for x in (208, right):
        draw.ellipse(((x - 10) * scale, (y - 10) * scale, (x + 10) * scale, (y + 10) * scale), fill="#1769e0")
for name, size in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)]:
    canvas.resize((size, size), Image.Resampling.LANCZOS).save(root / name)
    print(f"Created {name}: {size}x{size}, opaque RGB")
