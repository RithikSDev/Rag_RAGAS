from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db_models import User
from app.security.passwords import hash_password, verify_password


class UserService:
    def __init__(self, db: Session):
        self.db = db

    def get(self, user_id: str) -> User | None:
        return self.db.get(User, user_id)

    def get_by_username(self, username: str) -> User | None:
        return self.db.query(User).filter(User.username == username).one_or_none()

    def username_exists(self, username: str) -> bool:
        return self.get_by_username(username) is not None

    def list_all(self) -> list[User]:
        return self.db.query(User).order_by(User.created_at.asc()).all()

    def authenticate(self, username: str, password: str) -> User | None:
        user = self.get_by_username(username)

        if user is None or not user.is_active or not verify_password(password, user.password_hash):
            return None

        user.last_login_at = datetime.now(timezone.utc)
        self.db.commit()

        return user

    def create(self, username: str, password: str, role: str, created_by: str) -> User:
        user = User(
            username=username,
            password_hash=hash_password(password),
            role=role,
            created_by=created_by,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def count_active_admins(self) -> int:
        return self.db.query(User).filter(User.role == "admin", User.is_active.is_(True)).count()

    def update(
        self,
        user_id: str,
        *,
        role: str | None = None,
        is_active: bool | None = None,
        password: str | None = None,
    ) -> User | None:
        user = self.get(user_id)

        if user is None:
            return None

        removes_admin_access = user.role == "admin" and (
            (role is not None and role != "admin") or is_active is False
        )

        if removes_admin_access and self.count_active_admins() <= 1:
            raise ValueError("cannot remove the last active admin")

        if role is not None:
            user.role = role
        if is_active is not None:
            user.is_active = is_active
        if password is not None:
            user.password_hash = hash_password(password)

        self.db.commit()
        self.db.refresh(user)

        return user

    def delete(self, user_id: str) -> bool:
        user = self.get(user_id)

        if user is None:
            return False

        if user.role == "admin" and self.count_active_admins() <= 1:
            raise ValueError("cannot delete the last active admin")

        self.db.delete(user)
        self.db.commit()

        return True
