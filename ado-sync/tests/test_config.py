"""Tests for config.py — unified config loader with .beth/ado-sync.json discovery.

TDD: Tests written BEFORE moving implementation from watcher_main.py to config.py.
Covers BETH-64.4: Python config loader — .beth/ado-sync.json discovery.

Config precedence (highest → lowest):
  1. Explicit config_path (--config flag)
  2. PROJECT_ROOT env var → PROJECT_ROOT/.beth/ado-sync.json
  3. .env file in cwd (legacy)
  4. Environment variables (pydantic-settings default)
"""

import json
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_config(tmp_path: Path, **overrides) -> Path:
    """Create a .beth/ado-sync.json config file matching the CLI schema."""
    beth_dir = tmp_path / ".beth"
    beth_dir.mkdir(exist_ok=True)
    config_path = beth_dir / "ado-sync.json"
    config = {
        "organization": "test-org",
        "project": "test-project",
        "authMethod": "pat",
        "tenantId": "",
        "areaPath": "",
        "iterationPath": "",
        "taskPrefix": "BETH",
        "tasksDir": str(tmp_path / "backlog" / "tasks"),
        "aiFormatting": {"enabled": True, "endpoint": "", "deployment": "gpt-4o"},
        **overrides,
    }
    config_path.write_text(json.dumps(config))
    return config_path


def _make_dotenv(tmp_path: Path, **overrides) -> Path:
    """Create a .env file in tmp_path and return its path."""
    env_vars = {
        "ADO_ORG": "env-org",
        "ADO_PROJECT": "env-project",
        "ADO_PAT": "env-pat-token",
        **overrides,
    }
    env_path = tmp_path / ".env"
    lines = [f"{k}={v}" for k, v in env_vars.items()]
    env_path.write_text("\n".join(lines) + "\n")
    return env_path


# ===========================================================================
# 1. resolve_config_path — path resolution logic
# ===========================================================================


class TestResolveConfigPath:
    """resolve_config_path picks the right config file path."""

    def test_explicit_path_wins(self):
        """Explicit config_path is returned as-is."""
        from app.config import resolve_config_path

        result = resolve_config_path(config_path="/some/explicit/path.json")
        assert result == "/some/explicit/path.json"

    def test_project_root_env(self, tmp_path, monkeypatch):
        """Falls back to PROJECT_ROOT/.beth/ado-sync.json."""
        from app.config import resolve_config_path

        monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
        result = resolve_config_path()
        assert result == str(tmp_path / ".beth" / "ado-sync.json")

    def test_explicit_beats_project_root(self, tmp_path, monkeypatch):
        """Explicit config_path takes priority over PROJECT_ROOT."""
        from app.config import resolve_config_path

        monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
        result = resolve_config_path(config_path="/explicit/config.json")
        assert result == "/explicit/config.json"

    def test_returns_none_when_nothing_set(self, monkeypatch):
        """Returns None when no explicit path and no PROJECT_ROOT."""
        from app.config import resolve_config_path

        monkeypatch.delenv("PROJECT_ROOT", raising=False)
        result = resolve_config_path()
        assert result is None


# ===========================================================================
# 2. load_config — reads JSON or .env into a raw dict
# ===========================================================================


class TestLoadConfigFromJson:
    """load_config reads .beth/ado-sync.json when available."""

    def test_reads_explicit_json(self, tmp_path):
        """Loads config from an explicit JSON path."""
        from app.config import load_config

        config_path = _make_config(tmp_path, organization="explicit-org")
        config = load_config(config_path=str(config_path))
        assert config["organization"] == "explicit-org"

    def test_parses_all_json_fields(self, tmp_path):
        """Parses all expected JSON keys."""
        from app.config import load_config

        config_path = _make_config(
            tmp_path,
            organization="my-org",
            project="my-proj",
            authMethod="entra",
            areaPath="Area\\Sub",
            iterationPath="Sprint 1",
        )
        config = load_config(config_path=str(config_path))
        assert config["organization"] == "my-org"
        assert config["project"] == "my-proj"
        assert config["authMethod"] == "entra"
        assert config["areaPath"] == "Area\\Sub"
        assert config["iterationPath"] == "Sprint 1"

    def test_discovers_via_project_root(self, tmp_path, monkeypatch):
        """Discovers config via PROJECT_ROOT env var."""
        from app.config import load_config

        _make_config(tmp_path, organization="root-org")
        monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
        config = load_config()
        assert config["organization"] == "root-org"


