"""Tests for swarm.claims — path-level conflict prevention."""

from __future__ import annotations

import pytest

from swarm.board import MessageBoard
from swarm.claims import ClaimsRegistry, _normalize_path, _paths_overlap


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


class TestNormalizePath:
    """Verify path normalization."""

    def test_strips_leading_dot_slash(self) -> None:
        assert _normalize_path("./src/a.py") == "src/a.py"

    def test_strips_trailing_slash(self) -> None:
        assert _normalize_path("src/") == "src"

    def test_resolves_dot_dot(self) -> None:
        assert _normalize_path("src/lib/../a.py") == "src/a.py"

    def test_plain_path_unchanged(self) -> None:
        assert _normalize_path("src/a.py") == "src/a.py"

    def test_root_dot(self) -> None:
        assert _normalize_path(".") == "."


class TestPathsOverlap:
    """Verify path overlap detection."""

    def test_identical(self) -> None:
        assert _paths_overlap("src/a.py", "src/a.py") is True

    def test_parent_contains_child(self) -> None:
        assert _paths_overlap("src", "src/a.py") is True

    def test_child_inside_parent(self) -> None:
        assert _paths_overlap("src/a.py", "src") is True

    def test_siblings_no_overlap(self) -> None:
        assert _paths_overlap("src/a.py", "src/b.py") is False

    def test_similar_prefix_no_overlap(self) -> None:
        """src/ab should NOT overlap src/a (not a parent/child)."""
        assert _paths_overlap("src/a", "src/ab") is False

    def test_deep_nesting_overlap(self) -> None:
        assert _paths_overlap("src", "src/lib/utils/deep.py") is True

    def test_completely_different(self) -> None:
        assert _paths_overlap("src/a.py", "tests/b.py") is False


# ---------------------------------------------------------------------------
# AC #6: Claims channel prevents overlapping file paths
# ---------------------------------------------------------------------------


class TestClaimsRegistry:
    """Verify claims granting and conflict detection."""

    @pytest.fixture
    def registry(self) -> ClaimsRegistry:
        board = MessageBoard(":memory:")
        return ClaimsRegistry(board)

    def test_claim_granted_when_no_conflicts(self, registry: ClaimsRegistry) -> None:
        """First claim always succeeds."""
        result = registry.claim("worker-a", ["src/a.py", "src/b.py"])
        assert result.granted is True
        assert result.worker_id == "worker-a"
        assert result.post_id > 0

    def test_non_overlapping_claims_both_granted(self, registry: ClaimsRegistry) -> None:
        """AC #6: Two workers claiming different files — both succeed."""
        r1 = registry.claim("worker-a", ["src/a.py"])
        r2 = registry.claim("worker-b", ["tests/b.py"])
        assert r1.granted is True
        assert r2.granted is True

    def test_overlapping_file_rejected(self, registry: ClaimsRegistry) -> None:
        """AC #6: Same file claimed by two workers — second is rejected."""
        registry.claim("worker-a", ["src/shared.py"])
        r2 = registry.claim("worker-b", ["src/shared.py"])

        assert r2.granted is False
        assert len(r2.conflicts) == 1
        assert r2.conflicts[0]["conflicting_worker"] == "worker-a"

    def test_overlapping_directory_rejected(self, registry: ClaimsRegistry) -> None:
        """AC #6: Worker claims dir, another claims file inside — rejected."""
        registry.claim("worker-a", ["src"])
        r2 = registry.claim("worker-b", ["src/deep/file.py"])

        assert r2.granted is False
        assert len(r2.conflicts) == 1

    def test_overlapping_child_claims_parent_rejected(self, registry: ClaimsRegistry) -> None:
        """AC #6: Worker claims file, another claims parent dir — rejected."""
        registry.claim("worker-a", ["src/utils/helpers.py"])
        r2 = registry.claim("worker-b", ["src/utils"])

        assert r2.granted is False

    def test_release_allows_reclaim(self, registry: ClaimsRegistry) -> None:
        """After release, another worker can claim the same paths."""
        registry.claim("worker-a", ["src/a.py"])
        registry.release("worker-a")

        r2 = registry.claim("worker-b", ["src/a.py"])
        assert r2.granted is True

    def test_empty_paths_always_granted(self, registry: ClaimsRegistry) -> None:
        """Claiming no paths is always fine."""
        result = registry.claim("worker-x", [])
        assert result.granted is True

    def test_same_worker_can_reclaim(self, registry: ClaimsRegistry) -> None:
        """A worker doesn't conflict with itself (though it shouldn't claim twice)."""
        registry.claim("worker-a", ["src/a.py"])
        # Claiming as the same worker — no conflict
        r2 = registry.claim("worker-a", ["src/a.py"])
        assert r2.granted is True

    def test_is_path_claimed(self, registry: ClaimsRegistry) -> None:
        """is_path_claimed returns the worker holding the claim."""
        registry.claim("worker-a", ["src/module.py"])

        assert registry.is_path_claimed("src/module.py") == "worker-a"
        assert registry.is_path_claimed("tests/test.py") is None

    def test_get_active_claims(self, registry: ClaimsRegistry) -> None:
        """Active claims reflect current state."""
        registry.claim("worker-a", ["src/a.py"])
        registry.claim("worker-b", ["tests/b.py"])

        active = registry.get_active_claims()
        assert "worker-a" in active
        assert "worker-b" in active

        registry.release("worker-a")
        active = registry.get_active_claims()
        assert "worker-a" not in active
        assert "worker-b" in active

    def test_multiple_conflicts_reported(self, registry: ClaimsRegistry) -> None:
        """All conflicts are reported, not just the first."""
        registry.claim("worker-a", ["src/a.py"])
        registry.claim("worker-b", ["src/b.py"])

        r3 = registry.claim("worker-c", ["src/a.py", "src/b.py"])
        assert r3.granted is False
        assert len(r3.conflicts) == 2

    def test_claims_posted_to_board(self, registry: ClaimsRegistry) -> None:
        """Claims and releases are visible on the board."""
        board = registry._board
        registry.claim("worker-a", ["src/a.py"])

        posts = board.read_all("claims")
        assert len(posts) == 1
        assert posts[0].agent_id == "worker-a"
        assert "src/a.py" in posts[0].body

        registry.release("worker-a")
        posts = board.read_all("claims")
        assert len(posts) == 2  # claim + release
