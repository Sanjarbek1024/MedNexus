"""Download public sample images for demos and tests into ./samples.

Run with the backend environment (it needs numpy, Pillow and pydicom):

    backend/.venv/Scripts/python scripts/download_samples.py      (Windows)
    backend/.venv/bin/python scripts/download_samples.py          (macOS / Linux)

Sources and licenses are listed in samples/SOURCES.md. All images are CC0 / public domain
Wikimedia Commons files, except one image from the public NIH ChestX-ray14 dataset.
"""

from __future__ import annotations

import io
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
import pydicom
from PIL import Image
from pydicom.dataset import FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

SAMPLES_DIR = Path(__file__).resolve().parents[1] / "samples"
USER_AGENT = "MedNexus/0.1 (research prototype; sample downloader)"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
NIH_SAMPLE = "https://raw.githubusercontent.com/mlmed/torchxrayvision/main/tests/00000001_000.png"
DIGITAL_XRAY_STORAGE = "1.2.840.10008.5.1.4.1.1.1.1"  # Digital X-Ray Image Storage - For Presentation


@dataclass(frozen=True)
class Sample:
    filename: str
    source: str  # a Wikimedia Commons file title, or a direct URL
    max_width: int | None = None  # request a scaled rendition from Commons


SAMPLES = [
    Sample("chest_pa_normal.jpg", "Normal posteroanterior (PA) chest radiograph (X-ray).jpg"),
    Sample("chest_pa_normal_2.png", "Chest Xray PA 3-8-2010.png", max_width=1600),
    Sample("chest_pa_heart_failure.jpg", "Chest radiograph of a lung with Kerley B lines.jpg"),
    Sample(
        "chest_pa_pneumonia.jpg", "Chest radiograph in influensa and H influenzae, posteroanterior.jpg"
    ),
    Sample("chest_nih_00000001_000.png", NIH_SAMPLE),
    Sample("hand_xray.jpg", "X-ray of normal hand by dorsoplantar projection.jpg"),
    Sample("knee_xray.jpg", "X-ray of a normal knee by anteroposterior projection.jpg"),
    Sample("photo_kitten.jpg", "A curious kitten (Pixabay).jpg", max_width=1280),
]


def fetch(url: str, attempts: int = 5) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            if exc.code != 429 or attempt == attempts - 1:
                raise
            # Wikimedia rate limit: wait as asked, or back off exponentially.
            time.sleep(float(exc.headers.get("Retry-After") or 2 ** (attempt + 1)))
    raise AssertionError("unreachable")


def commons_url(title: str, max_width: int | None) -> str:
    params = {
        "action": "query",
        "titles": f"File:{title}",
        "prop": "imageinfo",
        "iiprop": "url",
        "format": "json",
    }
    if max_width:
        params["iiurlwidth"] = str(max_width)
    data = json.loads(fetch(f"{COMMONS_API}?{urllib.parse.urlencode(params)}"))
    info = next(iter(data["query"]["pages"].values()))["imageinfo"][0]
    return info.get("thumburl") or info["url"]


def download(sample: Sample) -> Path:
    target = SAMPLES_DIR / sample.filename
    if not target.exists():
        is_url = sample.source.startswith("https://")
        url = sample.source if is_url else commons_url(sample.source, sample.max_width)
        target.write_bytes(fetch(url))
    return target


def write_dicom(source: Path, target: Path) -> None:
    """Wrap a sample radiograph in a 12-bit DX DICOM file, to demo DICOM support."""
    pixels = np.asarray(Image.open(source).convert("L"), dtype=np.float32)
    stored = np.round(pixels / 255 * 4095).astype(np.uint16)

    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = DIGITAL_XRAY_STORAGE
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds = pydicom.Dataset()
    ds.file_meta = meta
    ds.SOPClassUID = DIGITAL_XRAY_STORAGE
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.PatientName = "SAMPLE^DEMO"
    ds.PatientID = "DEMO-0001"
    ds.StudyDate = date.today().strftime("%Y%m%d")
    ds.Modality = "DX"
    ds.BodyPartExamined = "CHEST"
    ds.ViewPosition = "PA"
    ds.Rows, ds.Columns = stored.shape
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = 16
    ds.BitsStored = 12
    ds.HighBit = 11
    ds.PixelRepresentation = 0
    ds.WindowCenter = 2048
    ds.WindowWidth = 4096
    ds.PixelData = stored.tobytes()

    buffer = io.BytesIO()
    ds.save_as(buffer, enforce_file_format=True)
    target.write_bytes(buffer.getvalue())


def main() -> None:
    SAMPLES_DIR.mkdir(exist_ok=True)
    for sample in SAMPLES:
        path = download(sample)
        print(f"  {path.name:32} {path.stat().st_size // 1024:>6} KB")

    dicom = SAMPLES_DIR / "chest_pa_normal.dcm"
    if not dicom.exists():
        write_dicom(SAMPLES_DIR / "chest_pa_normal.jpg", dicom)
    print(f"  {dicom.name:32} {dicom.stat().st_size // 1024:>6} KB  (derived DICOM)")
    print(f"Samples are in {SAMPLES_DIR}")


if __name__ == "__main__":
    main()