class TestLoadConfigFailFast:
    """load_config fails fast when explicit sources are missing."""

    def test_explicit_path_missing_raises(self, tmp_path):
        """Explicit --config with missing file raises FileNotFoundError."""
        from app.config import load_config

        missing = str(tmp_path / ".beth" / "nonexistent.json")
        with pytest.raises(FileNotFoundError, match="Config file not found"):
            load_config(config_path=missing)

    def test_project_root_missing_file_raises(self, tmp_path, monkeypatch):
        """PROJECT_ROOT set but no config file raises FileNotFoundError."""
        from app.config import load_config

        monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
        with pytest.raises(FileNotFoundError, match="Config file not found"):
            load_config()

    def test_invalid_json_raises(self, tmp_path):
        """Malformed JSON raises JSONDecodeError."""
        from app.config import load_config

        beth_dir = tmp_path / ".beth"
        beth_dir.mkdir()
        bad_config = beth_dir / "ado-sync.json"
        bad_config.write_text("{bad json!!")

        with pytest.raises(json.JSONDecodeError):
            load_config(config_path=str(bad_config))

    def test_no_config_no_env_raises(self, tmp_path, monkeypatch):
        """No config, no .env → FileNotFoundError."""
        from app.config import load_config

        monkeypatch.delenv("PROJECT_ROOT", raising=False)
        monkeypatch.chdir(tmp_path)
        with pytest.raises(FileNotFoundError, match="No config found"):
            load_config()


class TestLoadConfigDotenvFallback:
    """load_config falls back to .env when no JSON config."""

    def test_reads_dotenv(self, tmp_path, monkeypatch):
        """Falls back to .env when no --config and no PROJECT_ROOT."""
        from app.config import load_config

        monkeypatch.delenv("PROJECT_ROOT", raising=False)
        _make_dotenv(tmp_path, ADO_ORG="dotenv-org", ADO_PROJECT="dotenv-proj")
        monkeypatch.chdir(tmp_path)

        config = load_config()
        assert config["organization"] == "dotenv-org"
        assert config["project"] == "dotenv-proj"

    def test_dotenv_reads_pat(self, tmp_path, monkeypatch):
        """PAT is read from .env (legitimate source for secrets)."""
        from app.config import load_config

        monkeypatch.delenv("PROJECT_ROOT", raising=False)
        _make_dotenv(tmp_path, ADO_PAT="my-secret-pat")
        monkeypatch.chdir(tmp_path)

        config = load_config()
        assert config["pat"] == "my-secret-pat"

    def test_prefers_ado_organization_over_ado_org(self, tmp_path, monkeypatch):
        """ADO_ORGANIZATION takes priority over legacy ADO_ORG."""
        from app.config import load_config

        monkeypatch.delenv("PROJECT_ROOT", raising=False)
        _make_dotenv(tmp_path, ADO_ORGANIZATION="new-org", ADO_ORG="old-org")
        monkeypatch.chdir(tmp_path)

        config = load_config()
        assert config["organization"] == "new-org"


# ===========================================================================
# 3. build_settings — raw dict → Settings object
# ===========================================================================


