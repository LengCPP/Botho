import { defineConfig } from "@hey-api/openapi-ts"

export default defineConfig({
  client: "@hey-api/client-fetch",
  input: "./openapi.json",
  output: "./src/client",
  plugins: [
    {
      name: "@hey-api/sdk",
      operations: {
        strategy: "byTags",
        nesting: "operationId",
        nestingDelimiters: /[-./]/,
        containerName: {
          name: (name: string) => `${name}Service`,
        },
      },
      paramsStructure: "flat",
      responseStyle: "data",
    },
  ],
})
