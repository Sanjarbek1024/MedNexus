from pathlib import Path

from sqlmodel import Session, select

from app.db.models import AuditEvent
from app.db.store import CaseStore


def test_tampering_breaks_the_hash_chain(tmp_path: Path) -> None:
    store = CaseStore(tmp_path)
    for action in ("analysis_created", "report_generated", "review_confirm"):
        store.log(1, action, "system", {"note": action})
    assert store.verify().valid

    with Session(store.engine) as session:
        event = session.exec(select(AuditEvent).where(AuditEvent.id == 2)).one()
        event.details = {"note": "quietly edited"}
        session.add(event)
        session.commit()

    verification = store.verify()
    assert not verification.valid
    assert verification.first_invalid_event == 2
