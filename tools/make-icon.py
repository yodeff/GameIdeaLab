# Game Idea Lab のアイコン: 紫の角丸の地に、3 つ並んだ抽選の窓。真ん中の窓にきらめき（生成ボタンの ✦ と同じ形）。
# 使い方: python tools/make-icon.py build（Pillow が要る）。favicon.png は src/renderer/public/ へ写す
import os, sys
from PIL import Image, ImageDraw, ImageFilter

S = 1024  # 大きく描いて縮める
out_dir = sys.argv[1]
os.makedirs(out_dir, exist_ok=True)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return m


# 地: 左上 #6b78ff → 右下 #4250e0 の斜めのグラデーション
top, bottom = (107, 120, 255), (66, 80, 224)
grad = Image.new('RGB', (S, S))
px = grad.load()
for y in range(S):
    for x in range(S):
        px[x, y] = lerp(top, bottom, (x + y) / (2 * S))
icon = Image.new('RGBA', (S, S), (0, 0, 0, 0))
icon.paste(grad, (0, 0), rounded_mask(S, 220))

d = ImageDraw.Draw(icon)
# 窓の枠（白い角丸の帯）
pad, frame_top, frame_h = 120, 330, 360
d.rounded_rectangle((pad, frame_top, S - pad, frame_top + frame_h), radius=70, fill=(255, 255, 255, 255))
# 3 つの窓
inner = 34
cell_w = (S - 2 * pad - 4 * inner) / 3
colors = [(232, 235, 255), (255, 255, 255), (232, 235, 255)]
for i in range(3):
    x0 = pad + inner + i * (cell_w + inner)
    d.rounded_rectangle((x0, frame_top + inner, x0 + cell_w, frame_top + frame_h - inner), radius=40, fill=(66, 80, 224, 255) if i == 1 else (205, 210, 255, 255))

# 両端の窓に短い横線（語が入っている印）
for i in (0, 2):
    x0 = pad + inner + i * (cell_w + inner)
    cx = x0 + cell_w / 2
    cy = frame_top + frame_h / 2
    for dy, w in ((-40, 0.55), (0, 0.7), (40, 0.45)):
        d.rounded_rectangle((cx - cell_w * w / 2, cy + dy - 9, cx + cell_w * w / 2, cy + dy + 9), radius=9, fill=(107, 120, 255, 255))

# 真ん中の窓にきらめき（4 方向の星）
cx = pad + inner + (cell_w + inner) + cell_w / 2
cy = frame_top + frame_h / 2
r_long, r_short = 105, 26
star = [(cx, cy - r_long), (cx + r_short, cy - r_short), (cx + r_long, cy), (cx + r_short, cy + r_short),
        (cx, cy + r_long), (cx - r_short, cy + r_short), (cx - r_long, cy), (cx - r_short, cy - r_short)]
d.polygon(star, fill=(255, 214, 92, 255))

# 下に「回す」のつまみ（丸）と上に小さなきらめき
d.ellipse((S / 2 - 70, 760, S / 2 + 70, 900), fill=(255, 255, 255, 235))
d.ellipse((S / 2 - 34, 796, S / 2 + 34, 864), fill=(66, 80, 224, 255))
sx, sy, rl, rs = 800, 205, 56, 14
d.polygon([(sx, sy - rl), (sx + rs, sy - rs), (sx + rl, sy), (sx + rs, sy + rs), (sx, sy + rl), (sx - rs, sy + rs), (sx - rl, sy), (sx - rs, sy - rs)], fill=(255, 255, 255, 230))

png256 = icon.resize((256, 256), Image.LANCZOS)
png512 = icon.resize((512, 512), Image.LANCZOS)
png512.save(os.path.join(out_dir, 'icon.png'))
icon.resize((256, 256), Image.LANCZOS).save(os.path.join(out_dir, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
icon.resize((64, 64), Image.LANCZOS).save(os.path.join(out_dir, 'favicon.png'))
print('ok')