class TestBuildSettings:
    """build_settings maps config dict to pydantic Settings."""

    def test_maps_json_keys_to_settings(self, tmp_path):
        """JSON config keys map to correct Settings fields."""
        from app.config import build_settings

        config = {
            "organization": "mapped-org",
            "project": "mapped-proj",
            "tenantId": "my-tenant",
            "areaPath": "Area\\Sub",
            "iterationPath": "Sprint 1",
            "tasksDir": "/custom/tasks",
            "taskPrefix": "PRJ",
            "logLevel": "DEBUG",
        }
        settings = build_settings(config)

        assert settings.ado_organization == "mapped-org"
        assert settings.ado_project == "mapped-proj"
        assert settings.ado_tenant_id == "my-tenant"
        assert settings.ado_area_path == "Area\\Sub"
        assert settings.ado_iteration_path == "Sprint 1"
        assert settings.backlog_tasks_dir == "/custom/tasks"
        assert settings.backlog_task_prefix == "PRJ"
        assert settings.log_level == "DEBUG"

    def test_maps_ai_formatting(self):
        """aiFormatting block maps to AOAI Settings fields."""
        from app.config import build_settings

        config = {
            "organization": "org",
            "project": "proj",
            "aiFormatting": {
                "enabled": True,
                "endpoint": "https://my-aoai.openai.azure.com/",
                "deployment": "gpt-4o-mini",
            },
        }
        settings = build_settings(config)
        assert settings.azure_openai_endpoint == "https://my-aoai.openai.azure.com/"
        assert settings.azure_openai_deployment == "gpt-4o-mini"

    def test_legacy_backlog_tasks_dir_key(self):
        """Legacy 'backlogTasksDir' key still works."""
        from app.config import build_settings

        config = {
            "organization": "org",
            "project": "proj",
            "backlogTasksDir": "/legacy/tasks",
        }
        settings = build_settings(config)
        assert settings.backlog_tasks_dir == "/legacy/tasks"

    def test_tasks_dir_beats_legacy_key(self):
        """CLI schema 'tasksDir' takes priority over legacy 'backlogTasksDir'."""
        from app.config import build_settings

        config = {
            "organization": "org",
            "project": "proj",
            "tasksDir": "/new/tasks",
            "backlogTasksDir": "/legacy/tasks",
        }
        settings = build_settings(config)
        assert settings.backlog_tasks_dir == "/new/tasks"

    def test_pat_not_loaded_from_json_config(self, tmp_path):
        """PAT is NOT loaded from JSON config (security — secrets stay out of files).

        Only .env-derived configs should include PAT.
        """
        from app.config import build_settings

        config = {
            "organization": "org",
            "project": "proj",
            # No "pat" key — JSON configs don't have secrets
        }
        settings = build_settings(config)
        assert settings.ado_pat == ""

    def test_pat_loaded_from_dotenv_config(self):
        """PAT IS loaded when present in config dict (from .env fallback)."""
        from app.config import build_settings

        config = {
            "organization": "org",
            "project": "proj",
            "pat": "env-pat-value",
        }
        settings = build_settings(config)
        assert settings.ado_pat == "env-pat-value"

    def test_defaults_for_missing_optional_fields(self):
        """Missing optional fields get sensible defaults."""
        from app.config import build_settings

        config = {"organization": "org", "project": "proj"}
        settings = build_settings(config)

        assert settings.ado_area_path == ""
        assert settings.ado_iteration_path == ""
        assert settings.backlog_tasks_dir == "./backlog/tasks"
        assert settings.backlog_task_prefix == "BETH"
        assert settings.log_level == "INFO"
        assert settings.azure_openai_endpoint == ""


# ===========================================================================
# 4. load_settings — unified entry point (load_config + build_settings)
# ===========================================================================


class TestLoadSettings:
    """load_settings is the one-stop shop: path resolution + parse + build."""

    def test_from_explicit_json(self, tmp_path):
        """load_settings with explicit path returns Settings."""
        from app.config import load_settings

        config_path = _make_config(tmp_path, organization="unified-org")
        settings = load_settings(config_path=str(config_path))
        assert settings.ado_organization == "unified-org"

    def test_from_project_root(self, tmp_path, monkeypatch):
        """load_settings discovers via PROJECT_ROOT."""
        from app.config import load_settings

        _make_config(tmp_path, organization="root-settings-org")
        monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
        settings = load_settings()
        assert settings.ado_organization == "root-settings-org"

    def test_from_dotenv_fallback(self, tmp_path, monkeypatch):
        """load_settings falls back to .env."""
        from app.config import load_settings

        monkeypatch.delenv("PROJECT_ROOT", raising=False)
        _make_dotenv(tmp_path, ADO_ORG="dotenv-settings-org")
        monkeypatch.chdir(tmp_path)

        settings = load_settings()
        assert settings.ado_organization == "dotenv-settings-org"

    def test_returns_settings_type(self, tmp_path):
        """Returns a Settings instance."""
        from app.config import load_settings, Settings

        config_path = _make_config(tmp_path)
        settings = load_settings(config_path=str(config_path))
        assert isinstance(settings, Settings)


