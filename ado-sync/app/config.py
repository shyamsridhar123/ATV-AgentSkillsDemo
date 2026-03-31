"""Unified configuration loader for ADO Sync.

Config precedence (highest → lowest):
  1. Explicit config_path (--config flag)
  2. PROJECT_ROOT env var → PROJECT_ROOT/.beth/ado-sync.json
  3. .env file in cwd (legacy)
  4. Environment variables (pydantic-settings default)
"""

import json
import os
from pathlib import Path
from typing import Optional

from dotenv import dotenv_values
from pydantic import Field
from pydantic_settings import BaseSettings

_CONFIG_FILENAME = ".beth/ado-sync.json"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Azure DevOps
    ado_organization: str = Field(..., description="ADO organization name")
    ado_project: str = Field(..., description="ADO project name")
    ado_pat: str = Field(default="", description="ADO Personal Access Token (fallback if Entra auth unavailable)")
    ado_tenant_id: str = Field(default="", description="Entra tenant ID for ADO org (enables bearer token auth)")
    ado_area_path: str = Field(default="", description="ADO area path")
    ado_iteration_path: str = Field(default="", description="ADO iteration path")

    # Azure OpenAI (optional -- when omitted, offline formatter is used)
    azure_openai_endpoint: str = Field(default="", description="Azure OpenAI endpoint URL")
    azure_openai_deployment: str = Field(default="gpt-4o", description="Deployment name")
    azure_openai_api_key: str = Field(default="", description="Azure OpenAI API key (leave empty for Entra auth)")
    azure_openai_api_version: str = Field(default="2024-10-21", description="API version")
    azure_openai_tenant_id: str = Field(default="", description="Entra tenant ID for AOAI resource (if different from default)")

    # GitHub
    github_webhook_secret: str = Field(default="", description="GitHub webhook secret")

    # Backlog
    backlog_tasks_dir: str = Field(default="./backlog/tasks", description="BacklogMD tasks directory")
    backlog_task_prefix: str = Field(default="BETH", description="Task ID prefix")

    # App
    log_level: str = Field(default="INFO", description="Logging level")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------


def resolve_config_path(config_path: Optional[str] = None) -> Optional[str]:
    """Resolve the config file path using the priority chain.

    1. Explicit config_path argument (from --config flag)
    2. PROJECT_ROOT env var → PROJECT_ROOT/.beth/ado-sync.json
    3. None (caller should fall back to .env)
    """
    if config_path:
        return config_path

    project_root = os.environ.get("PROJECT_ROOT")
    if project_root:
        return os.path.join(project_root, _CONFIG_FILENAME)

    return None


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------


def load_config(config_path: Optional[str] = None) -> dict:
    """Load ADO Sync configuration into a raw dict.

    Tries .beth/ado-sync.json first (via --config or PROJECT_ROOT).
    Falls back to .env in the current directory only when no JSON config exists.
    Fails fast when an explicit source is provided but missing.
    """
    resolved = resolve_config_path(config_path)

    if resolved and os.path.isfile(resolved):
        with open(resolved, "r") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError as e:
                raise json.JSONDecodeError(
                    f"Failed to parse JSON config file at {resolved}: {e.msg}",
                    e.doc,
                    e.pos,
                ) from e
        # Prevent accidental storage of secrets in .beth/ado-sync.json
        disallowed_keys = {"pat"}
        present_disallowed = disallowed_keys.intersection(data.keys())
        if present_disallowed:
            raise ValueError(
                "Disallowed secret-like keys found in .beth/ado-sync.json: "
                f"{', '.join(sorted(present_disallowed))}. "
                "Move these values to environment variables or a .env file instead."
            )
        return data

    # Explicit source provided but file missing → fail fast
    if config_path is not None or os.environ.get("PROJECT_ROOT"):
        raise FileNotFoundError(
            f"Config file not found: {resolved or config_path}. "
            f"Ensure .beth/ado-sync.json exists at the expected location."
        )

    # Fallback: .env file (legacy behavior)
    env_path = Path.cwd() / ".env"
    if env_path.is_file():
        env = dotenv_values(str(env_path))

        # Only include keys that are actually present so that process
        # environment variables (pydantic-settings default) can fill gaps.
        config: dict = {
            "authMethod": "pat",
            "tasksDir": env.get("BACKLOG_TASKS_DIR", "./backlog/tasks"),
            "logLevel": env.get("LOG_LEVEL", "INFO"),
        }

        organization = env.get("ADO_ORGANIZATION") or env.get("ADO_ORG")
        if organization:
            config["organization"] = organization

        project = env.get("ADO_PROJECT")
        if project:
            config["project"] = project

        pat = env.get("ADO_PAT")
        if pat:
            config["pat"] = pat

        tenant_id = env.get("ADO_TENANT_ID")
        if tenant_id:
            config["tenantId"] = tenant_id

        area_path = env.get("ADO_AREA_PATH")
        if area_path:
            config["areaPath"] = area_path

        iteration_path = env.get("ADO_ITERATION_PATH")
        if iteration_path:
            config["iterationPath"] = iteration_path

        return config

    raise FileNotFoundError(
        "No config found. Provide --config, set PROJECT_ROOT, or create a .env file."
    )


# ---------------------------------------------------------------------------
# Settings builder
# ---------------------------------------------------------------------------


def build_settings(config: dict) -> Settings:
    """Build a pydantic Settings object from a config dict.

    Only includes keys that are present in ``config`` so that
    pydantic-settings can still fill gaps from process environment variables.
    PAT is only set when explicitly present (from .env-derived config).
    """
    backlog_tasks_dir = (
        config.get("tasksDir")
        or config.get("backlogTasksDir")
        or "./backlog/tasks"
    )

    ai = config.get("aiFormatting", {})

    # Start with keys that always have safe defaults
    settings_kwargs: dict = {
        "backlog_tasks_dir": backlog_tasks_dir,
        "backlog_task_prefix": config.get("taskPrefix", "BETH"),
        "log_level": config.get("logLevel", "INFO"),
        "_env_file": None,
    }

    # Only include optional keys when present — let pydantic-settings
    # fill missing values from process environment variables.
    _optional_mappings = {
        "organization": "ado_organization",
        "project": "ado_project",
        "tenantId": "ado_tenant_id",
        "areaPath": "ado_area_path",
        "iterationPath": "ado_iteration_path",
        "pat": "ado_pat",
    }
    for config_key, settings_key in _optional_mappings.items():
        value = config.get(config_key)
        if value:
            settings_kwargs[settings_key] = value

    if ai.get("endpoint"):
        settings_kwargs["azure_openai_endpoint"] = ai["endpoint"]
    if ai.get("deployment"):
        settings_kwargs["azure_openai_deployment"] = ai["deployment"]

    return Settings(**settings_kwargs)


# ---------------------------------------------------------------------------
# Unified entry point
# ---------------------------------------------------------------------------


def load_settings(config_path: Optional[str] = None) -> Settings:
    """Load config and build Settings in one call.

    This is the preferred entry point. Combines resolve_config_path,
    load_config, and build_settings into a single function.
    """
    config = load_config(config_path)
    return build_settings(config)


def get_settings() -> Settings:
    """Load and validate settings from environment variables (legacy)."""
    return Settings()
