from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tmp" / "pdfs" / "linkedin-ai-visibility-playbook"
OUTPUT = (
    ROOT
    / "output"
    / "pdf"
    / "geopulse-ai-visibility-reporting-playbook-linkedin-compatible.pdf"
)


def main() -> None:
    pages = []
    for page_number in range(1, 9):
        source = SOURCE_DIR / f"page-{page_number}.png"
        with Image.open(source) as image:
            pages.append(image.convert("RGB"))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    first, *rest = pages
    first.save(
        OUTPUT,
        "PDF",
        save_all=True,
        append_images=rest,
        resolution=144.0,
        quality=92,
        optimize=True,
        title="The AI Visibility Reporting Playbook for Agencies",
        author="GEO-Pulse",
        subject="A practical workflow for measured AI visibility and readiness",
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
