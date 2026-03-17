"""Structured JSON logging for the Beth Swarm.

Produces jq-parseable log lines with timestamps, agent IDs, task IDs,
and epic context.  One JSON object per line, compatible with:

    python -m swarm run 2>&1 | jq '.level'
"""

from __future__ import annotations

import json
import logging
import sys
import time
from typing import Any


class JsonFormatter(logging.Formatter):
    """Emit each log record as a single JSON line.

    Extra fields (``agent_id``, ``task_id``, ``epic_id``) are pulled from
    the LogRecord's ``__dict__`` when present — set them via
    ``logger.info("msg", extra={"agent_id": "dev-1"})``.
    """

    EXTRA_FIELDS = ("agent_id", "task_id", "epic_id", "model", "tokens_in", "tokens_out")

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }

        # Pull swarm-specific context from extra
        for field in self.EXTRA_FIELDS:
            val = getattr(record, field, None)
            if val is not None:
                entry[field] = val

        if record.exc_info and record.exc_info[1]:
            entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(entry, default=str)


def configure_logging(
    *,
    level: str = "INFO",
    json_output: bool = True,
) -> None:
    """Configure the root logger for the swarm.

    Parameters
    ----------
    level : str
        Log level name (DEBUG, INFO, WARNING, ERROR).
    json_output : bool
        If True, use JSON formatter. If False, use standard human-readable format.
    """
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove existing handlers to avoid duplicates on re-configure
    for handler in root.handlers[:]:
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stderr)

    if json_output:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s [%(levelname)-7s] %(name)s: %(message)s",
                datefmt="%H:%M:%S",
            )
        )

    root.addHandler(handler)

    # Quiet noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
