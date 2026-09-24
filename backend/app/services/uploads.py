"""Upload validation, sanitization and storage.

File types are detected from magic bytes, never from the file name. DICOM files are anonymized
(patient-identifying attributes and private tags removed, UIDs replaced) and raster images are
re-encoded as PNG without metadata before anything is written to disk.
"""

from __future__ import annotations

import hashlib
import hmac
import io
import secrets
from dataclasses import dataclass
from pathlib import Path

import pydicom
from PIL import Image, ImageOps
from pydicom.dataset import Dataset
from pydicom.uid import generate_uid

from app.imaging import ImageDecodeError

# DICOM PS3.15 basic-profile attributes that identify the patient, staff or institution.
IDENTIFYING_KEYWORDS = frozenset({
    "PatientName", "PatientID", "IssuerOfPatientID", "OtherPatientIDs", "OtherPatientIDsSequence",
    "OtherPatientNames", "PatientBirthName", "PatientBirthDate", "PatientBirthTime",
    "PatientAddress", "PatientTelephoneNumbers", "PatientMotherBirthName", "PatientAge",
    "PatientSize", "PatientWeight", "MilitaryRank", "BranchOfService", "EthnicGroup",
    "Occupation", "PatientComments", "AdditionalPatientHistory", "PatientReligiousPreference",
    "MedicalRecordLocator", "InsurancePlanIdentification", "CountryOfResidence",
    "RegionOfResidence", "InstitutionName", "InstitutionAddress", "InstitutionalDepartmentName",
    "InstitutionCodeSequence", "ReferringPhysicianName", "ReferringPhysicianAddress",
    "ReferringPhysicianTelephoneNumbers", "PerformingPhysicianName", "OperatorsName",
    "PhysiciansOfRecord", "NameOfPhysiciansReadingStudy", "RequestingPhysician",
    "ScheduledPerformingPhysicianName", "AccessionNumber", "StudyID", "StationName",
    "DeviceSerialNumber", "StudyDate", "SeriesDate", "AcquisitionDate", "ContentDate",
    "StudyTime", "SeriesTime", "AcquisitionTime", "ContentTime", "AcquisitionDateTime",
    "RequestAttributesSequence", "StudyDescription", "SeriesDescription", "ImageComments",
    "PerformedProcedureStepID", "ScheduledProcedureStepID", "RequestedProcedureID",
    "FillerOrderNumberImagingServiceRequest", "PlacerOrderNumberImagingServiceRequest",
})
REPLACED_UIDS = ("StudyInstanceUID", "SeriesInstanceUID", "SOPInstanceUID", "FrameOfReferenceUID")


class UnsupportedUploadError(ValueError):
    """The upload is not a DICOM, PNG or JPEG file."""


@dataclass(frozen=True)
class SanitizedUpload:
    data: bytes  # anonymized DICOM or metadata-free PNG
    stored_format: str  # "dicom" | "png"
    original_format: str  # "dicom" | "png" | "jpeg"
    sha256: str  # of the original upload, for the audit log
    source_patient_id: str | None  # DICOM PatientID; used only to derive a pseudonym, never stored


def detect_format(data: bytes) -> str | None:
    if data[128:132] == b"DICM":
        return "dicom"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    return None


def sanitize(data: bytes) -> SanitizedUpload:
    kind = detect_format(data)
    if kind is None:
        raise UnsupportedUploadError("Unsupported file. Upload a DICOM (.dcm), PNG or JPEG image.")
    digest = hashlib.sha256(data).hexdigest()
    if kind == "dicom":
        dataset = _read_dicom(data)
        patient_id = str(dataset.get("PatientID", "") or "").strip() or None
        anonymize(dataset)
        buffer = io.BytesIO()
        dataset.save_as(buffer, enforce_file_format=True)
        return SanitizedUpload(buffer.getvalue(), "dicom", "dicom", digest, patient_id)
    return SanitizedUpload(_strip_raster(data), "png", kind, digest, None)


def _read_dicom(data: bytes) -> Dataset:
    try:
        return pydicom.dcmread(io.BytesIO(data))
    except Exception as exc:
        raise ImageDecodeError("Could not read the DICOM file.") from exc


def anonymize(dataset: Dataset) -> None:
    """Remove identifying attributes (also inside sequences) and private tags, in place."""

    def scrub(ds: Dataset, element: pydicom.DataElement) -> None:
        if element.keyword in IDENTIFYING_KEYWORDS:
            del ds[element.tag]

    dataset.remove_private_tags()
    dataset.walk(scrub)
    for keyword in REPLACED_UIDS:
        if keyword in dataset:
            setattr(dataset, keyword, generate_uid())
    if "SOPInstanceUID" in dataset and hasattr(dataset, "file_meta"):
        dataset.file_meta.MediaStorageSOPInstanceUID = dataset.SOPInstanceUID
    dataset.PatientIdentityRemoved = "YES"
    dataset.DeidentificationMethod = "MedNexus: PS3.15 basic profile subset, private tags removed"


def _strip_raster(data: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(data)) as opened:
            image = ImageOps.exif_transpose(opened)
            if image.mode in {"P", "CMYK", "RGBA", "LA", "1"}:
                image = image.convert("L" if image.mode in {"LA", "1"} else "RGB")
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")  # only pixels are written: EXIF and text chunks are dropped
    except Exception as exc:
        raise ImageDecodeError("Could not decode the image file.") from exc
    return buffer.getvalue()


def pseudonym_source_hash(key: str, owner_id: int, patient_id: str) -> str:
    return hmac.new(key.encode(), f"{owner_id}:{patient_id}".encode(), hashlib.sha256).hexdigest()


def random_pseudonym() -> str:
    return f"PX-{secrets.token_hex(4).upper()}"


def store(uploads_dir: Path, upload: SanitizedUpload) -> str:
    uploads_dir.mkdir(parents=True, exist_ok=True)
    name = f"{secrets.token_hex(16)}.{'dcm' if upload.stored_format == 'dicom' else 'png'}"
    (uploads_dir / name).write_bytes(upload.data)
    return name
