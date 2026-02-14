import {
  Box,
  Button,
  Flex,
  Icon,
  IconButton,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { FaCircle } from "react-icons/fa"
import { FiTrash2 } from "react-icons/fi"
import { NotificationsService } from "../../client"
import { useNotifications } from "../../hooks/useNotifications"

interface NotificationsListProps {
  onItemClick?: () => void
  limit?: number
  onLoadMore?: () => void
  hasMore?: boolean
}

const NotificationsList = ({
  onItemClick,
  limit = 10,
  onLoadMore,
  hasMore = false,
}: NotificationsListProps) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: notifications, isLoading } = useNotifications(limit)

  // State for swipe-to-delete
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [swipingId, setSwipingId] = useState<string | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) =>
      NotificationsService.markNotificationAsRead({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => NotificationsService.deleteNotification({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      setSwipingId(null)
      setSwipeOffset(0)
    },
  })

  const handleNotificationClick = (notification: any) => {
    if (swipeOffset !== 0) {
      setSwipeOffset(0)
      setSwipingId(null)
      return
    }

    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id)
    }
    onItemClick?.()

    if (notification.link) {
      const communityMatch = notification.link.match(
        /\/communities\/([a-f0-9-]+)(?:\?tab=([a-z]+))?/i,
      )
      if (communityMatch) {
        navigate({
          to: "/communities/$communityId",
          params: { communityId: communityMatch[1] },
          search: communityMatch[2]
            ? { tab: communityMatch[2] as any }
            : undefined,
        })
      } else {
        navigate({ to: notification.link as any })
      }
    }
  }

  // Touch handlers for slide-to-delete
  const onTouchStart = (e: React.TouchEvent, id: string) => {
    setTouchStart(e.targetTouches[0].clientX)
    setSwipingId(id)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return
    const currentTouch = e.targetTouches[0].clientX
    const diff = touchStart - currentTouch

    // Only allow swiping left (diff > 0)
    if (diff > 0) {
      setSwipeOffset(Math.min(diff, 80))
    }
  }

  const onTouchEnd = () => {
    if (!touchStart) return

    if (swipeOffset > 70) {
      // Keep it open to show delete button
      setSwipeOffset(80)
    } else {
      setSwipeOffset(0)
      setSwipingId(null)
    }
    setTouchStart(null)
  }

  if (isLoading && !notifications) {
    return (
      <Flex justify="center" p={8}>
        <Spinner size="md" color="main.500" />
      </Flex>
    )
  }

  const data = notifications?.data || []

  if (data.length === 0) {
    return (
      <Box p={8} textAlign="center">
        <Text color="fg.muted">No notifications yet.</Text>
      </Box>
    )
  }

  return (
    <VStack align="stretch" gap={0} w="full">
      {data.map((notification) => (
        <Box
          key={notification.id}
          position="relative"
          overflow="hidden"
          borderBottomWidth="1px"
          bg="bg.panel"
        >
          {/* Action Background (Delete button) */}
          <Flex
            position="absolute"
            right={0}
            top={0}
            bottom={0}
            w="80px"
            bg="red.500"
            align="center"
            justify="center"
            color="white"
            cursor="pointer"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              deleteMutation.mutate(notification.id)
            }}
          >
            <FiTrash2 size="20px" />
          </Flex>

          {/* Foreground Content */}
          <Box
            onClick={() => handleNotificationClick(notification)}
            onTouchStart={(e) => onTouchStart(e, notification.id)}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{
              transform:
                swipingId === notification.id
                  ? `translateX(-${swipeOffset}px)`
                  : "translateX(0)",
              transition: touchStart ? "none" : "transform 0.2s ease-out",
            }}
            _hover={{ bg: "bg.muted" }}
            px={4}
            py={4}
            cursor="pointer"
            bg="bg.panel"
            role="group"
          >
            <Flex gap={3} w="100%" align="start">
              <Box mt={1.5} w={2}>
                {!notification.is_read && (
                  <Icon as={FaCircle} color="main.500" fontSize="8px" />
                )}
              </Box>
              <VStack align="start" gap={0} flex={1}>
                <Text
                  fontWeight={notification.is_read ? "normal" : "bold"}
                  fontSize="sm"
                >
                  {notification.title}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  {notification.message}
                </Text>
                <Text fontSize="10px" color="fg.subtle" mt={1}>
                  {new Date(notification.created_at).toLocaleString()}
                </Text>
              </VStack>

              {/* Desktop Delete Button */}
              <IconButton
                size="xs"
                variant="ghost"
                colorPalette="red"
                aria-label="Delete notification"
                display={{ base: "none", md: "inline-flex" }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  deleteMutation.mutate(notification.id)
                }}
              >
                <FiTrash2 />
              </IconButton>
            </Flex>
          </Box>
        </Box>
      ))}

      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onLoadMore?.()
          }}
          w="full"
          py={4}
          borderRadius={0}
          color="main.500"
          _hover={{ bg: "bg.muted" }}
        >
          Load older notifications
        </Button>
      )}
    </VStack>
  )
}

export default NotificationsList