# ===========================================================================
# 5. get_settings backward compat
# ===========================================================================


class TestGetSettingsBackwardCompat:
    """get_settings() still works for code that depends on env-var loading."""

    def test_get_settings_returns_settings(self, monkeypatch):
        """get_settings() returns a Settings instance from env vars."""
        from app.config import get_settings

        monkeypatch.setenv("ADO_ORGANIZATION", "env-var-org")
        monkeypatch.setenv("ADO_PROJECT", "env-var-proj")

        settings = get_settings()
        assert settings.ado_organization == "env-var-org"
        assert settings.ado_project == "env-var-proj"


# ===========================================================================
# 6. Precedence integration tests
# ===========================================================================


class TestConfigPrecedence:
    """Verify the full precedence chain: explicit > PROJECT_ROOT > .env."""

    def test_explicit_beats_project_root_and_dotenv(self, tmp_path, monkeypatch):
        """--config flag wins over PROJECT_ROOT and .env."""
        from app.config import load_config

        # Set up all three sources
        explicit_dir = tmp_path / "explicit"
        explicit_dir.mkdir()
        config_path = _make_config(explicit_dir, organization="explicit-wins")

        root_dir = tmp_path / "root"
        root_dir.mkdir()
        _make_config(root_dir, organization="root-loses")
        monkeypatch.setenv("PROJECT_ROOT", str(root_dir))

        _make_dotenv(tmp_path, ADO_ORG="dotenv-loses")
        monkeypatch.chdir(tmp_path)

        config = load_config(config_path=str(config_path))
        assert config["organization"] == "explicit-wins"

    def test_project_root_beats_dotenv(self, tmp_path, monkeypatch):
        """PROJECT_ROOT wins over .env when --config not provided."""
        from app.config import load_config

        _make_config(tmp_path, organization="root-wins")
        monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))

        dotenv_dir = tmp_path / "dotenv_cwd"
        dotenv_dir.mkdir()
        _make_dotenv(dotenv_dir, ADO_ORG="dotenv-loses")
        monkeypatch.chdir(dotenv_dir)

        config = load_config()
        assert config["organization"] == "root-wins"


# ===========================================================================
# 7. JSON security: allowlist enforcement (ADR-004, BETH-75)
# ===========================================================================


