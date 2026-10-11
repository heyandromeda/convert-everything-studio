"""Bounded stress fixtures: header-valid giant images, compression bombs. Written to argv[1]."""
import os, sys, zlib, struct, zipfile, gzip
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
p = lambda n: os.path.join(OUT, n)

def png(path, w, h):
    # Grayscale 8-bit, all-zero rows, streamed through zlib so memory stays small.
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    co = zlib.compressobj(9)
    row = b'\0' * (w + 1)
    parts = []
    for _ in range(h): parts.append(co.compress(row))
    parts.append(co.flush())
    data = b''.join(parts)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 0, 0, 0, 0)) + chunk(b'IDAT', data) + chunk(b'IEND', b''))

png(p('px16k.png'), 16000, 16000)      # 256 MP -> 1 GB RGBA when decoded
png(p('px40k.png'), 40000, 40000)      # 1.6 GP -> 6.4 GB RGBA when decoded
open(p('huge.svg'), 'w').write('<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"><rect width="100%" height="100%" fill="red"/></svg>')
# ZIP with one honest 1.2 GB entry of zeros (over the 1 GB desktop per-entry limit)
with zipfile.ZipFile(p('honest-1200m.zip'), 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    with z.open('zeros.bin', 'w', force_zip64=True) as w:
        chunk = b'\0' * (1 << 20)
        for _ in range(1200): w.write(chunk)
# ZIP with 60 MB entry of zeros: under size limits, ratio ~1000:1 > 400 and > 50 MB -> ratio rule
with zipfile.ZipFile(p('ratio-60m.zip'), 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    with z.open('zeros.bin', 'w') as w:
        chunk = b'\0' * (1 << 20)
        for _ in range(60): w.write(chunk)
# gzip of 1.2 GB zeros: over the 1 GB desktop gzip limit
with gzip.open(p('bomb1200m.gz'), 'wb', compresslevel=9) as g:
    chunk = b'\0' * (1 << 20)
    for _ in range(1200): g.write(chunk)
# 25,000 tiny entries: over the 20,000 desktop file-count limit
with zipfile.ZipFile(p('many.zip'), 'w', zipfile.ZIP_STORED) as z:
    for i in range(25000): z.writestr(f'f{i}.txt', b'x')
# Overlapping-entry ZIP bomb trick is out of scope; quine-style nested zips: zip containing a zip
with zipfile.ZipFile(p('nested-bomb.zip'), 'w', zipfile.ZIP_STORED) as z:
    z.write(p('ratio-60m.zip'), 'inner.zip')
print('ok')
