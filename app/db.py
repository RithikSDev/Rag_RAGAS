import logging
import sqlite3
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

logger = logging.getLogger("app.db")


def build_engine(database_url: str):
    is_sqlite = database_url.startswith("sqlite")
    is_memory = database_url in ("sqlite:///:memory:", "sqlite://")

    if database_url.startswith("sqlite:///./"):
        db_path = Path(database_url.removeprefix("sqlite:///./"))
        db_path.parent.mkdir(parents=True, exist_ok=True)

    engine_kwargs = {}

    if is_sqlite:
        engine_kwargs["connect_args"] = {"check_same_thread": False}

    if is_memory:
        # A plain :memory: sqlite db is per-connection - without StaticPool, each
        # thread FastAPI dispatches a sync route on would see its own empty DB.
        engine_kwargs["poolclass"] = StaticPool

    engine = create_engine(database_url, **engine_kwargs)

    if is_sqlite and not is_memory:
        @event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, _):
            cursor = dbapi_connection.cursor()

            try:
                # WAL needs shared-memory-mapping support from the filesystem,
                # which several Docker bind-mount backends (observed: Docker
                # Desktop on Windows) don't provide - fails as a plain "disk
                # I/O error" with no other symptom. Best-effort: fall back to
                # the default journal mode rather than crash the app over it.
                # Note: this executes against the raw DBAPI cursor (an
                # sqlalchemy "connect" event, not a wrapped Connection), so
                # the exception raised here is the native sqlite3 error, not
                # sqlalchemy.exc.OperationalError.
                cursor.execute("PRAGMA journal_mode=WAL")
            except sqlite3.OperationalError:
                logger.warning(
                    "sqlite WAL mode unavailable on this filesystem, "
                    "falling back to the default journal mode"
                )

            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


class Base(DeclarativeBase):
    pass


def build_session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


# SQLite-only shim: Base.metadata.create_all() only creates *missing* tables,
# it never alters an existing one. When a model gains new columns, an already
# -running deployment's table doesn't get them, and the app breaks against its
# own DB. This is a small, targeted patch - not a real migration framework;
# revisit with Alembic if the schema keeps growing at this rate.
_NEW_COLUMNS_BY_TABLE = {
    "evaluation_runs": {
        "status": "TEXT DEFAULT 'completed'",  # backfill: pre-existing rows really are completed
        "total_questions": "INTEGER DEFAULT 0",
        "completed_questions": "INTEGER DEFAULT 0",
        "current_question": "TEXT",
        "label": "TEXT",
        "notes": "TEXT",
        "error_message": "TEXT",
    },
    "query_log": {
        "retrieval_ms": "REAL",
        "generation_ms": "REAL",
    },
}


def ensure_columns(engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    with engine.connect() as conn:
        for table, new_columns in _NEW_COLUMNS_BY_TABLE.items():
            existing = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}

            if not existing:
                continue  # table doesn't exist yet - create_all() will make it correctly

            for column, ddl_type in new_columns.items():
                if column not in existing:
                    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}")

        conn.commit()
