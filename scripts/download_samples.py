"""Download public sample images for demos and tests into ./samples.

Run with the backend environment (it needs numpy, Pillow and pydicom):

    backend/.venv/Scripts/python scripts/download_samples.py      (Windows)
    backend/.venv/bin/python scripts/download_samples.py          (macOS / Linux)

Sources and licenses are listed in samples/SOURCES.md: Wikimedia Commons files (CC0, public
domain, CC BY and CC BY-SA, credited there) and one image from the public NIH ChestX-ray14
dataset.
"""

from __future__ import annotations

import io
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, timedelta
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
MR_IMAGE_STORAGE = "1.2.840.10008.5.1.4.1.1.4"
DEMO_DIR = SAMPLES_DIR / "demo"


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
    Sample("wrist_buckle_fracture.jpg", "Radiology 1300570 Nevit.jpg", max_width=1400),
    Sample("wrist_salter_harris_fracture.jpg", "Salter Harris 1 demo(1).jpg", max_width=1400),
    Sample("wrist_greenstick_fracture.jpg", "Greenstick fracture, A-P view.jpg", max_width=1400),
    Sample("hand_xray.jpg", "X-ray of normal hand by dorsoplantar projection.jpg"),
    Sample("knee_xray.jpg", "X-ray of a normal knee by anteroposterior projection.jpg"),
    Sample("photo_kitten.jpg", "A curious kitten (Pixabay).jpg", max_width=1280),
    Sample("brain_mri_glioma.jpg", "Glioblastoma multiforme - MRT T1KM ax.jpg"),
    Sample("brain_mri_meningioma.jpg", "Huge Meningioma.jpg"),
    Sample("brain_mri_pituitary.jpg", "Acromegaly pituitary macroadenoma.JPEG"),
    Sample("brain_mri_normal.jpg", "MRI Brain T2 Axial (12).jpg"),
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


@dataclass(frozen=True)
class DerivedDicom:
    """A sample image wrapped in DICOM, with a fictitious patient that the app anonymizes."""

    filename: str
    source: str
    modality: str = "DX"
    body_part: str = "CHEST"
    view: str | None = "PA"
    patient_id: str = "DEMO-0001"
    patient_name: str = "SAMPLE^DEMO"
    days_ago: int = 0  # study date; two studies of one patient enable the prior comparison


DERIVED_DICOMS = [
    # One patient, six months apart: normal first, then pneumonia (Compare page).
    DerivedDicom("chest_pa_normal.dcm", "chest_pa_normal.jpg", days_ago=183),
    DerivedDicom("chest_pa_pneumonia.dcm", "chest_pa_pneumonia.jpg"),
    DerivedDicom("wrist_buckle_fracture.dcm", "wrist_buckle_fracture.jpg", body_part="WRIST",
                 patient_id="DEMO-0002", patient_name="SAMPLE^CHILD"),
    DerivedDicom("brain_mri_glioma.dcm", "brain_mri_glioma.jpg", modality="MR", body_part="HEAD", view=None,
                 patient_id="DEMO-0003", patient_name="SAMPLE^BRAIN"),
]


def write_dicom(source: Path, target: Path, spec: DerivedDicom) -> None:
    """Wrap a sample image in a 12-bit DICOM file, to demo DICOM support and anonymization."""
    pixels = np.asarray(Image.open(source).convert("L"), dtype=np.float32)
    stored = np.round(pixels / 255 * 4095).astype(np.uint16)
    sop_class = MR_IMAGE_STORAGE if spec.modality == "MR" else DIGITAL_XRAY_STORAGE

    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = sop_class
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds = pydicom.Dataset()
    ds.file_meta = meta
    ds.SOPClassUID = sop_class
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.PatientName = spec.patient_name
    ds.PatientID = spec.patient_id
    ds.StudyDate = (date.today() - timedelta(days=spec.days_ago)).strftime("%Y%m%d")
    ds.Modality = spec.modality
    ds.BodyPartExamined = spec.body_part
    if spec.view:
        ds.ViewPosition = spec.view
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


@dataclass(frozen=True)
class DemoItem:
    """One file of the demo folder, with what to select and type when showing it (in Uzbek)."""

    sample: str
    name: str  # file name inside the category folder
    study: str  # what to choose in the imaging step of the New case page
    symptoms: str = ""
    expected: str = ""


CHEST = "Ko'krak qafasi rentgeni / flyuorografiya"
LIMB = "Qo'l-oyoq rentgeni"
BRAIN = "Bosh miya MRT"

