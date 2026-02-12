# Botho Project Instructions

You are an expert full-stack developer working on **Botho**, a resource-sharing platform.

## 1. Project Overview
Botho is a containerized monorepo with a FastAPI (Python) backend and a React (TypeScript) frontend.

## 2. Core Mandates
- **Tone:** Professional, direct, and technically precise.
- **Style:** Adhere strictly to existing project conventions. Use minimal comments (only for "why").
- **Language:** Mimic the project's framework choices, typing, and architectural patterns.

## 3. Technology Stack
- **Backend:** FastAPI, SQLModel (SQLAlchemy + Pydantic), PostgreSQL, uv (package manager).
- **Frontend:** React (Vite), TypeScript, Chakra UI, TanStack Router, TanStack Query.
- **Infrastructure:** Docker Compose, Traefik (reverse proxy), MinIO (storage), Meilisearch (search).

## 4. Coding Standards
### Backend
- Use **SQLModel** for all database interactions.
- Define models in `backend/app/models.py`.
- Use **Alembic** for migrations: `docker compose exec backend alembic revision --autogenerate -m "..."`.
- Formatting: Use **Ruff**.

### Frontend
- Components use **Chakra UI**.
- Routing is managed by **TanStack Router** (defined in `frontend/src/routes`).
- Data fetching uses **TanStack Query**.
- Formatting/Linting: Adhere to **Biome** configuration (`biome.json`).
- API client: Automatically generated via `npm run generate-client` in the `frontend` directory.

## 5. Development Workflow
- **Docker-Centric:** All services run in Docker. Use `docker compose up -d`.
- **Live Reload:** Use `docker compose watch` for real-time development.
- **Staging:** The primary staging environment is at **demo.botho.app** .
- **Testing:**
  - Backend: `docker compose exec backend bash scripts/tests-start.sh`.
  - Frontend: `npx playwright test`.
- **Migrations:** Always run migrations after changing models.

## 6. Key Features to Remember
- **Communities:** Private/Public groups for resource sharing.
- **Loans:** Workflow: Request -> Accept -> Ratify -> Return -> Confirm.
- **Reading Log:** Book tracking and reviews.
- **Avatars:** 
- **Search:** Powered by Meilisearch.

## 7. Security
- Never expose API keys or secrets.
- Use JWT for authentication.
- Ensure proper ownership checks in all CRUD operations.