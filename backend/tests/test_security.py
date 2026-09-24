import io
from collections.abc import Callable
from pathlib import Path

import pydicom
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlmodel import Session

from app.db import audit
from app.db.session import get_engine
from app.imaging import decode_upload
from app.main import app
from app.services import uploads
from tests.conftest import upload


def identified_dicom(sample: Callable[[str], Path]) -> bytes:
    dataset = pydicom.dcmread(sample("chest_pa_normal.dcm"))
    dataset.PatientName = "Karimov^Aziz"
    dataset.PatientID = "MRN-0042"
    dataset.PatientBirthDate = "19800101"
    dataset.InstitutionName = "Central Clinic"
    dataset.ReferringPhysicianName = "Doe^Jane"
    dataset.StudyDate = "20260901"
    dataset.AccessionNumber = "ACC-9"
    dataset.add_new(0x00091001, "LO", "private vendor data")
    buffer = io.BytesIO()
    dataset.save_as(buffer, enforce_file_format=True)
    return buffer.getvalue()


def test_dicom_is_anonymized_before_storage(sample: Callable[[str], Path]) -> None:
    original = identified_dicom(sample)
    clean = uploads.sanitize(original)
    stored = pydicom.dcmread(io.BytesIO(clean.data))

    for keyword in ("PatientName", "PatientID", "PatientBirthDate", "InstitutionName",
                    "ReferringPhysicianName", "StudyDate", "AccessionNumber"):
        assert keyword not in stored, keyword
    assert not any(element.tag.is_private for element in stored)
    assert stored.PatientIdentityRemoved == "YES"
    assert stored.SOPInstanceUID != pydicom.dcmread(io.BytesIO(original)).SOPInstanceUID
    assert b"Karimov" not in clean.data and b"MRN-0042" not in clean.data
    # Acquisition attributes needed for the safety checks survive.
    assert stored.Modality == "DX" and stored.ViewPosition == "PA"
    assert clean.source_patient_id == "MRN-0042"
    assert decode_upload(clean.data).dicom.view_position == "PA"


def test_same_dicom_patient_links_to_one_pseudonym(client: TestClient, sample: Callable[[str], Path]) -> None:
    data = identified_dicom(sample)
    ids = []
    for _ in range(2):
        response = client.post(
            "/api/cases/batch",
            files=[("files", ("study.dcm", data, "application/dicom"))],
            data={"modality": "xray", "region": "chest", "view": "PA", "language": "en"},
        )
        ids.append(response.json()["queued"][0]["patient"])
    assert ids[0] == ids[1]
    assert "MRN" not in ids[0]["pseudonym"] and ids[0]["pseudonym"].startswith("PX-")


def test_raster_metadata_is_stripped() -> None:
    image = Image.new("L", (300, 300), 128)
    exif = Image.Exif()
    exif[0x010E] = "Patient: Karimov Aziz"  # ImageDescription
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif)
    clean = uploads.sanitize(buffer.getvalue())
    assert clean.stored_format == "png" and clean.original_format == "jpeg"
    assert b"Karimov" not in clean.data


@pytest.mark.parametrize(
    "data",
    [b"%PDF-1.7 fake", b"MZ\x90\x00 executable", b"GIF89a....", b"<svg xmlns='http://www.w3.org/2000/svg'/>"],
)
def test_file_type_is_checked_by_magic_bytes(client: TestClient, data: bytes) -> None:
    response = client.post(
        "/api/analyze",
        files={"file": ("innocent.png", data, "image/png")},  # extension and type lie
        data={"modality": "xray", "region": "chest", "view": "PA"},
    )
    assert response.status_code == 415


def test_oversized_upload_is_refused(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "max_upload_mb", 0)
    response = client.post(
        "/api/analyze",
        files={"file": ("big.png", b"\x89PNG\r\n\x1a\n" + b"0" * 2048, "image/png")},
        data={"modality": "xray", "region": "chest", "view": "PA"},
    )
    assert response.status_code == 413


def test_security_headers(app_client: TestClient) -> None:
    headers = TestClient(app).get("/api/health").headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert "default-src 'none'" in headers["content-security-policy"]
    assert headers["referrer-policy"] == "no-referrer"


def test_cors_allows_only_configured_origins(app_client: TestClient) -> None:
    anonymous = TestClient(app)
    allowed = anonymous.get("/api/health", headers={"Origin": "http://localhost:5173"})
    denied = anonymous.get("/api/health", headers={"Origin": "https://evil.example"})
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in denied.headers


def test_audit_log_is_append_only_and_tamper_evident(client: TestClient, sample: Callable[[str], Path]) -> None:
    upload(client, sample("chest_pa_normal.jpg"))
    with Session(get_engine()) as session:
        event_id = session.exec(text("SELECT max(id) FROM audit_events")).one()[0]
        with pytest.raises(DBAPIError):
            session.exec(text(f"UPDATE audit_events SET actor = 'mallory' WHERE id = {event_id}"))
        session.rollback()
        with pytest.raises(DBAPIError):
            session.exec(text(f"DELETE FROM audit_events WHERE id = {event_id}"))
        session.rollback()
        assert audit.verify(session)[0]