DEMO = {
    "1_kokrak_rentgeni_flyuorografiya": [
        DemoItem("chest_pa_normal.jpg", "01_normal_profilaktik.jpg", CHEST,
                 "Ishga kirish uchun profilaktik flyuorografiya. Shikoyatim yo'q. (29 yosh, ayol)",
                 "Topilma yo'q, shoshilinch emas."),
        DemoItem("chest_pa_pneumonia.jpg", "02_pnevmoniya.jpg", CHEST,
                 "3 kundan beri yo'tal, harorat 38,5, o'ng tomonda nafas olganda ko'krak og'rig'i. (46 yosh, erkak)",
                 "Konsolidatsiya / pnevmoniya, issiqlik xaritasi; shifokorlar navbatida 'Shoshilinch'."),
        DemoItem("chest_pa_heart_failure.jpg", "03_yurak_yetishmovchiligi.jpg", CHEST,
                 "Oyoqlarim shishadi, zinaga chiqqanda nafasim qisadi, kechasi baland yostiqda uxlayman. (67 yosh, ayol)",
                 "O'pka xiralashuvi, infiltratsiya; 'E'tibor' darajasi."),
        DemoItem("chest_nih_00000001_000.png", "04_kardiomegaliya.png", CHEST,
                 "Tez charchayman, ba'zan yuragim tez uradi. (58 yosh, erkak)",
                 "Kardiomegaliya 'noaniq' darajada; yurak-ko'krak nisbati o'lchanadi."),
        DemoItem("chest_pa_normal_2.png", "05_normal_2.png", CHEST, "Shikoyat yo'q, yillik ko'rik.",
                 "Topilma yo'q."),
    ],
    "2_qol_oyoq_sinish": [
        DemoItem("wrist_buckle_fracture.jpg", "01_bilak_sinishi_bukilma.jpg", LIMB,
                 "Velosipeddan yiqildi, bilagi shishgan va qimirlatganda og'riyapti. (11 yosh, o'g'il bola)",
                 "Sinish ~0.81, ramka bilan; 'Shoshilinch'."),
        DemoItem("wrist_salter_harris_fracture.jpg", "02_bilak_sinishi_salter_harris.jpg", LIMB,
                 "Futbolda qo'liga yiqildi, bilak sohasi og'riydi. (13 yosh, o'g'il bola)",
                 "Sinish ~0.76, ramka bilan."),
        DemoItem("wrist_greenstick_fracture.jpg", "03_bilak_sinishi_yashil_novda.jpg", LIMB,
                 "Daraxtdan yiqildi, bilagi biroz qiyshaygandek. (8 yosh, qiz bola)",
                 "Sinish ~0.47, 'noaniq' daraja: shifokor tekshiruvi kerakligini ko'rsatish uchun."),
        DemoItem("hand_xray.jpg", "04_qol_panjasi_normal.jpg", LIMB,
                 "Eshikka qisib oldim, barmoqlarim og'riyapti. (35 yosh, erkak)",
                 "Normal qo'l; AI ~0.52 soxta sinish ko'rsatishi mumkin: nega shifokor kerakligining misoli."),
    ],
    "3_miya_mrt": [
        DemoItem("brain_mri_glioma.jpg", "01_glioma.jpg", BRAIN,
                 "2 oydan beri bosh og'rig'i, ertalab kuchayadi, ko'ngil aynishi va ko'rish xiralashishi. (52 yosh, ayol)",
                 "Glioma ~0.96; neyroxirurgiyaga yo'naltirish."),
        DemoItem("brain_mri_meningioma.jpg", "02_meningioma.jpg", BRAIN,
                 "Yarim yildan beri bosh og'rig'i, oxirgi paytda xotira pasaygandek. (61 yosh, ayol)",
                 "Meningioma ~0.95."),
        DemoItem("brain_mri_pituitary.jpg", "03_gipofiz_osmasi.jpg", BRAIN,
                 "Ko'rish maydoni torayganday, bosh og'riydi, poyabzal razmerim kattalashdi. (44 yosh, erkak)",
                 "Gipofiz o'smasi ~0.96."),
        DemoItem("brain_mri_normal.jpg", "04_normal_miya.jpg", BRAIN,
                 "Ba'zan charchoqdan bosh og'rig'i bo'ladi. (30 yosh, ayol)",
                 "O'sma topilmadi (~0.98 'o'sma yo'q')."),
    ],
    "4_dicom": [
        DemoItem("chest_pa_normal.dcm", "01_kokrak_normal_6_oy_oldin.dcm", CHEST,
                 "Profilaktik ko'rik. Demo bazada bu tekshiruv 6 oy oldingi sana bilan shifokorda allaqachon bor.",
                 "DICOM o'qiladi va anonimlashtiriladi (ism va sana o'chiriladi); bemor faqat PX-... taxallusi bilan ko'rinadi."),
        DemoItem("chest_pa_pneumonia.dcm", "02_kokrak_pnevmoniya_bugun.dcm", CHEST,
                 "3 kundan beri yo'tal va harorat 38,5. (doctor@mednexus.uz sifatida yuklang)",
                 "O'sha bemorga bog'lanadi (bir xil PatientID): 'Solishtirish'da 6 oylik oraliq, o'zgarishlar jadvali bilan."),
        DemoItem("wrist_buckle_fracture.dcm", "03_bilak_sinishi.dcm", LIMB,
                 "Yiqilgandan keyin bilak og'rig'i.", "DICOM sarlavhasi (WRIST) qo'l-oyoq tanloviga mos keladi."),
        DemoItem("brain_mri_glioma.dcm", "04_miya_mrt_glioma.dcm", BRAIN,
                 "Bosh og'rig'i va ko'ngil aynishi.", "MR DICOM, HEAD; glioma ~0.96."),
    ],
    "5_rad_etiladigan_rasmlar": [
        DemoItem("photo_kitten.jpg", "01_mushuk_rasmi.jpg", CHEST, "",
                 "'Rasm rad etildi': rangli fotosurat, tibbiy rasm emas."),
        DemoItem("knee_xray.jpg", "02_tizza_kokrak_deb.jpg", CHEST, "",
                 "Ko'krak deb yuklansa rad etiladi: ko'krak anatomiyasi topilmadi."),
    ],
}


