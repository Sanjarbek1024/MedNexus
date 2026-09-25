"""Seed a demo workspace: three accounts and 16 analyzed studies spread over the last week.

Every study goes through the real pipeline (safety gates, image models and, when GROQ_API_KEY
is set in backend/.env, the AI report in Uzbek), so all findings and scores are actual model
outputs. Only timestamps are moved back so the dashboard shows a working week; audit events
keep their real times (the audit log is append-only).

    backend/.venv/Scripts/python scripts/seed_demo.py      (Windows)
    backend/.venv/bin/python scripts/seed_demo.py          (macOS / Linux)
    docker compose exec backend python scripts/seed_demo.py

It uses the same settings as the API (backend/.env, DATABASE_URL, DATA_DIR; relative paths are
resolved from backend/). If the demo accounts exist it changes nothing. ``--reset`` first
deletes a local SQLite database and its uploads; stop the API server before using it.
"""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLES_DIR = ROOT / "samples"
# A checkout has backend/ next to scripts/; in the backend container, scripts/ is mounted into the app.
BACKEND_DIR = ROOT / "backend" if (ROOT / "backend" / "app").is_dir() else ROOT
os.chdir(BACKEND_DIR)  # resolve relative DATA_DIR / DATABASE_URL paths like the API server
sys.path.insert(0, str(BACKEND_DIR))

from sqlmodel import Session, col, func, select  # noqa: E402

from app.analyzers.registry import AnalyzerRegistry  # noqa: E402
from app.api.analysis import resolve_patient  # noqa: E402
from app.config import Settings, get_settings  # noqa: E402
from app.db import audit  # noqa: E402
from app.db.models import (  # noqa: E402
    Analysis,
    Case,
    CaseStatus,
    Patient,
    Priority,
    Report,
    Review,
    Role,
    TrainingAttempt,
    User,
)
from app.db.session import get_engine, run_migrations  # noqa: E402
from app.imaging import decode_upload  # noqa: E402
from app.main import select_device  # noqa: E402
from app.schemas import ReportSections, ReviewAction, ReviewRequest, Selection, TrainingAttemptRequest  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.services import training, uploads  # noqa: E402
from app.services.analysis import AnalysisService  # noqa: E402
from app.services.assessment import PatientContext  # noqa: E402
from app.services.cases import assemble  # noqa: E402
from app.services.llm import LLM  # noqa: E402
from app.services.pipeline import AnalysisPipeline  # noqa: E402
from app.services.reporting import ReportWriter  # noqa: E402

PASSWORD = "MedNexus-Demo-2026"  # advertised on the sign-in page
NOW = datetime.now(timezone.utc)
ACQUISITION_LEAD = timedelta(minutes=25)  # image acquired this long before it was uploaded
ANALYSIS_TIME = timedelta(seconds=40)


@dataclass(frozen=True)
class Account:
    email: str
    full_name: str
    role: Role


ACCOUNTS = {
    "doctor": Account("doctor@mednexus.uz", "Dr. Dilnoza Karimova", Role.DOCTOR),
    "user": Account("user@mednexus.uz", "Aziz Karimov", Role.USER),
}


@dataclass(frozen=True)
class SignOff:
    """The doctor's review, ``after`` the upload."""

    action: ReviewAction
    after: timedelta
    impression: str
    notes: str = ""
    findings: str = ""  # with ``recommendations``: a full report instead of the AI-prefilled one
    recommendations: str = ""
    disagree: tuple[str, ...] = ()  # AI findings the doctor rejects
    added: tuple[str, ...] = ()  # findings the AI missed


@dataclass(frozen=True)
class Study:
    key: str
    sample: str
    ago: timedelta  # upload time
    region: str = "chest"
    view: str = "PA"
    modality: str = "xray"
    owner: str = "doctor"
    patient_of: str | None = None  # key of an earlier study of the same patient
    sign_off: SignOff | None = None
    draft: ReportSections | None = None  # the owner's unsigned report
    symptoms: str | None = None  # what the person reports with the image
    age: int | None = None
    sex: str | None = None
    optional: bool = False  # skipped when its sample image has not been downloaded


