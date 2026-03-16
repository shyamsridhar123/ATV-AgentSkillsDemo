"""Claims channel — path-level conflict prevention for parallel workers.

Workers post claims to the ``claims`` channel on the message board before
starting work on a set of file paths. The claims registry checks for
overlapping paths (including parent/child directory relationships) and
rejects claims that would conflict with active workers.

Claims are stored as board posts with structured metadata. A claim is
``active`` from the time it's posted until the worker posts a completion
to the ``completions`` channel, at which point the claim is released.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import PurePosixPath

from .board import MessageBoard

logger = logging.getLogger(__name__)


@dataclass
class Claim:
    """An active path claim by a worker."""

    worker_id: str
    paths: list[str]
    post_id: int


@dataclass
class ClaimResult:
    """Outcome of a claim attempt."""

    granted: bool
    worker_id: str
    paths: list[str]
    conflicts: list[dict[str, str]] = field(default_factory=list)
    post_id: int = 0


class ClaimsRegistry:
    """Path-level conflict prevention via the message board's claims channel.

    Workers call ``claim()`` before starting work. The registry checks
    all active claims for overlapping paths and rejects the request if
    any conflict is found.

    A path conflicts with another if:
      - They are identical
      - One is a parent directory of the other

    Claims are released when ``release()`` is called (typically after
    the worker's merge completes).
    """

    def __init__(self, board: MessageBoard) -> None:
        self._board = board
        # Active claims: worker_id → Claim
        self._active: dict[str, Claim] = {}

    def claim(self, worker_id: str, paths: list[str]) -> ClaimResult:
        """Attempt to claim a set of file paths for a worker.

        Parameters
        ----------
        worker_id : str
            The worker requesting the claim.
        paths : list[str]
            Relative file paths from repo root that this worker will touch.

        Returns
        -------
        ClaimResult
            Whether the claim was granted or rejected (with conflict details).
        """
        if not paths:
            return ClaimResult(granted=True, worker_id=worker_id, paths=[])

        # Normalize paths
        normalized = [_normalize_path(p) for p in paths]

        # Check for conflicts with all active claims
        conflicts: list[dict[str, str]] = []
        for other_id, other_claim in self._active.items():
            if other_id == worker_id:
                continue
            for my_path in normalized:
                for their_path in other_claim.paths:
                    if _paths_overlap(my_path, their_path):
                        conflicts.append({
                            "path": my_path,
                            "conflicting_worker": other_id,
                            "conflicting_path": their_path,
                        })

        if conflicts:
            logger.warning(
                "Claim rejected for worker %s: %d conflicts found",
                worker_id, len(conflicts),
            )
            return ClaimResult(
                granted=False,
                worker_id=worker_id,
                paths=normalized,
                conflicts=conflicts,
            )

        # Post claim to the board
        post_id = self._board.post(
            channel="claims",
            agent_id=worker_id,
            body=f"Claiming paths: {', '.join(normalized)}",
            title=f"Claim: {worker_id}",
            metadata={"paths": normalized, "status": "active"},
        )

        claim = Claim(worker_id=worker_id, paths=normalized, post_id=post_id)
        self._active[worker_id] = claim

        logger.info(
            "Claim granted: worker=%s, paths=%d, post_id=%d",
            worker_id, len(normalized), post_id,
        )

        return ClaimResult(
            granted=True,
            worker_id=worker_id,
            paths=normalized,
            post_id=post_id,
        )

    def release(self, worker_id: str) -> None:
        """Release all claims held by a worker."""
        claim = self._active.pop(worker_id, None)
        if claim:
            # Post release notification
            self._board.post(
                channel="claims",
                agent_id=worker_id,
                body=f"Released paths: {', '.join(claim.paths)}",
                title=f"Release: {worker_id}",
                parent_id=claim.post_id,
                metadata={"paths": claim.paths, "status": "released"},
            )
            logger.info("Claims released: worker=%s", worker_id)

    def get_active_claims(self) -> dict[str, Claim]:
        """Return a copy of all active claims."""
        return dict(self._active)

    def is_path_claimed(self, path: str) -> str | None:
        """Check if a path is claimed by any worker. Returns worker_id or None."""
        normalized = _normalize_path(path)
        for worker_id, claim in self._active.items():
            for claimed_path in claim.paths:
                if _paths_overlap(normalized, claimed_path):
                    return worker_id
        return None


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


def _normalize_path(path: str) -> str:
    """Normalize a path for consistent comparison.

    Strips leading ``./`` and trailing ``/``, resolves ``..`` components.
    """
    p = PurePosixPath(path)
    # Resolve relative bits but keep it relative
    parts = []
    for part in p.parts:
        if part == ".":
            continue
        if part == ".." and parts:
            parts.pop()
        elif part != "..":
            parts.append(part)
    return "/".join(parts) if parts else "."


def _paths_overlap(a: str, b: str) -> bool:
    """Check if two paths overlap (identical or parent/child relationship).

    Examples:
        _paths_overlap("src/a.py", "src/a.py")  →  True
        _paths_overlap("src", "src/a.py")        →  True  (parent contains child)
        _paths_overlap("src/a.py", "src")        →  True  (child is inside parent)
        _paths_overlap("src/a.py", "src/b.py")   →  False (siblings)
    """
    if a == b:
        return True

    # Check parent/child — use "/" suffix to avoid "src/ab" matching "src/a"
    a_dir = a + "/"
    b_dir = b + "/"
    return b.startswith(a_dir) or a.startswith(b_dir)
