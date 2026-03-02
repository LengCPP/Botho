import { Box, Flex, HStack, IconButton, Text, VStack } from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FaBell } from "react-icons/fa"
import { Notifications } from "../../client"
import { useNotifications } from "../../hooks/useNotifications"
import { MenuContent, MenuRoot, MenuTrigger } from "../ui/menu"
import ConfirmationModal from "./ConfirmationModal"
import NotificationsList from "./NotificationsList"

const NotificationsMenu = () => {
  const queryClient = useQueryClient()
  const [limit, setLimit] = useState(10)
  const { data: notifications } = useNotifications(limit)
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false)

  const markAllAsReadMutation = useMutation({
    mutationFn: () => Notifications.markAllNotificationsAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })

  const clearReadMutation = useMutation({
    mutationFn: () => Notifications.clearReadNotifications(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })

  const deleteAllMutation = useMutation({
    mutationFn: () => Notifications.deleteAllNotifications(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      setIsDeleteAllModalOpen(false)
    },
  })

  const unreadCount = notifications?.unread_count || 0
  const totalCount = notifications?.count || 0
  const hasNotifications = totalCount > 0
  const hasReadNotifications = hasNotifications && totalCount > unreadCount

  return (
    <MenuRoot
      size="sm"
      positioning={{ placement: "bottom-end", offset: { mainAxis: 20 } }}
    >
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
        <VStack align="stretch" gap={0}>
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
                Mark all read
              </Text>
            )}
          </Flex>

          <NotificationsList
            limit={limit}
            onLoadMore={() => setLimit((prev) => prev + 10)}
            hasMore={(notifications?.data?.length || 0) < totalCount}
          />

          {hasNotifications && (
            <Flex justify="center" p={2} borderTopWidth="1px" bg="bg.panel">
              <HStack gap={4}>
                {hasReadNotifications && (
                  <Text
                    fontSize="2xs"
                    color="fg.subtle"
                    cursor="pointer"
                    _hover={{ color: "main.500" }}
                    onClick={() => clearReadMutation.mutate()}
                  >
                    Clear read
                  </Text>
                )}
                <Text
                  fontSize="2xs"
                  color="fg.subtle"
                  cursor="pointer"
                  _hover={{ color: "red.500" }}
                  onClick={() => setIsDeleteAllModalOpen(true)}
                >
                  Delete all
                </Text>
              </HStack>
            </Flex>
          )}
        </VStack>
      </MenuContent>

      <ConfirmationModal
        isOpen={isDeleteAllModalOpen}
        onClose={() => setIsDeleteAllModalOpen(false)}
        onConfirm={() => deleteAllMutation.mutate()}
        title="Delete All Notifications"
        message="Are you sure you want to delete all notifications? This action cannot be undone."
        isLoading={deleteAllMutation.isPending}
      />
    </MenuRoot>
  )
}

export default NotificationsMenu
