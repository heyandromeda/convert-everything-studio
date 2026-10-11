"""Independent audit fixtures with known content, so outputs can be checked against ground truth."""
import io, os, sys, json, gzip, tarfile, zipfile, subprocess, struct
from PIL import Image, ImageDraw
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
p = lambda n: os.path.join(OUT, n)

# Quadrant image: TL red, TR green, BL blue, BR half-transparent white. 400x300.
def quad(mode='RGBA'):
    im = Image.new('RGBA', (400, 300), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 199, 149], fill=(255, 0, 0, 255))
    d.rectangle([200, 0, 399, 149], fill=(0, 255, 0, 255))
    d.rectangle([0, 150, 199, 299], fill=(0, 0, 255, 255))
    d.rectangle([200, 150, 399, 299], fill=(255, 255, 255, 0))
    return im
q = quad()
q.save(p('quad.png'))
q.convert('RGB').save(p('quad.bmp'))
q.save(p('quad.tiff'))
q.save(p('quad.webp'), lossless=True)
q.save(p('quad.ico'), sizes=[(64, 64)])
# Animated GIF, 3 frames: red, green, blue
frames = [Image.new('RGB', (120, 80), c) for c in [(255, 0, 0), (0, 255, 0), (0, 0, 255)]]
frames[0].save(p('anim.gif'), save_all=True, append_images=frames[1:], duration=200, loop=0)

# JPEG with EXIF orientation 6 (rotate 90 CW to display) + GPS + artist. Stored 400x200: left half red, right half blue.
im = Image.new('RGB', (400, 200)); d = ImageDraw.Draw(im)
d.rectangle([0, 0, 199, 199], fill=(255, 0, 0)); d.rectangle([200, 0, 399, 199], fill=(0, 0, 255))
exif = Image.Exif()
exif[0x0112] = 6
exif[0x013B] = 'Audit Artist Jane'
exif[0x010F] = 'AuditCam'
gps = {1: 'N', 2: (51.0, 30.0, 0.0), 3: 'W', 4: (0.0, 7.0, 0.0)}
exif[0x8825] = gps
im.save(p('oriented-gps.jpg'), exif=exif.tobytes(), quality=95)

# SVG with script + external image reference
open(p('remote.svg'), 'w').write('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="50"><script>alert(1)</script><rect width="100" height="50" fill="#00ff00"/><image href="https://tracker.example/svg.png" width="10" height="10"/></svg>')

# Text docs
md = """# Audit Heading

Paragraph with **bold** and Ünïcödé — Ελληνικά, Кириллица.

| Col A | Col B |
| --- | --- |
| 1 | 2 |

```js
const x = 1
```

![remote](https://tracker.example/md.png)

<script>alert('md')</script>
<video src="https://tracker.example/v.mp4" poster="https://tracker.example/poster.png"></video>
<table background="https://tracker.example/bg.png"><tr><td>bg</td></tr></table>
<svg><image href="https://tracker.example/svgimg.png" /></svg>
<audio src="https://tracker.example/a.mp3"></audio>
<a href="javascript:alert(1)">js link</a>

CJK line: 日本語のテキスト
"""
open(p('doc.md'), 'w', encoding='utf-8').write(md)
html = """<!doctype html><html><head><title>Audit HTML</title><style>body{color:red}</style></head><body>
<h1>HTML Heading</h1><p>Para one with <a href="https://example.com">link</a> and <a href="javascript:alert(1)">bad</a>.</p>
<img src="https://tracker.example/pixel.gif" alt="pixel"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==" alt="inline">
<table><tr><th>H1</th><th>H2</th></tr><tr><td>c1</td><td>c2</td></tr></table>
<ul><li>item one</li><li>item two</li></ul><script>alert(2)</script>
<video poster="https://tracker.example/p2.png"></video>
</body></html>"""
open(p('page.html'), 'w', encoding='utf-8').write(html)
open(p('cp1252.txt'), 'wb').write('Café naïve – “quotes” €100\nLine two\n'.encode('cp1252'))
open(p('plain.txt'), 'w').write('Audit plain text line one\nLine two\n')

