import { GoogleOAuthProvider, googleLogout } from "@react-oauth/google"
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { RouterProvider, createRouter } from "@tanstack/react-router"
import React, { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { routeTree } from "./routeTree.gen"

import { client } from "./client/client.gen"
import { CustomProvider } from "./components/ui/provider"

client.setConfig({
  baseUrl: import.meta.env.VITE_API_URL || "",
  auth: async () => localStorage.getItem("access_token") || "",
  throwOnError: true,
})

client.interceptors.response.use((response) => {
  if (response.status === 401 && !response.url.includes("/login/access-token")) {
    localStorage.removeItem("access_token")
    googleLogout()
    window.location.href = "/login"
  }
  return response
})

// Request persistent storage if available
if (navigator.storage?.persist) {
  navigator.storage.persist().then((persisted) => {
    if (persisted) {
      console.log("Storage persistence granted.")
    }
  })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
    },
  },
})

const router = createRouter({ routeTree, context: { queryClient } })
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <CustomProvider>
          <RouterProvider router={router} />
        </CustomProvider>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
