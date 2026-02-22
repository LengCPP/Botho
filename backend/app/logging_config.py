import json
import logging
import traceback
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """JSON log formatter for production environments."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_entry["exc_info"] = "".join(traceback.format_exception(*record.exc_info))
        if record.stack_info:
            log_entry["stack_info"] = self.formatStack(record.stack_info)
        # Include any extra fields attached to the record
        for key, value in record.__dict__.items():
            if key not in (
                "args", "asctime", "created", "exc_info", "exc_text", "filename",
                "funcName", "id", "levelname", "levelno", "lineno", "module",
                "msecs", "message", "msg", "name", "pathname", "process",
                "processName", "relativeCreated", "stack_info", "thread", "threadName",
                "taskName",
            ) and not key.startswith("_"):
                log_entry[key] = value
        return json.dumps(log_entry, default=str)


def configure_logging(environment: str) -> None:
    """Configure root logger based on environment.

    - local: human-readable text format to stdout
    - staging / production: JSON format to stdout for log aggregators
    """
    if environment == "local":
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    else:
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        root = logging.getLogger()
        root.setLevel(logging.INFO)
        root.handlers = [handler]
