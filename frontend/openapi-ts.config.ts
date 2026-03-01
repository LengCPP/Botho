import { defineConfig } from "@hey-api/openapi-ts"

export default defineConfig({
  // NOTE: "legacy/fetch" generates the old CancelablePromise-based client that
  // the frontend currently uses. @hey-api/openapi-ts 0.93+ generates a new
  // fetch-client architecture. Running `npm run generate-client` now produces
  // the new format which requires a frontend migration. Until that migration is
  // done, the committed src/client/ files should be kept as-is.
  client: "legacy/fetch",
  input: "./openapi.json",
  output: "./src/client",
  plugins: [
    {
      name: "@hey-api/sdk",
      // NOTE: this doesn't allow tree-shaking
      operations: {
        strategy: "byTags",
        nesting: "operationId",
        // FastAPI emits operationIds as "{tag}-{operation_name}". Adding "-" so
        // the tool splits tag from method, giving LoginService.loginAccessToken
        // instead of LoginService.loginLoginAccessToken.
        nestingDelimiters: /[-./]/,
        containerName: {
          name: (name: string) => `${name}Service`,
        },
      },
    },
  ],
})
