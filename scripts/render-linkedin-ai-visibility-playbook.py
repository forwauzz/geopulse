"""Render the GEO-Pulse LinkedIn AI Visibility Reporting Playbook.

The cover deliberately follows the supplied document-ad composition: warm
yellow field, small brand lockup, compact eyebrow, oversized black hook,
short explanatory copy, original line illustration, and edition footer.
All interior content is grounded in shipped GEO-Pulse product contracts.
"""

from pathlib import Path
import math
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output" / "pdf"
PDF_PATH = OUT_DIR / "geopulse-ai-visibility-reporting-playbook-linkedin-2026-08.pdf"
CAPTION_PATH = OUT_DIR / "geopulse-ai-visibility-reporting-playbook-caption.txt"

W, H = 1080, 1350
INK = HexColor("#111719")
INK_SOFT = HexColor("#2C3435")
SLATE = HexColor("#565E74")
IVORY = HexColor("#F5F2E8")
PAPER = HexColor("#FFFFFF")
GOLD = HexColor("#B79C60")
GOLD_DARK = HexColor("#7F6C43")
YELLOW = HexColor("#E4AD35")
BLUE = HexColor("#005BC4")
PALE_BLUE = HexColor("#D5E3FD")
LINE = HexColor("#ABB4B5")


def register_fonts():
    font_dir = Path("C:/Windows/Fonts")
    choices = {
        "GEO-Regular": font_dir / "arial.ttf",
        "GEO-Bold": font_dir / "arialbd.ttf",
        "GEO-Black": font_dir / "arialbd.ttf",
        "GEO-Italic": font_dir / "ariali.ttf",
    }
    for name, file in choices.items():
        pdfmetrics.registerFont(TTFont(name, str(file)))


def pill(c, x, y, width, label, fill=INK, color=PAPER):
    c.setFillColor(fill)
    c.roundRect(x, y, width, 44, 22, fill=1, stroke=0)
    c.setFillColor(color)
    c.setFont("GEO-Bold", 16)
    c.drawCentredString(x + width / 2, y + 15, label)


def brand_lockup(c, x=82, y=1230, light=False):
    mark = ROOT / "public" / "branding" / ("geopulse-mark-square-dark.png" if light else "geopulse-mark-square-light.png")
    c.drawImage(ImageReader(str(mark)), x, y, 62, 62, mask="auto")
    c.setFillColor(PAPER if light else INK)
    c.setFont("GEO-Black", 30)
    c.drawString(x + 78, y + 20, "GEO-PULSE")


def eyebrow(c, text, x, y, color=INK_SOFT):
    item = c.beginText(x, y)
    item.setFillColor(color)
    item.setFont("GEO-Bold", 18)
    item.setCharSpace(2.4)
    item.textLine(text.upper())
    c.drawText(item)


def lines(c, values, x, y, size, leading=None, font="GEO-Black", color=INK, max_width=None):
    if leading is None:
        leading = size * 1.05
    c.setFillColor(color)
    c.setFont(font, size)
    for idx, value in enumerate(values):
        if max_width and pdfmetrics.stringWidth(value, font, size) > max_width:
            raise ValueError(f"Line too wide: {value}")
        c.drawString(x, y - idx * leading, value)
    return y - len(values) * leading


def paragraph(c, values, x, y, size=27, leading=38, color=INK_SOFT, font="GEO-Regular"):
    c.setFillColor(color)
    c.setFont(font, size)
    for idx, value in enumerate(values):
        c.drawString(x, y - idx * leading, value)
    return y - len(values) * leading


def footer(c, page, dark=False, label="AI VISIBILITY PLAYBOOK"):
    color = PAPER if dark else INK_SOFT
    c.setStrokeColor(GOLD if dark else GOLD_DARK)
    c.setLineWidth(2)
    c.line(82, 78, W - 82, 78)
    c.setFillColor(color)
    c.setFont("GEO-Bold", 14)
    c.drawString(82, 43, "AUGUST 2026 EDITION")
    c.drawRightString(W - 82, 43, f"{label}  /  {page:02d}")


def gear(c, cx, cy, r, teeth=10, stroke=INK, fill=PAPER):
    pts = []
    for i in range(teeth * 4):
        angle = math.pi * 2 * i / (teeth * 4)
        band = i % 4
        radius = r * (1.20 if band in (0, 1) else 0.90)
        pts.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    path = c.beginPath()
    path.moveTo(*pts[0])
    for p in pts[1:]:
        path.lineTo(*p)
    path.close()
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(7)
    c.drawPath(path, fill=1, stroke=1)
    c.circle(cx, cy, r * 0.34, fill=0, stroke=1)


