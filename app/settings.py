from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False
    DATABASE_URL: str = "sqlite+aiosqlite:///./gateway.db"
    HEALTH_POLL_INTERVAL_SECONDS: int = 60
    HEALTH_POLL_TIMEOUT_SECONDS: int = 5
    HEALTH_POLL_ENABLED: bool = True
    AGENT_CARD_FETCH_TIMEOUT_SECONDS: int = 10
    PROXY_REQUEST_TIMEOUT_SECONDS: int = 120
    PROXY_SSE_TIMEOUT_SECONDS: int = 300
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT_RPM: int = 60
    RATE_LIMIT_ADMIN_RPM: int = 0
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    ADMIN_API_KEY: str
    ADMIN_USERNAME: str = "admin"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
