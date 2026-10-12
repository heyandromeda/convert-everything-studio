"""Generates hostile and edge-case fixtures in tests/fixtures/abuse.

Requires: pillow pikepdf, plus the 7z and exiftool CLIs.
"""
import io
import os
import shutil
import struct
import subprocess
import tempfile
import zipfile

import pikepdf
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'abuse')
FIX = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures')
os.makedirs(OUT, exist_ok=True)


def p(name):
    return os.path.join(OUT, name)


def write(name, data):
    with open(p(name), 'wb') as f:
        f.write(data)


write('empty.png', b'')
write('corrupt.pdf', b'%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nthis is not a valid pdf body\n')

# A ZIP container that claims to be DOCX but has no Word document inside.
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w') as z:
    z.writestr('readme.txt', 'not a word document')
write('not-really.docx', buf.getvalue())

# Valid ZIP cut in half: the central directory is gone.
with open(os.path.join(FIX, 'bundle.zip'), 'rb') as f:
    whole = f.read()
write('truncated.zip', whole[: len(whole) // 2])

# One entry whose real size (5 MB) is far larger than the 1000 bytes both headers declare.
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('zeros.bin', b'\0' * (5 * 1024 * 1024))
b = bytearray(buf.getvalue())
struct.pack_into('<I', b, 22, 1000)
cd = b.rfind(b'PK\x01\x02')
struct.pack_into('<I', b, cd + 24, 1000)
write('lying-size.zip', bytes(b))

# Valid ZIP with one byte of compressed data flipped: CRC no longer matches.
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('notes.txt', ('The quick brown fox jumps over the lazy dog. ' * 400).encode())
b = bytearray(buf.getvalue())
b[30 + len('notes.txt') + 40] ^= 0xFF
write('bad-crc.zip', bytes(b))

# 80 MB of zeros compressed to ~80 KB: a classic decompression bomb shape.
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.writestr('bomb.bin', b'\0' * (80 * 1024 * 1024))
write('bomb.zip', buf.getvalue())

# Password-protected archives and PDF.
tmp = tempfile.mkdtemp()
secret = os.path.join(tmp, 'secret.txt')
with open(secret, 'w') as f:
    f.write('confidential payroll figures\n')
for name, args in [('encrypted.zip', ['-tzip']), ('encrypted.7z', ['-t7z', '-mhe=on'])]:
    target = p(name)
    if os.path.exists(target):
        os.remove(target)
    subprocess.run(['7z', 'a', *args, '-pHunter2', target, secret], check=True, stdout=subprocess.DEVNULL)
shutil.rmtree(tmp)

with pikepdf.open(os.path.join(FIX, 'text.pdf')) as pdf:
    pdf.save(p('encrypted.pdf'), encryption=pikepdf.Encryption(user='Hunter2', owner='Hunter2', R=6))

# JPEG carrying GPS, camera, XMP and a comment.
img = Image.new('RGB', (640, 480), '#4a90d9')
img.save(p('gps.jpg'), 'JPEG', quality=90)
subprocess.run(
    [
        'exiftool', '-overwrite_original', '-q',
        '-GPSLatitude=51.5007', '-GPSLatitudeRef=N', '-GPSLongitude=0.1246', '-GPSLongitudeRef=W',
        '-Make=QA Camera Co', '-Model=QA-9000', '-Artist=Jane Private',
        '-XMP-dc:Creator=Jane Private', '-Comment=home address 221B',
        p('gps.jpg'),
    ],
    check=True,
)

# PNG with text and EXIF chunks.
img = Image.new('RGBA', (320, 240), (200, 50, 50, 128))
img.save(p('gps.png'), 'PNG')
subprocess.run(
    ['exiftool', '-overwrite_original', '-q', '-GPSLatitude=40.7484', '-GPSLatitudeRef=N', '-GPSLongitude=73.9857',
     '-GPSLongitudeRef=W', '-PNG:Comment=home address 221B', '-Artist=Jane Private', p('gps.png')],
    check=True,
)

# Above iPhone Safari's 16.7-megapixel canvas limit; solid colour so the file stays small.
Image.new('RGB', (6000, 4000), '#2f6f4f').save(p('huge-24mp.png'), 'PNG', optimize=True)

# Syntax errors whose text must never appear in an error message.
write('secret-broken.json', b'apiKey: "sk-LEAK-0123456789"\nuser: "jane"\n')
write('secret-broken.yaml', b'apiKey: sk-LEAK-0123456789\nuser: [jane\n  other: : :\n')
write('secret-broken.xml', b'<config><apiKey>sk-LEAK-0123456789</apiKey><user>jane</config>\n')

# Legacy Word binary (OLE compound file header) that the app must decline honestly.
write('legacy.doc', bytes.fromhex('D0CF11E0A1B11AE1') + b'\0' * 504)

# Long enough (20 s) that FFmpeg is still encoding when the test presses Stop.
subprocess.run(
    ['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
     '-t', '20', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '38', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-shortest', p('long.mp4')],
    check=True,
)

# --- Added by the independent audit (docs/final-independent-audit.md) ---

# GPS photo with a non-default EXIF orientation (takes the canvas path in image → PDF).
shutil.copy(p('gps.jpg'), p('gps-rotated.jpg'))
subprocess.run(['exiftool', '-overwrite_original', '-q', '-n', '-Orientation=6', p('gps-rotated.jpg')], check=True)

# TAR whose header declares 4096 bytes of data, of which only 100 are present.
import tarfile
tar_buf = io.BytesIO()
with tarfile.open(fileobj=tar_buf, mode='w', format=tarfile.USTAR_FORMAT) as t:
    info = tarfile.TarInfo('big.bin')
    info.size = 4096
    info.mtime = 0
    t.addfile(info, io.BytesIO(bytes(range(256)) * 16))
write('truncated.tar', tar_buf.getvalue()[: 512 + 100])

# Complete TAR with one corrupted header byte (the file name), so the checksum no longer matches.
whole_tar = bytearray(tar_buf.getvalue())
whole_tar[0] ^= 0x01
write('bad-checksum.tar', bytes(whole_tar))

# Markdown whose HTML output must not load anything remote when the saved file is opened.
write('remote-media.md', b"""# Remote media

<video src="https://tracker.example/v.mp4" poster="https://tracker.example/poster.png"></video>
<audio src="https://tracker.example/a.mp3"></audio>
<table background="https://tracker.example/bg.png"><tr><td>cell</td></tr></table>
<svg><image href="https://tracker.example/svg.png" width="10" height="10" /></svg>
<a href="https://example.com/" ping="https://tracker.example/ping">kept link</a>
""")

# Inline SVG without width/height, which pdfmake refuses unless it is given a size.
write('svg-nosize.md', b'# Diagram\n\n<svg viewBox="0 0 40 20"><rect width="40" height="20" fill="#2f6f4f"/></svg>\n\n<svg><circle cx="5" cy="5" r="5"/></svg>\n')

# Postcode-like values that must keep their leading zeros in XML → JSON.
write('postcodes.xml', b'<places><place><zip>02134</zip><n>12</n><rate>0.5</rate></place></places>\n')

# YAML "billion laughs": every level multiplies the previous one tenfold through aliases.
levels = ['a: &a ["x","x","x","x","x","x","x","x","x","x"]']
for prev, cur in zip('abcdef', 'bcdefg'):
    levels.append(f'{cur}: &{cur} [' + ','.join([f'*{prev}'] * 10) + ']')
write('alias-bomb.yaml', ('\n'.join(levels) + '\n').encode())

print('abuse fixtures written to', os.path.abspath(OUT))
