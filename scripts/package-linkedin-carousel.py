from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from PIL import Image, ImageCms


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tmp" / "pdfs" / "linkedin-ai-visibility-playbook"
OUTPUT_DIR = ROOT / "output" / "linkedin-carousel"
ZIP_PATH = ROOT / "output" / "geopulse-linkedin-carousel.zip"

FILENAMES = [
    "01-geopulse-cover.jpg",
    "02-geopulse-workflow.jpg",
    "03-geopulse-buyer-questions.jpg",
    "04-geopulse-denominator.jpg",
    "05-geopulse-24-checks.jpg",
    "06-geopulse-access-gates.jpg",
    "07-geopulse-client-report.jpg",
    "08-geopulse-cta.jpg",
]


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    srgb_profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()

    output_paths = []
    for page_number, filename in enumerate(FILENAMES, start=1):
        source = SOURCE_DIR / f"page-{page_number}.png"
        destination = OUTPUT_DIR / filename
        with Image.open(source) as image:
            rgb = image.convert("RGB")
            if rgb.size != (1080, 1350):
                raise ValueError(f"Unexpected dimensions for {source}: {rgb.size}")
            rgb.save(
                destination,
                format="JPEG",
                quality=94,
                subsampling=0,
                optimize=True,
                progressive=True,
                icc_profile=srgb_profile,
                dpi=(144, 144),
            )
        output_paths.append(destination)

    with ZipFile(ZIP_PATH, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for path in output_paths:
            archive.write(path, arcname=path.name)

    print(ZIP_PATH)


if __name__ == "__main__":
    main()
