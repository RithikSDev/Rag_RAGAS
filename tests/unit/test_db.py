import sqlite3

from sqlalchemy import text

from app.db import build_engine, build_session_factory


def test_engine_connects_when_wal_mode_is_supported(tmp_path):
    engine = build_engine(f"sqlite:///{tmp_path / 'app.db'}")

    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar() == 1


def test_engine_falls_back_when_wal_mode_is_unavailable(tmp_path, monkeypatch):
    """Regression test: on some Docker bind-mount filesystems, `PRAGMA
    journal_mode=WAL` raises a raw sqlite3.OperationalError ("disk I/O
    error"), which must not crash application startup."""

    real_connect = sqlite3.connect

    class FailingWALCursor:
        def __init__(self, real_cursor):
            self._real_cursor = real_cursor

        def execute(self, sql, *args, **kwargs):
            if "journal_mode" in sql:
                raise sqlite3.OperationalError("disk I/O error")
            return self._real_cursor.execute(sql, *args, **kwargs)

        def close(self):
            self._real_cursor.close()

    def fake_connect(*args, **kwargs):
        conn = real_connect(*args, **kwargs)
        conn.cursor = lambda: FailingWALCursor(sqlite3.Connection.cursor(conn))
        return conn

    monkeypatch.setattr(sqlite3, "connect", fake_connect)

    engine = build_engine(f"sqlite:///{tmp_path / 'app.db'}")

    # Must not raise, despite WAL mode failing on connect.
    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar() == 1


def test_session_factory_produces_working_sessions(tmp_path):
    from app.db_models import PipelineConfigState
    from app.db import Base

    engine = build_engine(f"sqlite:///{tmp_path / 'app.db'}")
    Base.metadata.create_all(engine)
    session_factory = build_session_factory(engine)

    with session_factory() as db:
        db.add(PipelineConfigState(id=1))
        db.commit()

    with session_factory() as db:
        assert db.get(PipelineConfigState, 1) is not None