# CSV with formula injection payloads and leading zeros
open(p('inject.csv'), 'w', encoding='utf-8', newline='').write('id,name,formula\n02134,"Smith, John",=1+2\n00007,"multi\nline",+cmd|\' /C calc\'!A0\n3,@SUM(A1),-2+3\n')
open(p('data.json'), 'w').write(json.dumps({"store": {"name": "Audit & Co", "items": [{"id": 1, "tags": ["a", "b"]}, {"id": 2, "tags": []}], "zip": "02134", "flag": True, "none": None}}))
open(p('rows.json'), 'w').write(json.dumps([{"id": "02134", "n": 1.5, "s": "x"}, {"id": "7", "n": 2, "s": "=HYPERLINK(\"http://evil\")"}]))
open(p('conf.yaml'), 'w').write('name: audit\nlist:\n  - 1\n  - two\nnested:\n  key: "value: colon"\nanchors: &a {x: 1}\nref: *a\n')
open(p('lol.yaml'), 'w').write('a: &a ["x","x","x","x","x","x","x","x","x","x"]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]\ne: &e [*d,*d,*d,*d,*d,*d,*d,*d,*d,*d]\nf: &f [*e,*e,*e,*e,*e,*e,*e,*e,*e,*e]\ng: &g [*f,*f,*f,*f,*f,*f,*f,*f,*f,*f]\n')
open(p('data.xml'), 'w').write('<?xml version="1.0"?><catalog><book id="b1"><title>XML &amp; You</title><price>10.50</price><zip>02134</zip></book><book id="b2"><title>Two</title><price>3</price><zip>00001</zip></book></catalog>')
open(p('xxe.xml'), 'w').write('<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd"><!ENTITY a "AAAAAAAAAA"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><r><v>&x;</v><w>&b;</w></r>')
open(p('subs.srt'), 'w', encoding='utf-8').write('1\n00:00:01,000 --> 00:00:02,500\nHello <i>world</i>\n\n2\n00:00:03,000 --> 00:00:04,000\nÜnïcode 日本\n')

# XLSX with 2 sheets, formulas with cached values via LibreOffice not available -> openpyxl writes no cached value
from openpyxl import Workbook
wb = Workbook(); ws = wb.active; ws.title = 'Sales'
ws.append(['id', 'item', 'qty', 'price', 'total'])
ws.append(['02134', 'Widget', 3, 2.5, '=C2*D2'])
ws.append(['00007', 'Gadget', 2, 10, '=C3*D3'])
ws2 = wb.create_sheet('Notes'); ws2.append(['note']); ws2.append(['Ünïcode 日本'])
wb.save(p('book.xlsx'))

# PDF: 3 pages, known text, metadata author
from reportlab.pdfgen import canvas
c = canvas.Canvas(p('three.pdf')); c.setAuthor('Secret Author Jane'); c.setTitle('Audit PDF')
for i in range(1, 4):
    c.drawString(72, 720, f'Audit page {i} marker PAGE{i}MARK'); c.showPage()
c.save()

# DOCX
from docx import Document
from docx.shared import Inches
doc = Document(); doc.add_heading('Docx Heading', 1); doc.add_paragraph('Docx paragraph with Ünïcode.')
t = doc.add_table(rows=2, cols=2); t.cell(0, 0).text = 'TA'; t.cell(0, 1).text = 'TB'; t.cell(1, 0).text = 'T1'; t.cell(1, 1).text = 'T2'
buf = io.BytesIO(); Image.new('RGB', (40, 30), (255, 0, 0)).save(buf, 'PNG'); buf.seek(0)
doc.add_picture(buf, width=Inches(1)); doc.core_properties.author = 'Docx Author'
doc.save(p('doc.docx'))

# PPTX
from pptx import Presentation
from pptx.util import Inches as PI
pr = Presentation()
for i in range(1, 3):
    s = pr.slides.add_slide(pr.slide_layouts[1]); s.shapes.title.text = f'Slide {i} title'; s.placeholders[1].text = f'Body {i}'
    s.notes_slide.notes_text_frame.text = f'Notes {i}'
buf.seek(0); pr.slides[1].shapes.add_picture(buf, PI(1), PI(1))
pr.save(p('deck.pptx'))

