import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { NotificationsService } from "../client"
import { OpenAPI } from "../client/core/OpenAPI"
import useAuth from "./useAuth"

export const useNotifications = (limit = 10) => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const token = localStorage.getItem("access_token")

  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications", limit],
    queryFn: () => NotificationsService.readNotifications({ limit }),
    enabled: !!user,
  })

  useEffect(() => {
    if (!user || !token) return

    // Determine the base URL for the API
    let baseUrl = OpenAPI.BASE

    if (!baseUrl) {
      if (window.location.hostname === "localhost") {
        baseUrl = "http://localhost:8000"
      } else {
        baseUrl = window.location.origin
      }
    }

    // Determine WS protocol and host
    let wsProtocol = "ws"
    let wsHost = ""

    if (baseUrl.startsWith("http")) {
      const url = new URL(baseUrl)
      wsProtocol = url.protocol === "https:" ? "wss" : "ws"
      wsHost = url.host
    } else {
      // Relative URL or same origin
      wsProtocol = window.location.protocol === "https:" ? "wss" : "ws"
      wsHost = window.location.host
    }

    // Construct the final WebSocket URL
    const wsUrl = `${wsProtocol}://${wsHost}/api/v1/notifications/ws?token=${token}`

    let socket: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null
    let isMounted = true

    const connect = () => {
      if (!isMounted) return

      console.log("WebSocket connecting to:", wsUrl)
      socket = new WebSocket(wsUrl)

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (
            !message.type ||
            !["ping", "IMPORT_ITEM_PROCESSED"].includes(message.type)
          ) {
            queryClient.invalidateQueries({ queryKey: ["notifications"] })
          }

          window.dispatchEvent(
            new CustomEvent("websocket-message", { detail: message }),
          )
        } catch (e) {
          console.error("Error parsing websocket message:", e)
          queryClient.invalidateQueries({ queryKey: ["notifications"] })
        }
      }

      socket.onerror = (err) => {
        console.error("WebSocket error:", err)
      }

      socket.onclose = (event) => {
        if (!isMounted) return
        console.log("WebSocket closed. Reconnecting in 5s...", event.reason)
        reconnectTimeout = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      isMounted = false
      if (socket) socket.close()
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
    }
  }, [user, token, queryClient])

  return { data, isLoading, error }
}
