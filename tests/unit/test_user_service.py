import pytest

from app.db import Base, build_engine, build_session_factory
from app.services.user_service import UserService


@pytest.fixture
def db_session(tmp_path):
    engine = build_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(engine)
    session_factory = build_session_factory(engine)

    with session_factory() as db:
        yield db


def test_create_and_get_by_username(db_session):
    service = UserService(db_session)
    created = service.create("alice", "password123", role="viewer", created_by="system")

    fetched = service.get_by_username("alice")

    assert fetched.id == created.id
    assert fetched.role == "viewer"
    assert fetched.is_active is True


def test_username_exists(db_session):
    service = UserService(db_session)
    assert not service.username_exists("alice")

    service.create("alice", "password123", role="viewer", created_by="system")
    assert service.username_exists("alice")


def test_authenticate_succeeds_with_correct_password(db_session):
    service = UserService(db_session)
    service.create("alice", "password123", role="viewer", created_by="system")

    user = service.authenticate("alice", "password123")

    assert user is not None
    assert user.last_login_at is not None


def test_authenticate_fails_with_wrong_password(db_session):
    service = UserService(db_session)
    service.create("alice", "password123", role="viewer", created_by="system")

    assert service.authenticate("alice", "wrong-password") is None


def test_authenticate_fails_for_unknown_user(db_session):
    service = UserService(db_session)
    assert service.authenticate("nobody", "password123") is None


def test_authenticate_fails_for_deactivated_user(db_session):
    service = UserService(db_session)
    user = service.create("alice", "password123", role="viewer", created_by="system")
    service.update(user.id, is_active=False)

    assert service.authenticate("alice", "password123") is None


def test_update_changes_role_and_password(db_session):
    service = UserService(db_session)
    service.create("root", "password123", role="admin", created_by="system")
    user = service.create("alice", "password123", role="viewer", created_by="root")

    updated = service.update(user.id, role="admin", password="new-password123")

    assert updated.role == "admin"
    assert service.authenticate("alice", "new-password123") is not None
    assert service.authenticate("alice", "password123") is None


def test_update_unknown_user_returns_none(db_session):
    service = UserService(db_session)
    assert service.update("does-not-exist", role="admin") is None


def test_delete_removes_user(db_session):
    service = UserService(db_session)
    service.create("root", "password123", role="admin", created_by="system")
    user = service.create("alice", "password123", role="viewer", created_by="root")

    assert service.delete(user.id) is True
    assert service.get(user.id) is None


def test_delete_unknown_user_returns_false(db_session):
    service = UserService(db_session)
    assert service.delete("does-not-exist") is False


def test_cannot_delete_the_last_active_admin(db_session):
    service = UserService(db_session)
    admin = service.create("root", "password123", role="admin", created_by="system")

    with pytest.raises(ValueError, match="last active admin"):
        service.delete(admin.id)

    assert service.get(admin.id) is not None  # untouched


def test_cannot_demote_the_last_active_admin(db_session):
    service = UserService(db_session)
    admin = service.create("root", "password123", role="admin", created_by="system")

    with pytest.raises(ValueError, match="last active admin"):
        service.update(admin.id, role="viewer")


def test_cannot_deactivate_the_last_active_admin(db_session):
    service = UserService(db_session)
    admin = service.create("root", "password123", role="admin", created_by="system")

    with pytest.raises(ValueError, match="last active admin"):
        service.update(admin.id, is_active=False)


def test_can_demote_an_admin_when_another_admin_exists(db_session):
    service = UserService(db_session)
    service.create("root", "password123", role="admin", created_by="system")
    second_admin = service.create("root2", "password123", role="admin", created_by="root")

    updated = service.update(second_admin.id, role="viewer")

    assert updated.role == "viewer"


def test_list_all_orders_by_created_at(db_session):
    service = UserService(db_session)
    service.create("root", "password123", role="admin", created_by="system")
    service.create("alice", "password123", role="viewer", created_by="root")

    usernames = [u.username for u in service.list_all()]

    assert usernames == ["root", "alice"]
