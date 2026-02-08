# Botho - Backend

## Requirements

* [Docker](https://www.docker.com/).
* [uv](https://docs.astral.sh/uv/) for Python package and environment management.

## Docker Compose Workflow

Botho follows a **strictly Docker-based workflow** for both development and deployment.

Start the local development environment:

```console
$ docker compose up -d
```

For development with live reload, use:

```console
$ docker compose watch
```

This uses volume mounts (configured in `docker-compose.yml` or specific staging/prod files) to sync your local changes to the container in real-time.

## General Workflow

While the app runs in Docker, you can still maintain a local environment for IDE support.

From `./backend/` you can install all the dependencies with:

```console
$ uv sync
```

Then you can activate the virtual environment with:

```console
$ source .venv/bin/activate
```

Ensure your editor is using the correct Python virtual environment (`backend/.venv/bin/python`).

### Key Files
- Models: `./backend/app/models.py`
- API Routes: `./backend/app/api/routes/`
- CRUD logic: `./backend/app/crud.py`
- Core Config: `./backend/app/core/config.py`

## VS Code

Debugger configurations are available to attach to the running backend container or run tests through the VS Code Python tests tab.

## Backend tests

Always follow **TDD (Test-Driven Development)**. To run tests:

```bash
docker compose exec backend bash scripts/tests-start.sh
```

Modify and add tests to `./backend/app/tests/`.

### Test Coverage

Coverage reports are generated in `htmlcov/index.html` after running tests.

## Migrations

Migrations are handled by Alembic inside the backend container.

1.  **Generate a revision** after changing models:
    ```console
    docker compose exec backend alembic revision --autogenerate -m "Description of changes"
    ```
2.  **Apply migrations**:
    ```console
    docker compose exec backend alembic upgrade head
    ```

## Email Templates

Located in `./backend/app/email-templates/`. Use the `src` directory for MJML source files and export them to HTML in the `build` directory.