@dataclass(frozen=True)
class Attempt:
    """A doctor's blind read of a reviewed study in training mode."""

    study: str
    selected: tuple[str, ...]
    ago: timedelta
    marks: tuple[tuple[float, float], ...] = ()


DAY, HOUR, MINUTE = timedelta(days=1), timedelta(hours=1), timedelta(minutes=1)
CONFIRM, EDIT, REJECT = ReviewAction.CONFIRM, ReviewAction.EDIT, ReviewAction.REJECT

# Oldest first, so case ids follow upload order. Region and view match each image.
STUDIES = [
    Study("prior", "chest_pa_normal.jpg", 183 * DAY + 3 * HOUR, sign_off=SignOff(
        CONFIRM, 40 * MINUTE, "Ko‘krak qafasi a’zolarida o‘tkir patologik o‘zgarishlar aniqlanmadi.")),
    Study("greenstick", "wrist_greenstick_fracture.jpg", 6 * DAY + 2 * HOUR, region="extremity", view="AP",
          sign_off=SignOff(CONFIRM, 220 * MINUTE, "Bilak suyagi distal qismining to‘liqsiz (yashil novda tipidagi) sinishi.")),
    Study("buckle", "wrist_buckle_fracture.jpg", 5 * DAY + 4 * HOUR, region="extremity", sign_off=SignOff(
        CONFIRM, 70 * MINUTE, "Bilak suyagi distal metafizining bukilma (torus) sinishi.")),
    Study("cardiomegaly", "chest_nih_00000001_000.png", 4 * DAY + 6 * HOUR, sign_off=SignOff(
        CONFIRM, 170 * MINUTE, "Kardiomegaliya. O‘pka maydonlarida infiltrativ o‘zgarishlar aniqlanmadi.")),
    Study("knee", "knee_xray.jpg", 4 * DAY + 2 * HOUR),  # submitted as a chest study: rejected
    Study("hand", "hand_xray.jpg", 3 * DAY + 5 * HOUR, region="extremity", sign_off=SignOff(
        REJECT, 18 * MINUTE, "Qo‘l panjasi suyaklarida travmatik o‘zgarishlar aniqlanmadi.",
        notes="Sinish aniqlanmadi: AI normal anatomik tuzilmani sinish deb belgilagan.")),
    Study("heart_failure", "chest_pa_heart_failure.jpg", 3 * DAY + 2 * HOUR, sign_off=SignOff(
        EDIT, 95 * MINUTE, "Yurak yetishmovchiligi belgilari: interstitsial o‘pka shishi.",
        notes="Fibroz belgilari yo‘q; Kerley B chiziqlari o‘pka shishiga mos.",
        findings="Ikkala o‘pkaning pastki qismlarida Kerley B chiziqlari va interstitsial shish belgilari. "
        "Fibroz belgilari aniqlanmadi.",
        recommendations="Klinik ma’lumotlar bilan solishtirish, exokardiografiya.",
        disagree=("Fibrosis",), added=("Edema",))),
    Study("pneumonia", "chest_pa_pneumonia.jpg", 2 * DAY + 5 * HOUR, sign_off=SignOff(
        CONFIRM, 22 * MINUTE, "O‘ng yuqori bo‘lakda konsolidatsiya, pnevmoniyaga mos.")),
    Study("kitten", "photo_kitten.jpg", DAY + 6 * HOUR),  # a photograph: rejected by the quality gate
    Study("heart_failure_open", "chest_pa_heart_failure.jpg", DAY + 3 * HOUR),
    Study("second_normal", "chest_pa_normal_2.png", DAY + HOUR),
    Study("normal", "chest_pa_normal_2.png", 200 * MINUTE, sign_off=SignOff(
        CONFIRM, 35 * MINUTE, "Ko‘krak qafasi rentgenogrammasida patologik o‘zgarishlar aniqlanmadi.")),
    Study("dicom", "chest_pa_normal.dcm", 130 * MINUTE),
    Study("salter_harris", "wrist_salter_harris_fracture.jpg", 85 * MINUTE, region="extremity"),
    Study("follow_up", "chest_pa_pneumonia.jpg", 45 * MINUTE, patient_of="prior"),
    Study("draft", "chest_nih_00000001_000.png", 30 * MINUTE, draft=ReportSections(
        findings="Yurak soyasi kengaygan.",
        impression="Kardiomegaliyaga shubha. Radiolog tasdig‘i kerak.",
        recommendations="Oldingi tasvirlar bilan solishtirish.",
    )),
    # The person's own uploads, with the symptoms they reported (patient-facing answers).
    Study("user_checkup", "chest_pa_normal.jpg", 3 * DAY, owner="user", age=29, sex="female",
          symptoms="Ishga kirish uchun profilaktik flyuorografiya. Shikoyatim yo‘q."),
    Study("user_wrist", "wrist_buckle_fracture.jpg", 2 * DAY, region="extremity", owner="user", age=11, sex="male",
          symptoms="Velosipeddan yiqilib tushdi, bilagi shishgan va qimirlatganda og‘riyapti."),
    Study("user_brain", "brain_mri_glioma.jpg", 26 * HOUR, modality="mri", region="head", view="Axial",
          owner="user", age=52, sex="female", optional=True,
          symptoms="2 oydan beri bosh og‘rig‘i, ertalab kuchayadi, ba’zan ko‘ngil aynishi va ko‘rish xiralashishi."),
    Study("user_pneumonia", "chest_pa_pneumonia.jpg", 50 * MINUTE, owner="user", age=46, sex="male",
          symptoms="3 kundan beri yo‘tal, harorat 38,5, o‘ng tomonda nafas olganda ko‘krak og‘rig‘i."),
]

