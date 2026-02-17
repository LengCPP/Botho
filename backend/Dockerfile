FROM python:3.10

ENV PYTHONUNBUFFERED=1

WORKDIR /app/

# Create a non-root user
RUN groupadd -r botho && useradd -m -r -g botho botho && \
    chown botho:botho /app/

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /bin/

# Place executables in the environment at the front of the path
ENV PATH="/app/.venv/bin:$PATH"

# Compile bytecode
ENV UV_COMPILE_BYTECODE=1

# uv Cache
ENV UV_LINK_MODE=copy

# Switch to non-root user
USER botho

# Install dependencies
RUN --mount=type=cache,target=/home/botho/.cache/uv,uid=999,gid=999 \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --no-install-project

ENV PYTHONPATH=/app

COPY --chown=botho:botho ./scripts /app/scripts
COPY --chown=botho:botho ./pyproject.toml ./alembic.ini /app/
COPY --chown=botho:botho ./app /app/app

# Sync the project
RUN --mount=type=cache,target=/home/botho/.cache/uv,uid=999,gid=999 \
    uv sync

CMD ["fastapi", "run", "--workers", "4", "app/main.py"]
