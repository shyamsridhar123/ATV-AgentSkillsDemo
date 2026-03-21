"""Environment configuration with validation."""

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Azure DevOps
    ado_organization: str = Field(..., description="ADO organization name")
    ado_project: str = Field(..., description="ADO project name")
    ado_pat: str = Field(..., description="ADO Personal Access Token")
    ado_area_path: str = Field(default="", description="ADO area path")
    ado_iteration_path: str = Field(default="", description="ADO iteration path")

    # Azure OpenAI (optional -- when omitted, offline formatter is used)
    azure_openai_endpoint: str = Field(default="", description="Azure OpenAI endpoint URL")
    azure_openai_deployment: str = Field(default="gpt-4o", description="Deployment name")
    azure_openai_api_key: str = Field(default="", description="Azure OpenAI API key")
    azure_openai_api_version: str = Field(default="2024-10-21", description="API version")

    # GitHub
    github_webhook_secret: str = Field(default="", description="GitHub webhook secret")

    # Backlog
    backlog_tasks_dir: str = Field(default="./backlog/tasks", description="BacklogMD tasks directory")
    backlog_task_prefix: str = Field(default="BETH", description="Task ID prefix")

    # App
    log_level: str = Field(default="INFO", description="Logging level")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


def get_settings() -> Settings:
    """Load and validate settings from environment."""
    return Settings()
