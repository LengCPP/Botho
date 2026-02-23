"""
Lightweight in-process state shared between background workers and request
handlers. All access happens on the single asyncio event loop so no locking
is required.
"""


class _ClassificationState:
    """Tracks whether an admin-triggered bulk classification job is active."""

    bulk_running: bool = False


classification_state = _ClassificationState()
