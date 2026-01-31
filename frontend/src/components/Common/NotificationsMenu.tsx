import { Box, Flex, IconButton, Text } from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FaBell } from "react-icons/fa"
import { NotificationsService } from "../../client"
import { useNotifications } from "../../hooks/useNotifications"
import { MenuContent, MenuRoot, MenuTrigger } from "../ui/menu"
import NotificationsList from "./NotificationsList"

const NotificationsMenu = () => {
  const queryClient = useQueryClient()
  const { data: notifications } = useNotifications()

  const markAllAsReadMutation = useMutation({
    mutationFn: () => NotificationsService.markAllNotificationsAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })

  const unreadCount = notifications?.unread_count || 0

  return (
    <MenuRoot size="sm" positioning={{ placement: "bottom-end" }}>
      <MenuTrigger asChild>
        <Box position="relative">
          <IconButton variant="ghost" aria-label="Notifications" rounded="full">
            <FaBell />
          </IconButton>
          {unreadCount > 0 && (
            <Flex
              position="absolute"
              top="1"
              right="1"
              bg="red.500"
              color="white"
              rounded="full"
              minW="4"
              h="4"
              px={1}
              align="center"
              justify="center"
              fontSize="10px"
              fontWeight="bold"
              zIndex={1}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Flex>
          )}
        </Box>
      </MenuTrigger>
      <MenuContent minW="xs" maxH="md" overflowY="auto" p={0}>
        <Flex
          justify="space-between"
          align="center"
          px={4}
          py={3}
          borderBottomWidth="1px"
          bg="bg.muted"
        >
          <Text fontWeight="bold">Notifications</Text>
          {unreadCount > 0 && (
            <Text
              fontSize="xs"
              color="main.500"
              cursor="pointer"
              _hover={{ textDecoration: "underline" }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                markAllAsReadMutation.mutate()
              }}
            >
              Mark all as read
            </Text>
          )}
        </Flex>
        <NotificationsList />
      </MenuContent>
    </MenuRoot>
  )
}

export default NotificationsMenu
