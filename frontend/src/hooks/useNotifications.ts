import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { NotificationsService } from "../client"
import { OpenAPI } from "../client/core/OpenAPI"
import useAuth from "./useAuth"

export const useNotifications = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const token = localStorage.getItem("access_token")

  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => NotificationsService.readNotifications({}),
    enabled: !!user,
  })

  useEffect(() => {
    if (!user || !token) return

    // Determine the base URL for the API
    // If OpenAPI.BASE is not set, we assume the API is available at the same origin (via Nginx proxy)
    // or at http://localhost:8000 for local dev if not proxied.
    let baseUrl = OpenAPI.BASE

    if (!baseUrl) {
      if (window.location.hostname === "localhost") {
        baseUrl = "http://localhost:8000"
      } else {
        // Fallback: use current origin. Nginx proxy will handle /api requests.
        baseUrl = window.location.origin
      }
    }

    // Ensure we use the correct protocol for WebSocket based on the HTTP protocol of the Base URL
    // (or window location if relative)
    const protocol = baseUrl.startsWith("http")
      ? baseUrl.split(":")[0]
      : window.location.protocol.slice(0, -1)

    const wsProtocol = protocol === "https" ? "wss" : "ws"

    // Remove protocol from baseUrl to append strictly
    const cleanBaseUrl = baseUrl.replace(/^https?:\/\//, "")

    const wsUrl = `${wsProtocol}://${cleanBaseUrl}/api/v1/notifications/ws?token=${token}`

    console.log("WebSocket connecting to:", wsUrl)

    const socket = new WebSocket(wsUrl)

    socket.onmessage = (event) => {
      // In a real app, you might want to check the message content
      // and maybe show a toast or update the cache directly
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    }

    socket.onerror = (err) => {
      console.error("WebSocket error:", err)
    }

    return () => {
      socket.close()
    }
  }, [user, token, queryClient])

  return { data, isLoading, error }
}
