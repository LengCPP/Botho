import { Box, Flex, Icon, Spinner, Text, VStack } from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { FaCircle } from "react-icons/fa"
import { NotificationsService } from "../../client"
import { useNotifications } from "../../hooks/useNotifications"

interface NotificationsListProps {
  onItemClick?: () => void
  limit?: number
}

const NotificationsList = ({ onItemClick, limit }: NotificationsListProps) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: notifications, isLoading } = useNotifications()

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) =>
      NotificationsService.markNotificationAsRead({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })

  const handleNotificationClick = (notification: any) => {
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id)
    }
    onItemClick?.()

    if (notification.link) {
      const communityMatch = notification.link.match(
        /\/communities\/([a-f0-9-]+)/i,
      )
      if (communityMatch) {
        navigate({
          to: "/communities/$communityId",
          params: { communityId: communityMatch[1] },
        })
      } else {
        navigate({ to: notification.link as any })
      }
    }
  }

  if (isLoading) {
    return (
      <Flex justify="center" p={8}>
        <Spinner size="md" color="main.500" />
      </Flex>
    )
  }

  const data = limit
    ? notifications?.data?.slice(0, limit)
    : notifications?.data

  if (!data || data.length === 0) {
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
          onClick={() => handleNotificationClick(notification)}
          _hover={{ bg: "bg.muted" }}
          px={4}
          py={4}
          cursor="pointer"
          borderBottomWidth="1px"
          transition="background 0.2s"
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
          </Flex>
        </Box>
      ))}
    </VStack>
  )
}

export default NotificationsList