def cover_illustration(c):
    c.setStrokeColor(INK)
    c.setFillColor(PAPER)
    c.setLineWidth(8)
    # Tilted audit report.
    c.saveState()
    c.translate(555, 348)
    c.rotate(-11)
    c.roundRect(-160, -160, 320, 390, 16, fill=1, stroke=1)
    c.setFillColor(PALE_BLUE)
    c.roundRect(-120, 130, 240, 52, 12, fill=1, stroke=1)
    c.setStrokeColor(INK)
    for y, width in [(70, 205), (20, 165), (-30, 225)]:
        c.line(-110, y, -110 + width, y)
    c.setFillColor(BLUE)
    for i, height in enumerate((72, 120, 168)):
        c.rect(-95 + i * 62, -132, 34, height, fill=1, stroke=1)
    c.restoreState()
    # Magnifying glass.
    c.setStrokeColor(INK)
    c.setLineWidth(13)
    c.circle(675, 490, 104, fill=0, stroke=1)
    c.line(748, 414, 842, 310)
    # Gears and proof spark.
    gear(c, 387, 482, 62)
    gear(c, 315, 380, 42)
    c.setLineWidth(7)
    c.line(804, 552, 804, 600)
    c.line(780, 576, 828, 576)
    c.line(868, 500, 868, 544)
    c.line(846, 522, 890, 522)
    c.setFont("GEO-Black", 26)
    c.setFillColor(INK)
    c.drawString(815, 278, "MEASURE")
    c.drawString(815, 244, "FIX")
    c.drawString(815, 210, "VERIFY")


def draw_cover(c):
    c.setFillColor(YELLOW)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    brand_lockup(c, 82, 1230)
    pill(c, 794, 1240, 202, "•  AGENCY PLAYBOOK")
    eyebrow(c, "The AI visibility reporting playbook for agencies", 82, 1038, INK)
    lines(c, ["Stop reporting", "AI visibility", "by hand."], 82, 958, 86, 92, max_width=910)
    paragraph(c, [
        "Measure the questions buyers ask, show the denominator,",
        "fix the first blocker, and verify the result again.",
    ], 82, 650, 27, 39, INK_SOFT)
    cover_illustration(c)
    c.setFillColor(INK_SOFT)
    c.setFont("GEO-Bold", 13)
    c.drawString(82, 42, "AUGUST 2026 EDITION")
    c.drawRightString(W - 82, 42, "GETGEOPULSE.COM")
    c.showPage()


def interior_header(c, page, title, dark=False):
    bg = INK if dark else IVORY
    c.setFillColor(bg)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    brand_lockup(c, 82, 1230, light=dark)
    pill(c, 840, 1240, 156, f"PAGE {page:02d}", GOLD if dark else INK, INK if dark else PAPER)
    eyebrow(c, "AI visibility reporting playbook", 82, 1140, GOLD if dark else SLATE)
    return PAPER if dark else INK