# The one-click sample cases of the New case page; the same file drives the demo folder.
SAMPLE_CASES = Path(__file__).resolve().parents[1] / "frontend" / "public" / "samples" / "cases.json"
SEX_UZ = {"male": "erkak", "female": "ayol"}
# Uzbek chip labels of the New case page, so a presenter can tick the same boxes by hand.
SYMPTOMS_UZ = {
    "fever": "Isitma", "chills": "Titroq", "fatigue": "Holsizlik", "weight_loss": "Ozish",
    "night_sweats": "Kechasi terlash", "sweating": "Sovuq ter", "cough": "Yo‘tal", "sputum": "Balg‘am",
    "hemoptysis": "Qon tupurish", "dyspnea": "Nafas qisishi", "severe_dyspnea": "Kuchli nafas yetishmasligi",
    "wheezing": "Xirillash", "sore_throat": "Tomoq og‘rig‘i", "chest_pain": "Ko‘krak og‘rig‘i",
    "palpitations": "Yurak urishi sezilishi", "syncope": "Hushdan ketish", "edema_legs": "Oyoq shishi",
    "headache": "Bosh og‘rig‘i", "thunderclap_headache": "To‘satdan kuchli bosh og‘rig‘i",
    "dizziness": "Bosh aylanishi", "confusion": "Hush chalkashligi", "seizure": "Tutqanoq",
    "focal_deficit": "Bir tomonlama holsizlik / uvishish", "vision_change": "Ko‘rish o‘zgarishi",
    "neck_stiffness": "Ensa mushaklari rigidligi", "nausea": "Ko‘ngil aynishi", "vomiting": "Qusish",
    "abdominal_pain": "Qorin og‘rig‘i", "diarrhea": "Ich ketishi", "pain": "Mahalliy og‘riq",
    "swelling": "Shish", "trauma": "Yaqinda jarohat", "limited_motion": "Harakat cheklanishi",
}
HISTORY_UZ = {
    "hypertension": "Gipertoniya", "diabetes": "Qandli diabet", "copd_asthma": "SOOK / astma",
    "heart_disease": "Yurak kasalligi", "ckd": "Surunkali buyrak kasalligi", "cancer": "Onkologiya",
    "immunosuppression": "Immunosupressiya / OIV", "tb_history": "Ilgari sil kasalligi",
    "pregnancy": "Homiladorlik", "anticoagulants": "Antikoagulyant qabul qiladi",
}