ATTEMPTS = [
    Attempt("heart_failure", ("Lung opacity", "Edema", "Cardiomegaly"), 2 * DAY + HOUR, ((0.3, 0.62), (0.7, 0.6))),
    Attempt("hand", (), DAY + 2 * HOUR),
    Attempt("pneumonia", ("Consolidation", "Pneumonia"), 300 * MINUTE, ((0.32, 0.38),)),
]


def reset(settings: Settings) -> None:
    """Delete the local SQLite database and stored uploads. Never touches PostgreSQL."""
    if not settings.sqlalchemy_url.startswith("sqlite"):
        sys.exit(
            "--reset only deletes a local SQLite database. To start over on PostgreSQL, drop and "
            "recreate the database yourself (with Docker Compose: docker compose down -v)."
        )
    database = settings.data_dir / "mednexus.db"
    try:
        for path in (database, Path(f"{database}-wal"), Path(f"{database}-shm")):
            if path.exists():
                print(f"Deleting {path}")
                path.unlink()
    except PermissionError:
        sys.exit(f"{database} is in use. Stop the API server and run again.")
    if settings.uploads_dir.exists():
        print(f"Deleting {settings.uploads_dir}")
        shutil.rmtree(settings.uploads_dir)


def build_service(settings: Settings) -> AnalysisService:
    """The services the API builds at startup (see app.main.lifespan)."""
    registry = AnalyzerRegistry.from_yaml(settings.registry_path)
    registry.load(select_device(settings.device))
    llm = LLM(settings.groq_api_key, settings.groq_model, settings.groq_timeout_s)
    vision = LLM(settings.groq_api_key, settings.groq_vision_model, settings.groq_vision_timeout_s, max_retries=3)
    return AnalysisService(AnalysisPipeline(registry), ReportWriter(llm), settings, vision)


def create_accounts(session: Session) -> dict[str, int]:
    users = {
        key: User(
            email=a.email, full_name=a.full_name, role=a.role, language="uz",
            password_hash=hash_password(PASSWORD), created_at=NOW - timedelta(days=400),
        )
        for key, a in ACCOUNTS.items()
    }
    session.add_all(users.values())
    session.commit()
    for user in users.values():
        audit.record(session, "user_created", "demo seed", {"user": user.email, "role": user.role}, user_id=user.id)
    return {key: user.id for key, user in users.items()}


