from pydantic_settings import BaseSettings
from pydantic import computed_field


class Settings(BaseSettings):
    app_name: str = "Digital Phone Book API"
    debug: bool = True

    phonebook_db: str = ""
    phonebook_db_user: str = ""
    phonebook_db_password: str = ""
    phonebook_db_host: str = "db"
    phonebook_db_port: int = 5432

    llm_url: str = "http://llm:11434"
    llm_provider: str = "ollama"
    llm_model: str = "qwen2.5:3b"

    @computed_field
    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.phonebook_db_user}:{self.phonebook_db_password}"
            f"@{self.phonebook_db_host}:{self.phonebook_db_port}/{self.phonebook_db}"
        )

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
