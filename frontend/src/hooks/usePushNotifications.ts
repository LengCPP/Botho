import { useCallback, useEffect, useState } from "react"
import { NotificationsService } from "../client"
import useAuth from "./useAuth"
import useCustomToast from "./useCustomToast"

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export const usePushNotifications = () => {
  const { user } = useAuth()
  const { showErrorToast } = useCustomToast()
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  )
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!user) return

    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          setRegistration(reg)
          reg.pushManager.getSubscription().then((sub) => {
            setSubscription(sub)
            setIsSubscribed(!!sub)
          })
        })
        .catch((err) => {
          console.error("Service Worker registration failed:", err)
        })
    }
  }, [user])

  const subscribe = useCallback(async () => {
    if (!registration) {
      showErrorToast(
        "Browser does not support push notifications or Service Worker not ready.",
      )
      return
    }

    setIsLoading(true)
    try {
      // Check current permission
      if (Notification.permission === "denied") {
        showErrorToast(
          "Push notifications are blocked in your browser settings. Please enable them to subscribe.",
        )
        setIsLoading(false)
        return
      }

      const { publicKey } =
        (await NotificationsService.getVapidPublicKey()) as any
      const subscribeOptions = {
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }

      const sub = await registration.pushManager.subscribe(subscribeOptions)
      setSubscription(sub)
      setIsSubscribed(true)

      const subJSON = sub.toJSON()
      if (subJSON.endpoint && subJSON.keys?.p256dh && subJSON.keys?.auth) {
        await NotificationsService.subscribePush({
          requestBody: {
            endpoint: subJSON.endpoint,
            p256dh: subJSON.keys.p256dh,
            auth: subJSON.keys.auth,
          },
        })
      }
    } catch (error) {
      console.error("Failed to subscribe to push notifications", error)
      showErrorToast(
        "Failed to enable push notifications. Check browser permissions.",
      )
      setIsSubscribed(false)
    } finally {
      setIsLoading(false)
    }
  }, [registration, showErrorToast])

  const unsubscribe = useCallback(async () => {
    if (!subscription) return

    setIsLoading(true)
    try {
      await subscription.unsubscribe()
      await NotificationsService.unsubscribePush({
        endpoint: subscription.endpoint,
      })
      setSubscription(null)
      setIsSubscribed(false)
    } catch (error) {
      console.error("Failed to unsubscribe from push notifications", error)
      showErrorToast("Failed to disable push notifications.")
    } finally {
      setIsLoading(false)
    }
  }, [subscription, showErrorToast])

  return { isSubscribed, subscribe, unsubscribe, isLoading }
}
