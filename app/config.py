from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "Band Manager"
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Leave blank for default SQLite inside /data/app.db
    DATABASE_URL: str | None = None
    DATA_DIR: str = "/data"

    # Optional environment-level defaults (can also be set in InstanceSettings UI)
    ALLOW_PUBLIC_SIGNUP: bool = False
    GOOGLE_PLACES_API_KEY: str | None = None
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASS: str | None = None
    SMTP_FROM: str | None = None

    @property
    def resolved_database_url(self) -> str:
        if self.DATABASE_URL and self.DATABASE_URL.strip():
            url = self.DATABASE_URL.strip()
            # Normalize postgres:// to postgresql+psycopg:// for SQLAlchemy 2.0
            if url.startswith("postgres://"):
                return url.replace("postgres://", "postgresql+psycopg://", 1)
            if url.startswith("postgresql://"):
                return url.replace("postgresql://", "postgresql+psycopg://", 1)
            return url
        return f"sqlite:///{self.DATA_DIR}/app.db"


settings = Settings()