def draw_loop(c):
    color = interior_header(c, 2, "The operating loop")
    lines(c, ["The useful workflow", "is not another score."], 82, 1060, 72, 80, color=color)
    paragraph(c, ["It is a repeatable operating loop with dated evidence."], 82, 866, 29, 40, SLATE)
    labels = [("01", "MEASURE", "Exact buyer questions"), ("02", "DIAGNOSE", "Access, clarity, trust"),
              ("03", "FIX", "The first real blocker"), ("04", "VERIFY", "Run the same scope again")]
    y = 700
    for idx, (num, title, body) in enumerate(labels):
        x = 82 + (idx % 2) * 478
        row_y = y - (idx // 2) * 250
        c.setFillColor(PAPER)
        c.setStrokeColor(GOLD_DARK)
        c.setLineWidth(3)
        c.roundRect(x, row_y - 150, 438, 196, 18, fill=1, stroke=1)
        c.setFillColor(GOLD_DARK)
        c.setFont("GEO-Black", 34)
        c.drawString(x + 28, row_y - 2, num)
        c.setFillColor(INK)
        c.setFont("GEO-Black", 28)
        c.drawString(x + 96, row_y - 2, title)
        c.setFillColor(SLATE)
        c.setFont("GEO-Regular", 23)
        c.drawString(x + 28, row_y - 68, body)
    footer(c, 2)
    c.showPage()


def draw_questions(c):
    color = interior_header(c, 3, "Buyer questions", dark=True)
    lines(c, ["Start with the", "question—not the tool."], 82, 1060, 74, 82, color=color)
    paragraph(c, ["A useful baseline begins with real buying decisions."], 82, 865, 29, 40, HexColor("#CBD4D5"))
    prompts = [
        "Who should I hire for this problem?",
        "Which provider fits my market?",
        "What should I compare before I buy?",
    ]
    y = 690
    for i, prompt in enumerate(prompts):
        c.setFillColor(IVORY)
        c.roundRect(82, y - i * 170, 916, 126, 20, fill=1, stroke=0)
        c.setFillColor(BLUE)
        c.circle(126, y + 63 - i * 170, 18, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("GEO-Bold", 29)
        c.drawString(168, y + 52 - i * 170, prompt)
    c.setFillColor(GOLD)
    c.roundRect(82, 184, 916, 104, 18, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("GEO-Black", 28)
    c.drawString(112, 223, "Measure whether the brand appears for these questions.")
    footer(c, 3, dark=True)
    c.showPage()


def draw_denominator(c):
    color = interior_header(c, 4, "The denominator")
    lines(c, ["Always show", "the denominator."], 82, 1060, 78, 84, color=color)
    paragraph(c, ["A percentage without scope is not a client-ready result."], 82, 866, 29, 40, SLATE)
    c.setFillColor(INK)
    c.roundRect(82, 580, 916, 220, 26, fill=1, stroke=0)
    c.setFillColor(PAPER)
    c.setFont("GEO-Black", 48)
    c.drawString(124, 706, "CITED ANSWERS")
    c.setStrokeColor(GOLD)
    c.setLineWidth(5)
    c.line(124, 668, 956, 668)
    c.setFont("GEO-Black", 48)
    c.drawString(124, 596, "COMPLETED ANSWERS")
    notes = [
        ("NAME THE SCOPE", "Questions, assistants, market, and period."),
        ("OMIT UNAVAILABLE RUNS", "Never score a failed or unavailable assistant as zero."),
        ("DATE THE EVIDENCE", "AI answers can vary. The report must say when it was measured."),
    ]
    y = 480
    for title, body in notes:
        c.setFillColor(GOLD_DARK)
        c.setFont("GEO-Black", 22)
        c.drawString(82, y, title)
        c.setFillColor(INK_SOFT)
        c.setFont("GEO-Regular", 23)
        c.drawString(82, y - 38, body)
        y -= 118
    footer(c, 4)
    c.showPage()


def draw_checks(c):
    color = interior_header(c, 5, "Readiness checks", dark=True)
    lines(c, ["24 checks.", "Three different jobs."], 82, 1060, 78, 84, color=color)
    paragraph(c, ["Do not flatten eligibility, understanding, and hygiene into one claim."], 82, 866, 28, 40, HexColor("#CBD4D5"))
    buckets = [
        ("5", "ELIGIBILITY", "Can an AI system reach and reuse the page?", GOLD),
        ("14", "UNDERSTANDING + TRUST", "Can it extract the answer and identify the source?", BLUE),
        ("5", "WEBSITE HYGIENE", "Worth reporting. Excluded from the AI-readiness score.", GOLD_DARK),
    ]
    y = 710
    for num, title, body, accent in buckets:
        c.setFillColor(IVORY)
        c.roundRect(82, y - 135, 916, 180, 22, fill=1, stroke=0)
        c.setFillColor(accent)
        c.setFont("GEO-Black", 72)
        c.drawString(118, y - 66, num)
        c.setFillColor(INK)
        c.setFont("GEO-Black", 26)
        c.drawString(254, y - 18, title)
        c.setFillColor(SLATE)
        c.setFont("GEO-Regular", 23)
        c.drawString(254, y - 67, body)
        y -= 220
    footer(c, 5, dark=True)
    c.showPage()


def draw_gates(c):
    color = interior_header(c, 6, "Access gates")
    lines(c, ["Five gates before", "content work begins."], 82, 1060, 76, 82, color=color)
    paragraph(c, ["If the page cannot be retrieved, rewriting is not the first move."], 82, 868, 28, 40, SLATE)
    labels = ["AI CRAWLER", "ROBOTS META", "SNIPPET", "HTTPS", "CANONICAL"]
    x0, y0 = 92, 590
    for i, label in enumerate(labels):
        x = x0 + i * 188
        c.setFillColor(INK if i < 4 else BLUE)
        c.roundRect(x, y0, 156, 210, 18, fill=1, stroke=0)
        c.setFillColor(GOLD)
        c.circle(x + 78, y0 + 142, 27, fill=1, stroke=0)
        c.setFillColor(PAPER)
        c.setFont("GEO-Black", 26)
        c.drawCentredString(x + 78, y0 + 132, str(i + 1))
        c.setFont("GEO-Bold", 15)
        c.drawCentredString(x + 78, y0 + 48, label)
    c.setFillColor(GOLD)
    c.roundRect(82, 322, 916, 130, 20, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("GEO-Black", 31)
    c.drawString(118, 378, "Fix access first. Improve the answer second.")
    footer(c, 6)
    c.showPage()


def draw_report(c):
    color = interior_header(c, 7, "Client-ready reporting", dark=True)
    lines(c, ["A useful report", "answers seven questions."], 82, 1060, 74, 82, color=color)
    items = [
        "What did buyers ask?",
        "Which assistants were measured?",
        "What completed-answer denominator was used?",
        "Did the brand appear?",
        "Which sources appeared instead?",
        "What should the team fix first?",
        "When will the same scope be verified again?",
    ]
    y = 835
    for i, item in enumerate(items):
        c.setStrokeColor(GOLD)
        c.setLineWidth(3)
        c.circle(108, y + 5, 18, fill=0, stroke=1)
        c.line(99, y + 5, 106, y - 4)
        c.line(106, y - 4, 122, y + 14)
        c.setFillColor(PAPER)
        c.setFont("GEO-Bold", 28)
        c.drawString(158, y - 5, item)
        y -= 92
    footer(c, 7, dark=True)
    c.showPage()


def draw_cta(c):
    c.setFillColor(YELLOW)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    brand_lockup(c, 82, 1230)
    eyebrow(c, "The practical next move", 82, 1086, INK)
    lines(c, ["Measure.", "Fix.", "Verify."], 82, 994, 110, 112, max_width=900)
    paragraph(c, [
        "Run a free scan to find the first readiness blocker.",
        "Then build the dated reporting loop around real buyer questions.",
    ], 82, 606, 29, 42, INK_SOFT)
    c.setFillColor(INK)
    c.roundRect(82, 352, 916, 130, 65, fill=1, stroke=0)
    c.setFillColor(PAPER)
    c.setFont("GEO-Black", 34)
    c.drawCentredString(W / 2, 399, "GETGEOPULSE.COM  -  FREE SCAN")
    c.setFillColor(INK_SOFT)
    c.setFont("GEO-Bold", 16)
    c.drawString(82, 42, "AUGUST 2026 EDITION")
    c.drawRightString(W - 82, 42, "08 / 08")
    c.showPage()


def build():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    register_fonts()
    c = canvas.Canvas(str(PDF_PATH), pagesize=(W, H), pageCompression=1)
    c.setTitle("The AI Visibility Reporting Playbook for Agencies")
    c.setAuthor("GEO-Pulse")
    c.setSubject("A practical reporting workflow for measured AI visibility and readiness")
    draw_cover(c)
    draw_loop(c)
    draw_questions(c)
    draw_denominator(c)
    draw_checks(c)
    draw_gates(c)
    draw_report(c)
    draw_cta(c)
    c.save()

    caption = """Most agencies do not have an AI visibility dashboard problem.

They have a measurement problem.

If a buyer asks a high-intent question and your client’s brand does not appear, you need more than a screenshot or an unexplained score.

You need a repeatable loop:

1. Measure the exact questions buyers ask.
2. Show the denominator.
3. Diagnose access, understanding, and trust.
4. Fix the first real blocker.
5. Verify the same scope again.

We built GEO-Pulse around that workflow.

This eight-page playbook breaks down the practical version agencies can use in client reporting—without ranking guarantees, citation promises, or hand-waving.

Download it, use it in your next client review, and run a free scan at getgeopulse.com.

#AISearch #GEO #SEOAgency #MarketingReporting #AIVisibility"""
    CAPTION_PATH.write_text(caption, encoding="utf-8")
    print(PDF_PATH)
    print(CAPTION_PATH)


if __name__ == "__main__":
    build()