def sample_case_lines() -> list[str]:
    """Write samples/demo/0_namuna_holatlar/: one sheet per sample case, plus its image."""
    cases = json.loads(SAMPLE_CASES.read_text(encoding="utf-8"))
    folder = "0_namuna_holatlar"
    target_dir = DEMO_DIR / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    lines = ["", "", folder, "-" * len(folder),
             "Eng oson yo'l: 'Yangi holat' sahifasida 'Namuna holatni yuklash' tugmasini bosing.",
             "Quyidagi ma'lumotlarni qo'lda kiritib ko'rsatish ham mumkin."]
    for number, case in enumerate(cases, start=1):
        text = case["locale"]["uz"]
        clinical, vitals = case["clinical"], case["clinical"].get("vitals", {})
        sheet = [
            f"{text['title']} ({case['age']} yosh, {SEX_UZ[case['sex']]})",
            "",
            f"Asosiy shikoyat:   {text['chief_complaint']}",
            f"Davomiyligi:       {text['duration']}",
            f"Kasallik tarixi:   {text['hpi']}",
            f"Simptomlar:        {', '.join(SYMPTOMS_UZ.get(c, c) for c in clinical.get('symptoms', []))}",
            "Vital:             " + ", ".join(f"{k}={v}" for k, v in vitals.items() if v not in (None, False, "alert")),
            f"Anamnez:           {', '.join(HISTORY_UZ.get(c, c) for c in clinical.get('history', [])) or '-'}",
            f"Dorilar:           {text['medications'] or '-'}",
            f"Ko'rik:            {text['exam'] or '-'}",
            f"Tahlillar:         {text['labs'] or '-'}",
        ]
        image = case.get("image")
        name = f"{number:02}_{case['id']}"
        if image:
            suffix = Path(image["file"]).suffix
            (target_dir / f"{name}{suffix}").write_bytes((SAMPLES_DIR / image["file"]).read_bytes())
            sheet.append(f"Tasvir (7-bo'lim): {name}{suffix}  ({image['modality']} / {image['region']} / {image['view']})")
        else:
            sheet.append("Tasvir:            yo'q (faqat simptomlar asosida differensial)")
        sheet += ["", f"Kutiladi: {text['expected']}"]
        (target_dir / f"{name}.txt").write_text("\n".join(sheet) + "\n", encoding="utf-8")
        lines += ["", f"{name}.txt" + (f" + {name}{Path(image['file']).suffix}" if image else ""), f"  {text['title']}",
                  f"  Kutiladi: {text['expected']}"]
    return lines


def make_demo_folder() -> None:
    """Copy the samples into samples/demo/<category>/ with a README of what to show."""
    lines = [
        "MedNexus demo ma'lumotlari",
        "==========================",
        "",
        "Kirish: doctor@mednexus.uz, parol MedNexus-Demo-2026. MedNexus faqat shifokorlar uchun:",
        "'Yangi holat' sahifasida avval klinik ma'lumotlar (shikoyat, simptomlar, vital",
        "ko'rsatkichlar, anamnez, ko'rik, tahlillar) kiritiladi; tasvir ixtiyoriy va oxirgi",
        "(7-) bo'limda qo'shiladi yoki keyinroq holat sahifasidan biriktiriladi.",
        "",
        "Barcha rasmlar ochiq litsenziyali (samples/SOURCES.md). DICOM fayllardagi bemor",
        "ma'lumotlari to'qima (SAMPLE^DEMO) va yuklashda o'chiriladi. Namuna holatlar",
        "o'quv maqsadidagi to'qima holatlar.",
    ]
    lines += sample_case_lines()
    lines += ["", "", "Tasvirlar bo'yicha qo'shimcha misollar",
              "(tasvirni 7-bo'limda yuklang; 'Simptomlar' matnini 'Kasallik tarixi' maydoniga yozing)"]
    for folder, items in DEMO.items():
        target_dir = DEMO_DIR / folder
        target_dir.mkdir(parents=True, exist_ok=True)
        lines += ["", "", folder, "-" * len(folder)]
        for item in items:
            (target_dir / item.name).write_bytes((SAMPLES_DIR / item.sample).read_bytes())
            lines += ["", item.name, f"  Tur:        {item.study}"]
            if item.symptoms:
                lines.append(f"  Simptomlar: {item.symptoms}")
            lines.append(f"  Kutiladi:   {item.expected}")
    (DEMO_DIR / "README.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    SAMPLES_DIR.mkdir(exist_ok=True)
    for sample in SAMPLES:
        path = download(sample)
        print(f"  {path.name:32} {path.stat().st_size // 1024:>6} KB")

    for spec in DERIVED_DICOMS:
        dicom = SAMPLES_DIR / spec.filename
        if not dicom.exists():
            write_dicom(SAMPLES_DIR / spec.source, dicom, spec)
        print(f"  {dicom.name:32} {dicom.stat().st_size // 1024:>6} KB  (derived DICOM)")
    make_demo_folder()
    print(f"Samples are in {SAMPLES_DIR}; the demo folder with instructions is {DEMO_DIR}")


if __name__ == "__main__":
    main()
