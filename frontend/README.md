# Botho - Frontend

The frontend is built with [Vite](https://vitejs.dev/), [React](https://reactjs.org/), [TypeScript](https://www.typescriptlang.org/), [TanStack Query](https://tanstack.com/query), [TanStack Router](https://tanstack.com/router) and [Chakra UI](https://chakra-ui.com/).

## Frontend Development

Botho follows a **strictly Docker-based workflow**. Development and deployment are orchestrated through Docker Compose.

* Start the development environment:

```bash
docker compose up -d
```

* For real-time updates and live reload:

```bash
docker compose watch
```

The frontend will be available at [http://localhost:5173](http://localhost:5173) (or the configured domain). Localhost configuration is deprecated for staging and production environments.

## Local Setup (IDE Support)

To get better IDE support (IntelliSense, Linting), it's recommended to install dependencies locally:

```bash
cd frontend
npm install
```

## Generate Client

To generate the frontend client, ensure the backend is running and then run:

```bash
cd frontend
npm run generate-client
```

This fetches the OpenAPI schema and updates `src/client`. Commit these changes.

## Code Structure

* `frontend/src` - Main frontend code.
* `frontend/src/client` - Generated OpenAPI client.
* `frontend/src/components` - UI components (organized by feature).
* `frontend/src/hooks` - Custom React hooks.
* `frontend/src/routes` - TanStack Router routes.
* `frontend/src/theme/` - Chakra UI theme customizations and recipes.

## Testing & Environments

### Playwright Testing
End-to-end tests are located in `frontend/tests/`. To run them:

1.  **Ensure the stack is running**:
    ```bash
    docker compose up -d
    ```
2.  **Run tests**:
    ```bash
    npx playwright test
    ```

You can also use UI mode: `npx playwright test --ui`.

### Environments
The project is deployed across several environments. Always test your changes in the Docker-based development environment before pushing.

- **Production**: [https://botho.app](https://botho.app)
- **Demo**: [https://demo.botho.app](https://demo.botho.app)
- **Development**: [http://localhost](http://localhost)