def review_request(session: Session, case: Case, sign_off: SignOff) -> ReviewRequest:
    ai = {finding.name for finding in assemble(session, case, with_audit=False).findings}
    return ReviewRequest(
        action=sign_off.action,
        notes=sign_off.notes,
        final_impression=sign_off.impression,
        report=ReportSections(
            findings=sign_off.findings, impression=sign_off.impression, recommendations=sign_off.recommendations
        ) if sign_off.findings else None,
        finding_decisions={name: "disagree" for name in sign_off.disagree if name in ai},
        added_findings=list(sign_off.added),
    )


def backdate(session: Session, case: Case, created: datetime, reviewed: datetime | None) -> None:
    """Move a case's records to its simulated upload and review times (audit events excepted)."""
    analyzed = created + ANALYSIS_TIME
    case.created_at = created
    case.analyzed_at = analyzed if case.analyzed_at else None
    case.reviewed_at = reviewed
    for analysis in session.exec(select(Analysis).where(Analysis.case_id == case.id)):
        analysis.created_at = analyzed
    for report in session.exec(select(Report).where(Report.case_id == case.id)):
        if report.kind in ("ai", "assessment"):
            report.created_at = report.updated_at = analyzed
        elif reviewed:
            report.created_at = report.updated_at = report.signed_at = reviewed
    for review in session.exec(select(Review).where(Review.case_id == case.id)):
        review.created_at = reviewed
    session.add(case)
    session.commit()


def seed_studies(service: AnalysisService, user_ids: dict[str, int]) -> tuple[dict[str, int], dict[str, int]]:
    """Upload, analyze and (where planned) review every study. Returns case and patient ids by key."""
    engine = get_engine()
    case_ids: dict[str, int] = {}
    patient_ids: dict[str, int] = {}
    for number, study in enumerate(STUDIES, start=1):
        if not (SAMPLES_DIR / study.sample).exists():
            print(f"  [{number:2}/{len(STUDIES)}] {study.sample:34} skipped: sample not downloaded")
            continue
        created = NOW - study.ago
        upload = uploads.sanitize((SAMPLES_DIR / study.sample).read_bytes())
        image = decode_upload(upload.data, upload.sha256)
        with Session(engine) as session:
            owner = session.get(User, user_ids[study.owner])
            selection = Selection(modality=study.modality, region=study.region, view=study.view, language=owner.language)
            patient = resolve_patient(session, owner, upload, patient_ids.get(study.patient_of))
            context = PatientContext(study.symptoms, study.age, study.sex)
            case = service.create_case(
                session, owner, upload, image, selection, patient, created - ACQUISITION_LEAD, context
            )
            case_ids[study.key], patient_ids[study.key] = case.id, patient.id

        service.run(case_ids[study.key], lambda stage: None)

        with Session(engine) as session:
            case = session.get(Case, case_ids[study.key])
            reviewed = None
            if study.sign_off and case.status == CaseStatus.AI_READY:
                request = review_request(session, case, study.sign_off)
                service.review(session, case, request, session.get(User, user_ids["doctor"]))
                reviewed = created + study.sign_off.after
            if study.draft and case.status == CaseStatus.AI_READY:
                service.save_draft(session, case, study.draft, session.get(User, user_ids[study.owner]))
            backdate(session, case, created, reviewed)
            outcome = f"{case.status} ({case.priority})" if case.status == CaseStatus.AI_READY else case.status
            if study.sign_off and not reviewed:
                outcome += " - NOT reviewed: the planned review needs an analyzed image"
            elif reviewed:
                outcome += f", review: {study.sign_off.action}"
            print(f"  [{number:2}/{len(STUDIES)}] {study.sample:34} {study.region:9} -> {outcome}")
    return case_ids, patient_ids


