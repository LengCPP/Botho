# Botho

A resource sharing, selling, and lending platform designed for circles of friends and trusted communities. Built with modern web technologies for a seamless experience.

*Built with the [Full Stack FastAPI Template](https://github.com/fastapi/full-stack-fastapi-template)*

---

## Project Architecture

Botho follows a modern, containerized monorepo architecture designed for scalability and developer productivity.

- **Frontend**: A single-page application (SPA) built with **React** and **TypeScript**, powered by **Vite**. It uses **Chakra UI** for styling, **TanStack Router** for navigation, and **TanStack Query** for data fetching.
- **Backend**: A high-performance asynchronous API built with **FastAPI**. It utilizes **SQLModel** (combining SQLAlchemy and Pydantic) for database interactions and data validation.
- **Database**: **PostgreSQL** serves as the primary relational database for structured data.
- **Search**: **Meilisearch** provides fast, type-ahead search capabilities for items, users, and communities.
- **Storage**: **MinIO** is integrated for handling image and file uploads (with support for Supabase in specific environments).
- **Reverse Proxy**: **Traefik** manages routing between the frontend and backend, handles SSL/TLS termination, and provides a monitoring dashboard.
- **Deployment**: The entire stack is orchestrated using **Docker Compose**, ensuring consistency across development, staging, and production environments.

---

## Key Features

- **Community-Centric Sharing**: Create and join private communities to pool resources (books, games, tools) with trusted circles.
- **Item Management & Discovery**: Easily catalog items with integrated search (e.g., Book search) and organize them into personal collections.
- **Reading Log**: Track reading progress (Reading, Completed, Dropped), rate items, and add personal tags and reviews to any book in the system.
- **Lending System**: Comprehensive tracking for borrowed and lent items, including due dates, return status, and approval workflows.
- **Social Connectivity**: Connect with friends, manage relationships, and view user profiles with distinct custom styling.
- **Notifications**: Stay updated on loan requests, returns, and community activity via real-time WebSockets and Push Notifications.
- **Enhanced Profile Management**: Unified interface for updating bio, alias, contact details, and interests.
- **Visual Identity**: Standardized, deterministic avatar system with a themed orange ring (`#fb6635`) for consistent user recognition.

---

## Technology Stack

### Backend
- ⚡ [**FastAPI**](https://fastapi.tiangolo.com) - Modern Python web framework.
- 🧰 [**SQLModel**](https://sqlmodel.tiangolo.com) - Database ORM (SQLAlchemy + Pydantic).
- 💾 [**PostgreSQL**](https://www.postgresql.org) - Robust relational database.
- 🔍 [**Pydantic**](https://docs.pydantic.dev) - Data validation and settings management.
- 🧪 [**Pytest**](https://pytest.org) - Comprehensive testing framework.
- 🚀 [**uv**](https://docs.astral.sh/uv/) - Extremely fast Python package manager.

### Frontend
- 🚀 [**React**](https://react.dev) (TypeScript) - UI library.
- 🎨 [**Chakra UI**](https://chakra-ui.com) - Component library for styling.
- 🛣️ [**TanStack Router**](https://tanstack.com/router) - Type-safe routing.
- 🔄 [**TanStack Query**](https://tanstack.com/query) - Asynchronous state management.
- 🧪 [**Playwright**](https://playwright.dev) - End-to-end testing.
- ⚡ [**Vite**](https://vitejs.dev/) - Next-generation frontend tooling.

### Infrastructure & Tools
- 🐋 [**Docker Compose**](https://www.docker.com) - Container orchestration.
- 📞 [**Traefik**](https://traefik.io) - Cloud-native reverse proxy.
- 📦 [**MinIO** / **Supabase**](https://supabase.com) - Object storage.
- 🔍 [**Meilisearch**](https://www.meilisearch.com/) - Lightning-fast search engine.
- 🔒 **JWT Authentication** - Secure token-based access control.

---

## Setup Instructions

### 1. Prerequisites
- [Docker and Docker Compose](https://www.docker.com/)
- [Node.js](https://nodejs.org/) (for local development)
- [Python 3.10+](https://www.python.org/) and [uv](https://docs.astral.sh/uv/)

### 2. Environment Configuration
Copy the template `.env` file and update the variables:
```bash
cp .env.example .env
```
Ensure you update `DOMAIN`, `SECRET_KEY`, `POSTGRES_PASSWORD`, and storage credentials.

### 3. Running with Docker
The project follows a **Docker-Centric Workflow**. Development and deployment are strictly Docker-based.

Start the entire stack for development:
```bash
docker compose up -d
```
- **App**: [http://localhost](http://localhost)
- **Backend API**: [http://localhost/api/v1/](http://localhost/api/v1/)
- **API Docs**: [http://localhost/docs](http://localhost/docs)

### 4. Environments
The project is deployed across several environments:

- **Production**: [https://botho.app](https://botho.app)
- **Demo**: [https://demo.botho.app](https://demo.botho.app)
- **Development**: [http://localhost](http://localhost)

### 5. Database Migrations
Run migrations inside the backend container:
```bash
docker compose exec backend alembic upgrade head
```

---

## Contribution Guidelines

1. **TDD (Test-Driven Development)**: Write tests before implementing features.
2. **Branching**: Create a new branch for your feature or bugfix.
3. **Coding Standards**:
   - Backend: Use **Ruff** and adhere to **SQLModel** patterns.
   - Frontend: Adhere to the **Biome** configuration.
4. **Testing**:
   - Backend tests in `backend/app/tests/`.
   - Frontend E2E tests in `frontend/tests/` (Playwright).
5. **Commits**: Ask for approval before committing to the repository.

---

## Development & Documentation

For more detailed information, refer to the individual service READMEs:
- [Backend Documentation](./backend/README.md)
- [Frontend Documentation](./frontend/README.md)

## License

This project is licensed under the MIT License.