class TestJsonAllowlist:
    """JSON config uses an allowlist. Unknown keys are silently dropped.
    Known secret keys raise ValueError. Fail-safe, not fail-open."""

    # -- Allowlisted keys pass through ---------------------------------

    def test_allowlisted_keys_pass_through(self, tmp_path):
        """All allowlisted keys are preserved in the returned dict."""
        from app.config import load_config, JSON_CONFIG_ALLOWED_KEYS

        config_path = _make_config(tmp_path, organization="allow-org")
        config = load_config(config_path=str(config_path))
        # Every key in the result must be on the allowlist
        for key in config:
            assert key in JSON_CONFIG_ALLOWED_KEYS, f"Unexpected key '{key}' not in allowlist"

    def test_standard_config_loads_fine(self, tmp_path):
        """Normal JSON config without secrets loads successfully."""
        from app.config import load_config

        config_path = _make_config(tmp_path, organization="clean-org")
        config = load_config(config_path=str(config_path))
        assert config["organization"] == "clean-org"

    # -- Unknown keys are silently dropped -----------------------------

    def test_unknown_keys_silently_dropped(self, tmp_path):
        """Keys not on the allowlist are silently removed from the result."""
        from app.config import load_config

        beth_dir = tmp_path / ".beth"
        beth_dir.mkdir()
        config_path = beth_dir / "ado-sync.json"
        config_path.write_text(json.dumps({
            "organization": "org",
            "project": "proj",
            "totallyMadeUpKey": "should-vanish",
            "anotherRandom": 42,
        }))

        config = load_config(config_path=str(config_path))
        assert "totallyMadeUpKey" not in config
        assert "anotherRandom" not in config
        assert config["organization"] == "org"

    # -- Secret keys raise ValueError ----------------------------------

    def test_pat_in_json_raises_value_error(self, tmp_path):
        """PAT in .beth/ado-sync.json raises ValueError."""
        from app.config import load_config

        beth_dir = tmp_path / ".beth"
        beth_dir.mkdir()
        config_path = beth_dir / "ado-sync.json"
        config_path.write_text(json.dumps({
            "organization": "org",
            "project": "proj",
            "pat": "secret-pat-value",
        }))

        with pytest.raises(ValueError, match="Secret"):
            load_config(config_path=str(config_path))

    def test_azure_openai_api_key_in_json_raises(self, tmp_path):
        """azure_openai_api_key in JSON config raises ValueError."""
        from app.config import load_config

        beth_dir = tmp_path / ".beth"
        beth_dir.mkdir()
        config_path = beth_dir / "ado-sync.json"
        config_path.write_text(json.dumps({
            "organization": "org",
            "project": "proj",
            "azure_openai_api_key": "sk-secret-key",
        }))

        with pytest.raises(ValueError, match="Secret"):
            load_config(config_path=str(config_path))

    def test_github_webhook_secret_in_json_raises(self, tmp_path):
        """github_webhook_secret in JSON config raises ValueError."""
        from app.config import load_config

        beth_dir = tmp_path / ".beth"
        beth_dir.mkdir()
        config_path = beth_dir / "ado-sync.json"
        config_path.write_text(json.dumps({
            "organization": "org",
            "project": "proj",
            "github_webhook_secret": "whsec_1234",
        }))

        with pytest.raises(ValueError, match="Secret"):
            load_config(config_path=str(config_path))

    def test_ado_pat_in_json_raises(self, tmp_path):
        """ado_pat (env-var style) in JSON config raises ValueError."""
        from app.config import load_config

        beth_dir = tmp_path / ".beth"
        beth_dir.mkdir()
        config_path = beth_dir / "ado-sync.json"
        config_path.write_text(json.dumps({
            "organization": "org",
            "project": "proj",
            "ado_pat": "my-ado-token",
        }))

        with pytest.raises(ValueError, match="Secret"):
            load_config(config_path=str(config_path))

    # -- Allowlist constant is well-formed -----------------------------

    def test_allowlist_constant_is_frozenset(self):
        """JSON_CONFIG_ALLOWED_KEYS is a frozenset (immutable)."""
        from app.config import JSON_CONFIG_ALLOWED_KEYS

        assert isinstance(JSON_CONFIG_ALLOWED_KEYS, frozenset)

    def test_allowlist_does_not_contain_secrets(self):
        """The allowlist must never include known secret key names."""
        from app.config import JSON_CONFIG_ALLOWED_KEYS

        secret_names = {"pat", "ado_pat", "azure_openai_api_key", "github_webhook_secret"}
        overlap = secret_names & JSON_CONFIG_ALLOWED_KEYS
        assert not overlap, f"Allowlist contains secret keys: {overlap}"

    def test_allowlist_covers_helper_config_keys(self):
        """Allowlist includes all keys used by _make_config helper (our schema)."""
        from app.config import JSON_CONFIG_ALLOWED_KEYS

        expected_keys = {
            "organization", "project", "authMethod", "tenantId",
            "areaPath", "iterationPath", "taskPrefix", "tasksDir",
            "aiFormatting", "logLevel",
        }
        missing = expected_keys - JSON_CONFIG_ALLOWED_KEYS
        assert not missing, f"Allowlist missing schema keys: {missing}"

    # -- aiFormatting subkey filtering ---------------------------------

    def test_ai_formatting_unknown_subkeys_dropped(self, tmp_path):
        """Unknown subkeys inside aiFormatting are silently removed."""
        from app.config import load_config

        beth_dir = tmp_path / ".beth"
        beth_dir.mkdir()
        config_path = beth_dir / "ado-sync.json"
        config_path.write_text(json.dumps({
            "organization": "org",
            "project": "proj",
            "aiFormatting": {
                "enabled": True,
                "endpoint": "https://my.openai.azure.com/",
                "deployment": "gpt-4o",
                "api_key": "sk-should-vanish",
                "randomNested": "also-gone",
            },
        }))

        config = load_config(config_path=str(config_path))
        ai = config["aiFormatting"]
        assert ai["enabled"] is True
        assert ai["endpoint"] == "https://my.openai.azure.com/"
        assert ai["deployment"] == "gpt-4o"
        assert "api_key" not in ai
        assert "randomNested" not in ai

    def test_ai_formatting_allowed_subkeys_constant(self):
        """AI_FORMATTING_ALLOWED_KEYS is a frozenset with expected keys."""
        from app.config import AI_FORMATTING_ALLOWED_KEYS

        assert isinstance(AI_FORMATTING_ALLOWED_KEYS, frozenset)
        assert {"enabled", "endpoint", "deployment"} == AI_FORMATTING_ALLOWED_KEYS