# Archives
os.makedirs(p('tree/sub'), exist_ok=True)
open(p('tree/a.txt'), 'w').write('alpha\n'); open(p('tree/sub/b.txt'), 'w').write('bravo\n')
with zipfile.ZipFile(p('nested.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.write(p('tree/a.txt'), 'a.txt'); z.write(p('tree/sub/b.txt'), 'sub/b.txt')
    z.writestr('../evil.txt', 'traversal'); z.writestr('/abs.txt', 'absolute')
with tarfile.open(p('nested.tar.gz'), 'w:gz') as t:
    t.add(p('tree/a.txt'), 'a.txt'); t.add(p('tree/sub/b.txt'), 'sub/b.txt')
    info = tarfile.TarInfo('link'); info.type = tarfile.SYMTYPE; info.linkname = '/etc/passwd'; t.addfile(info)
with tarfile.open(p('plain.tar'), 'w') as t:
    t.add(p('tree/a.txt'), 'a.txt'); t.add(p('tree/sub/b.txt'), 'sub/b.txt')
# truncated tar: header claims 4096 bytes, only 100 present
big = os.urandom(4096)
bi = io.BytesIO()
with tarfile.open(fileobj=bi, mode='w') as t:
    ti = tarfile.TarInfo('big.bin'); ti.size = len(big); t.addfile(ti, io.BytesIO(big))
open(p('truncated.tar'), 'wb').write(bi.getvalue()[:512 + 100])
# truncated tar.gz
open(p('truncated.tar.gz'), 'wb').write(open(p('nested.tar.gz'), 'rb').read()[:-20])
open(p('hello.txt.gz'), 'wb').write(gzip.compress(b'gzip payload\n'))
subprocess.run(['7z', 'a', '-bd', '-y', p('nested.7z'), 'a.txt', 'sub/b.txt'], cwd=p('tree'), check=True, stdout=subprocess.DEVNULL)
# gzip bomb ~300MB of zeros (compressed ~300KB): over the mobile 250MB per-file limit, under desktop 1GB
with gzip.open(p('bomb300m.gz'), 'wb', compresslevel=9) as g:
    chunk = b'\0' * (1 << 20)
    for _ in range(300): g.write(chunk)
# misleading extension: PNG named .pdf, and text named .png
open(p('really-png.pdf'), 'wb').write(open(p('quad.png'), 'rb').read())
open(p('text-named.png'), 'w').write('just text\n')
# Polyglot-ish: HTML named .txt
open(p('html-named.txt'), 'w').write('<script>alert(1)</script><h1>x</h1>')

# Media
ff = lambda *a: subprocess.run(['ffmpeg', '-v', 'error', '-y', *a], check=True)
ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=3', '-filter_complex', 'amerge', '-ac', '2', '-metadata', 'artist=Tag Artist', p('stereo.wav'))
ff('-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', p('clip.mp4'))
ff('-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=2', '-c:v', 'libvpx', '-c:a', 'libvorbis', '-shortest', p('clip.webm'))
ff('-i', p('stereo.wav'), '-c:a', 'libmp3lame', '-b:a', '128k', p('tone.mp3'))
ff('-i', p('stereo.wav'), '-c:a', 'flac', p('tone.flac'))
print('ok')

# Extra fixtures used by the repro, privacy and layout audit specs.
import shutil
shutil.copy(p('quad.png'), p('SECRETNAME-Ωmega-confidential.png'))
ex = Image.Exif(); ex[0x010F] = 'AuditCam'; ex[0x8825] = {1: 'N', 2: (51.0, 30.0, 0.0), 3: 'W', 4: (0.0, 7.0, 0.0)}
Image.new('RGB', (300, 200), (200, 50, 50)).save(p('gps-upright.jpg'), exif=ex.tobytes(), quality=90)
Image.new('RGB', (300, 200), (50, 50, 200)).save(p('gps-upright2.jpg'), exif=ex.tobytes(), quality=90)
open(p('svg-only.md'), 'w').write('# Title\n\n<svg><rect width="10" height="10"/></svg>\n')
open(p('svg-sized.md'), 'w').write('# Title\n\n<svg width="10" height="10"><rect width="10" height="10"/></svg>\n')
open(p('internal-entity.xml'), 'w').write('<?xml version="1.0"?><!DOCTYPE r [<!ENTITY co "Acme">]><r><v>&co;</v></r>')
open(p('doctype-only.xml'), 'w').write('<?xml version="1.0"?><!DOCTYPE note SYSTEM "note.dtd"><note><to>Tove</to></note>')
subprocess.run(['7z', 'a', '-bd', '-y', '-pHunter2', '-mhe=off', p('data-encrypted.7z'), 'a.txt'], cwd=p('tree'), check=True, stdout=subprocess.DEVNULL)
subprocess.run(['7z', 'a', '-bd', '-y', '-tzip', '-pHunter2', '-mem=AES256', p('aes.zip'), 'a.txt'], cwd=p('tree'), check=True, stdout=subprocess.DEVNULL)
ff('-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=30:duration=30', '-f', 'lavfi', '-i', 'sine=duration=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', p('long.mp4'))
print('extras ok')

# Same workbook, but each formula carries a cached result, as a file saved by Excel would.
with zipfile.ZipFile(p('book.xlsx')) as zin, zipfile.ZipFile(p('book-cached.xlsx'), 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == 'xl/worksheets/sheet1.xml':
            data = data.replace(b'<f>C2*D2</f><v></v>', b'<f>C2*D2</f><v>7.5</v>').replace(b'<f>C3*D3</f><v></v>', b'<f>C3*D3</f><v>20</v>')
            assert b'<v>7.5</v>' in data, 'formula cell layout changed'
        zout.writestr(item, data)
print('cached ok')
