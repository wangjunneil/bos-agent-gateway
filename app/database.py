import logging
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.settings import settings

logger = logging.getLogger(__name__)

engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    api_key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rate_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    access_entries: Mapped[list["UserAgentAccess"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="[UserAgentAccess.user_id]",
    )


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    base_url: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    agent_card: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="unknown")
    status_message: Mapped[str | None] = mapped_column(String, nullable=True)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    access_entries: Mapped[list["UserAgentAccess"]] = relationship(
        back_populates="agent", cascade="all, delete-orphan"
    )
    tags: Mapped[list["AgentTag"]] = relationship(
        cascade="all, delete-orphan"
    )


class AgentTag(Base):
    __tablename__ = "agent_tags"
    __table_args__ = (UniqueConstraint("agent_id", "tag"),)

    agent_id: Mapped[str] = mapped_column(
        String, ForeignKey("agents.id", ondelete="CASCADE"), primary_key=True
    )
    tag: Mapped[str] = mapped_column(String, primary_key=True)


class UserAgentAccess(Base):
    __tablename__ = "user_agent_access"
    __table_args__ = (UniqueConstraint("user_id", "agent_id"),)

    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    agent_id: Mapped[str] = mapped_column(
        String, ForeignKey("agents.id", ondelete="CASCADE"), primary_key=True
    )
    granted_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    granted_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)

    user: Mapped["User"] = relationship(back_populates="access_entries", foreign_keys=[user_id])
    agent: Mapped["Agent"] = relationship(back_populates="access_entries")


class Invocation(Base):
    __tablename__ = "invocations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    agent_id: Mapped[str] = mapped_column(String, ForeignKey("agents.id"), nullable=False)
    method: Mapped[str] = mapped_column(String, nullable=False)
    path: Mapped[str] = mapped_column(String, nullable=False)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


async def get_db():
    async with async_session() as session:
        yield session


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        result = await session.execute(select(User).where(User.role == "admin"))
        existing_admin = result.scalar_one_or_none()

        if existing_admin is None:
            now = datetime.now(UTC)
            admin = User(
                id=str(uuid4()),
                username=settings.ADMIN_USERNAME,
                api_key=settings.ADMIN_API_KEY,
                role="admin",
                is_active=True,
                created_at=now,
                updated_at=now,
            )
            session.add(admin)
            await session.commit()
            logger.info("Admin user created: %s", settings.ADMIN_USERNAME)
        else:
            logger.info("Admin user already exists, skipping seed.")