# ===========================================================================
# 8. JSON parse errors include file path
# ===========================================================================


class TestJsonParseErrors:
    """Malformed JSON errors include the file path for debugging."""

    def test_malformed_json_includes_path(self, tmp_path):
        """JSONDecodeError message includes the config file path."""
        from app.config import load_config

        beth_dir = tmp_path / ".beth"
        beth_dir.mkdir()
        bad_config = beth_dir / "ado-sync.json"
        bad_config.write_text("{bad json!!")

        with pytest.raises(json.JSONDecodeError, match="Failed to parse JSON config file"):
            load_config(config_path=str(bad_config))


# ===========================================================================
# 9. Env-var fallback: pydantic-settings fills gaps from process env
# ===========================================================================


class TestEnvVarFallback:
    """Process environment variables fill gaps not covered by .env or JSON."""

    def test_env_var_fills_missing_dotenv_key(self, tmp_path, monkeypatch):
        """.env has org but not project; process env var provides project."""
        from app.config import load_config, build_settings

        monkeypatch.delenv("PROJECT_ROOT", raising=False)
        # .env only has org, no project
        env_path = tmp_path / ".env"
        env_path.write_text("ADO_ORG=dotenv-org\n")
        monkeypatch.chdir(tmp_path)

        # Process env var provides the missing project
        monkeypatch.setenv("ADO_PROJECT", "env-var-project")

        config = load_config()
        settings = build_settings(config)

        assert settings.ado_organization == "dotenv-org"
        assert settings.ado_project == "env-var-project"

    def test_dotenv_value_beats_env_var(self, tmp_path, monkeypatch):
        """.env value takes priority over process env var for the same key."""
        from app.config import load_config, build_settings

        monkeypatch.delenv("PROJECT_ROOT", raising=False)
        _make_dotenv(tmp_path, ADO_ORG="dotenv-org")
        monkeypatch.chdir(tmp_path)

        monkeypatch.setenv("ADO_ORGANIZATION", "env-var-org")

        config = load_config()
        settings = build_settings(config)
        assert settings.ado_organization == "dotenv-org"

    def test_sparse_dotenv_does_not_override_env_vars(self, tmp_path, monkeypatch):
        """Sparse .env (missing keys) doesn't set empty strings that override env vars."""
        from app.config import load_config, build_settings

        monkeypatch.delenv("PROJECT_ROOT", raising=False)
        # .env only has org — no area_path, no iteration_path
        env_path = tmp_path / ".env"
        env_path.write_text("ADO_ORG=dotenv-org\nADO_PROJECT=dotenv-proj\n")
        monkeypatch.chdir(tmp_path)

        monkeypatch.setenv("ADO_AREA_PATH", "EnvArea")
        monkeypatch.setenv("ADO_ITERATION_PATH", "EnvSprint")

        config = load_config()
        settings = build_settings(config)

        assert settings.ado_area_path == "EnvArea"
        assert settings.ado_iteration_path == "EnvSprint"

    def test_load_settings_env_var_fallback(self, tmp_path, monkeypatch):
        """load_settings with sparse .env still picks up process env vars."""
        from app.config import load_settings

        monkeypatch.delenv("PROJECT_ROOT", raising=False)
        env_path = tmp_path / ".env"
        env_path.write_text("ADO_ORG=dotenv-org\n")
        monkeypatch.chdir(tmp_path)

        monkeypatch.setenv("ADO_PROJECT", "env-var-proj")

        settings = load_settings()
        assert settings.ado_organization == "dotenv-org"
        assert settings.ado_project == "env-var-proj"
