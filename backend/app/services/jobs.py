"""Background analysis queue for batch uploads."""

from __future__ import annotations

import logging
import queue
import threading

from sqlmodel import Session, col, select

from app.db.models import Case, CaseStatus
from app.db.session import get_engine
from app.services.analysis import AnalysisService

logger = logging.getLogger(__name__)


class AnalysisQueue:
    """One worker thread: the models saturate the CPU, so analyses run one at a time anyway."""

    def __init__(self, service: AnalysisService) -> None:
        self.service = service
        self._queue: queue.Queue[int | None] = queue.Queue()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        # Resume work interrupted by a restart.
        with Session(get_engine()) as session:
            pending = session.exec(
                select(Case.id)
                .where(col(Case.status).in_([CaseStatus.QUEUED, CaseStatus.ANALYZING]))
                .order_by(Case.id)
            ).all()
        for case_id in pending:
            self._queue.put(case_id)
        self._thread = threading.Thread(target=self._work, name="analysis-queue", daemon=True)
        self._thread.start()

    def submit(self, case_id: int) -> None:
        self._queue.put(case_id)

    def stop(self) -> None:
        if self._thread is not None:
            self._queue.put(None)
            self._thread.join(timeout=30)

    def _work(self) -> None:
        while (case_id := self._queue.get()) is not None:
            with Session(get_engine()) as session:
                case = session.get(Case, case_id)
                if case is None or case.status not in (CaseStatus.QUEUED, CaseStatus.ANALYZING):
                    continue
            self.service.run(case_id, lambda stage: None)
