from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool


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
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


class Base(DeclarativeBase):
    pass


def build_session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
