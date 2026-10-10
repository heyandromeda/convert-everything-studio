"""Generates the document/presentation/spreadsheet/archive test fixtures in tests/fixtures.

Requires: python-docx python-pptx openpyxl reportlab pillow
Media fixtures (audio/video) are generated with the ffmpeg CLI by generate-media-fixtures.sh.
"""
import io
import json
import os
import tarfile
import zipfile

from docx import Document
from docx.shared import Inches, Pt
from openpyxl import Workbook
from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Inches as PInches
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures')
os.makedirs(OUT, exist_ok=True)


def p(name):
    return os.path.join(OUT, name)


def chart_png():
    img = Image.new('RGB', (320, 180), '#f4f6fb')
    d = ImageDraw.Draw(img)
    for i, h in enumerate([60, 120, 90, 150]):
        d.rectangle([30 + i * 70, 170 - h, 80 + i * 70, 170], fill=['#3b82f6', '#10b981', '#f59e0b', '#ef4444'][i])
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    buf.seek(0)
    return buf


# DOCX: headings, paragraphs, list, table, image, page break, font sizes
doc = Document()
doc.add_heading('Quarterly Report', 0)
doc.add_paragraph('This report summarises results for the quarter. Café prices rose 5%.')
doc.add_heading('Highlights', level=1)
for item in ['Revenue grew 12%', 'Two new offices opened', 'Customer satisfaction at 94%']:
    doc.add_paragraph(item, style='List Bullet')
t = doc.add_table(rows=3, cols=3)
t.style = 'Table Grid'
for r, row in enumerate([['Region', 'Q1', 'Q2'], ['North', '120', '135'], ['South', '98', '110']]):
    for c, v in enumerate(row):
        t.cell(r, c).text = v
doc.add_picture(chart_png(), width=Inches(3))
big = doc.add_paragraph().add_run('Large text paragraph.')
big.font.size = Pt(20)
doc.add_page_break()
doc.add_heading('Appendix', level=1)
doc.add_paragraph('Second page content with ').add_run('bold text').bold = True
doc.sections[0].header.paragraphs[0].text = 'Confidential header'
doc.save(p('report.docx'))

# PDF: 3 pages of selectable text
c = canvas.Canvas(p('text.pdf'), pagesize=A4)
c.setTitle('Sample PDF')
c.setAuthor('Fixture Author')
for i in range(1, 4):
    c.setFont('Helvetica-Bold', 20)
    c.drawString(72, 770, f'Page {i} heading')
    c.setFont('Helvetica', 12)
    c.drawString(72, 740, f'This is selectable text on page {i}.')
    c.drawString(72, 720, 'The quick brown fox jumps over the lazy dog.')
    c.showPage()
c.save()

def font(size):
    from PIL import ImageFont
    for path in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf']:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


# PDF: image-only page, simulating a scan
img = Image.new('RGB', (1240, 1754), 'white')
d = ImageDraw.Draw(img)
d.text((120, 160), 'Scanned invoice', fill='black', font=font(64))
d.text((120, 300), 'Total amount due: 42 dollars', fill='black', font=font(40))
d.text((120, 380), 'Thank you for your business', fill='black', font=font(40))
img_path = p('_scan.png')
img.save(img_path)
c = canvas.Canvas(p('scanned.pdf'), pagesize=A4)
c.drawImage(img_path, 0, 0, width=A4[0], height=A4[1])
c.showPage()
c.save()
os.remove(img_path)

# XLSX: two sheets, formula, leading zeros, dates
wb = Workbook()
ws = wb.active
ws.title = 'Sales'
ws.append(['Product', 'Units', 'Price', 'Total', 'SKU'])
ws.append(['Widget', 10, 2.5, '=B2*C2', '00123'])
ws.append(['Gadget', 4, 10, '=B3*C3', '00456'])
ws['D2'].value = '=B2*C2'
ws2 = wb.create_sheet('Notes')
ws2.append(['Note'])
ws2.append(['placeholder'])
ws2['A2'].value = '=cmd|calc'
ws2['A2'].data_type = 's'  # text that merely looks like a formula
ws2.append(['Line one\nLine two'])
wb.save(p('book.xlsx'))

# PPTX: 3 slides, backgrounds, text boxes, shape, table, image, notes, 16:9
prs = Presentation()
prs.slide_width = PInches(13.333)
prs.slide_height = PInches(7.5)
s1 = prs.slides.add_slide(prs.slide_layouts[0])
s1.shapes.title.text = 'Launch Plan'
s1.placeholders[1].text = 'Prepared for the board'
s1.background.fill.solid()
s1.background.fill.fore_color.rgb = RGBColor(0x1E, 0x29, 0x3B)
s1.notes_slide.notes_text_frame.text = 'Welcome everyone.'
s2 = prs.slides.add_slide(prs.slide_layouts[5])
s2.shapes.title.text = 'Timeline'
tb = s2.shapes.add_textbox(PInches(1), PInches(2), PInches(5), PInches(1))
tb.text_frame.text = 'Phase 1: Research & design'
s2.shapes.add_shape(1, PInches(7), PInches(2), PInches(3), PInches(2)).text_frame.text = 'Milestone'
tbl = s2.shapes.add_table(2, 2, PInches(1), PInches(4), PInches(6), PInches(1.5)).table
tbl.cell(0, 0).text = 'Week'
tbl.cell(0, 1).text = 'Goal'
tbl.cell(1, 0).text = '1'
tbl.cell(1, 1).text = 'Kickoff'
s3 = prs.slides.add_slide(prs.slide_layouts[6])
s3.shapes.add_picture(chart_png(), PInches(1), PInches(1))
s3.shapes.add_textbox(PInches(6), PInches(1), PInches(4), PInches(1)).text_frame.text = 'Results chart'
prs.save(p('deck.pptx'))

# ZIP with nested folder and a path-traversal entry
with zipfile.ZipFile(p('bundle.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('readme.txt', 'Hello from the archive\n')
    z.writestr('docs/notes.md', '# Notes\n\nNested file.\n')
    z.writestr('../evil.txt', 'should be sanitised\n')
    z.writestr('images/', '')
    z.writestr('data.json', json.dumps([{'a': 1}, {'a': 2}]))

# TAR.GZ
with tarfile.open(p('bundle.tar.gz'), 'w:gz') as tf:
    for name, data in [('project/main.txt', b'main file\n'), ('project/sub/deep.txt', b'deep file\n')]:
        info = tarfile.TarInfo(name)
        info.size = len(data)
        tf.addfile(info, io.BytesIO(data))

# Photo of printed text for image OCR
sign = Image.new('RGB', (1200, 400), '#f8f8f4')
d = ImageDraw.Draw(sign)
d.text((60, 80), 'Private file conversion', fill='#111111', font=font(72))
d.text((60, 220), 'Nothing leaves your device', fill='#222222', font=font(56))
sign.save(p('sign.png'))

print('fixtures written to', os.path.abspath(OUT))
