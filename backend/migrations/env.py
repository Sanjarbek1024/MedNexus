from alembic import context
from sqlmodel import SQLModel

from app.db import models  # noqa: F401  (registers the tables)
from app.db.session import get_engine

target_metadata = SQLModel.metadata


def run() -> None:
    connection = context.config.attributes.get("connection")
    if connection is None:  # invoked from the alembic CLI
        with get_engine().begin() as connection:
            _migrate(connection)
    else:
        _migrate(connection)


def _migrate(connection) -> None:  # noqa: ANN001
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=connection.dialect.name == "sqlite",
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


run()