def seed_training(user_id: int, case_ids: dict[str, int]) -> None:
    with Session(get_engine()) as session:
        doctor = session.get(User, user_id)
        for plan in ATTEMPTS:
            if session.get(Case, case_ids[plan.study]).status != CaseStatus.REVIEWED:
                print(f"  Skipped the training attempt on '{plan.study}': the case was not reviewed")
                continue
            request = TrainingAttemptRequest(
                selected=list(plan.selected), marks=[{"x": x, "y": y} for x, y in plan.marks]
            )
            reveal = training.attempt(session, doctor, case_ids[plan.study], request)
            session.get(TrainingAttempt, reveal.attempt_id).created_at = NOW - plan.ago
            session.commit()


def summarize(settings: Settings, service: AnalysisService, follow_up_patient: int) -> None:
    with Session(get_engine()) as session:
        statuses = dict(session.exec(select(Case.status, func.count()).group_by(Case.status)).all())
        urgent = session.exec(
            select(func.count()).select_from(Case)
            .where(Case.status == CaseStatus.AI_READY, Case.priority == Priority.URGENT)
        ).one()
        reports = session.exec(
            select(func.count()).select_from(Report).where(Report.kind == "ai", col(Report.error).is_(None))
        ).one()
        attempts = session.exec(select(func.count()).select_from(TrainingAttempt)).one()
        studies = session.exec(select(func.count()).select_from(Case).where(Case.patient_id == follow_up_patient)).one()
        pseudonym = session.get(Patient, follow_up_patient).pseudonym

    sqlite = settings.sqlalchemy_url.startswith("sqlite")
    print(f"\nDemo data ready in {settings.data_dir.resolve() / 'mednexus.db' if sqlite else 'PostgreSQL'}")
    print(
        f"  {sum(statuses.values())} cases: {statuses.get(CaseStatus.REVIEWED, 0)} reviewed, "
        f"{statuses.get(CaseStatus.AI_READY, 0)} awaiting review ({urgent} urgent), "
        f"{statuses.get(CaseStatus.IMAGE_REJECTED, 0)} rejected images, {statuses.get(CaseStatus.FAILED, 0)} failed"
    )
    if service.writer.llm.configured:
        print(f"  AI reports: {reports} written by {service.writer.model}")
    else:
        print("  AI reports: none (GROQ_API_KEY is not set); findings are shown without the narrative")
    print(f"  Prior comparison: patient {pseudonym} has {studies} chest studies about 6 months apart")
    print(f"  Training: {attempts} blind-read attempts")
    print(f"\nSign in with password {PASSWORD}:")
    for account in ACCOUNTS.values():
        print(f"  {account.email:26} {account.full_name:22} {account.role}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed MedNexus with demo accounts and analyzed studies.")
    parser.add_argument(
        "--reset", action="store_true",
        help="first delete the local SQLite database and uploads (stop the API server before)",
    )
    args = parser.parse_args()
    logging.getLogger("httpx").setLevel(logging.WARNING)  # one line per LLM request otherwise
    settings = get_settings()
    if args.reset:
        reset(settings)
    run_migrations()

    with Session(get_engine()) as session:
        emails = [a.email for a in ACCOUNTS.values()]
        if session.exec(select(User).where(col(User.email).in_(emails))).first():
            print("The demo data is already present (the demo accounts exist).")
            print("Use --reset to start over (local SQLite database only).")
            return
    missing = sorted({s.sample for s in STUDIES if not s.optional and not (SAMPLES_DIR / s.sample).exists()})
    if missing:
        sys.exit(f"Missing sample images ({', '.join(missing)}): run scripts/download_samples.py first.")

    print("Loading models...")
    service = build_service(settings)
    with Session(get_engine()) as session:
        user_ids = create_accounts(session)
    print(f"Analyzing {len(STUDIES)} studies (AI reports: {'on' if service.writer.llm.configured else 'off'})")
    case_ids, patient_ids = seed_studies(service, user_ids)
    seed_training(user_ids["doctor"], case_ids)
    summarize(settings, service, patient_ids["follow_up"])


if __name__ == "__main__":
    main()
