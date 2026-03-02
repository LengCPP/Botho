import {
  Box,
  Button,
  Flex,
  HStack,
  Text,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { FiBell, FiLogOut, FiSettings, FiUser } from "react-icons/fi"

import { Notifications } from "@/client"
import useAuth from "@/hooks/useAuth"
import { useNotifications } from "@/hooks/useNotifications"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "../ui/dialog"
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu"
import NotificationsList from "./NotificationsList"
import UserAvatar from "./UserAvatar"

const UserMenu = () => {
  const { user, logout } = useAuth()
  const queryClient = useQueryClient()
  const { data: notifications } = useNotifications()
  const [showNotifications, setShowNotifications] = useState(false)

  // Only show the notification dot on the avatar if we are on mobile
  // (where the standalone bell icon is hidden)
  const isMobile = useBreakpointValue({ base: true, md: false })

  const handleLogout = async () => {
    logout()
  }

  const markAllAsReadMutation = useMutation({
    mutationFn: () => Notifications.markAllNotificationsAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })

  const name = user?.full_name || "User"
  const unreadCount = notifications?.unread_count || 0
  const hasNotifications = unreadCount > 0

  return (
    <Box>
      <MenuRoot positioning={{ placement: "bottom-end" }}>
        <MenuTrigger asChild>
          <Button
            variant="ghost"
            rounded="full"
            px={2}
            py={1}
            h="auto"
            _hover={{ bg: "blackAlpha.50" }}
            data-testid="user-menu"
          >
            <HStack gap={2}>
              <Box position="relative" role="group">
                <UserAvatar
                  user={user as any}
                  size="32px"
                  hasNotification={isMobile && hasNotifications}
                />
                <Box
                  position="absolute"
                  inset="2px"
                  bg="blackAlpha.200"
                  display="none"
                  _groupHover={{ display: "flex" }}
                  borderRadius="full"
                />
              </Box>
            </HStack>
          </Button>
        </MenuTrigger>

        <MenuContent boxShadow="lg" borderRadius="xl" py={2} minW="240px">
          <Box px={4} py={3} mb={1}>
            <VStack align="start" gap={0}>
              <Text fontWeight="600" fontSize="sm" truncate maxW="180px">
                {name}
              </Text>
              <Text fontSize="xs" color="fg.muted" truncate maxW="180px">
                {user?.email}
              </Text>
            </VStack>
          </Box>

          <MenuSeparator mx={2} mb={2} />

          {/* Notifications Trigger (Mobile Only) */}
          <Box display={{ base: "block", md: "none" }}>
            <MenuItem
              value="notifications"
              mx={2}
              borderRadius="md"
              gap={3}
              py={2.5}
              cursor="pointer"
              _hover={{ bg: "ui.hover", color: "white" }}
              onClick={() => setShowNotifications(true)}
            >
              <Box position="relative">
                <FiBell />
                {hasNotifications && (
                  <Box
                    position="absolute"
                    top="-1"
                    right="-1"
                    bg="red.500"
                    w="2"
                    h="2"
                    rounded="full"
                    border="1px solid white"
                  />
                )}
              </Box>
              <Text fontWeight="500">Notifications ({unreadCount})</Text>
            </MenuItem>
            <MenuSeparator mx={2} my={2} />
          </Box>

          <Link
            to="/profile"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <MenuItem
              value="profile"
              mx={2}
              borderRadius="md"
              gap={3}
              py={2.5}
              cursor="pointer"
              _hover={{ bg: "ui.hover", color: "white" }}
            >
              <FiUser />
              <Text fontWeight="500">My Profile</Text>
            </MenuItem>
          </Link>

          <Link
            to="/settings"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <MenuItem
              value="settings"
              mx={2}
              borderRadius="md"
              gap={3}
              py={2.5}
              cursor="pointer"
              _hover={{ bg: "ui.hover", color: "white" }}
            >
              <FiSettings />
              <Text fontWeight="500">Settings</Text>
            </MenuItem>
          </Link>

          <MenuSeparator mx={2} my={2} />

          <MenuItem
            value="logout"
            mx={2}
            borderRadius="md"
            gap={3}
            py={2.5}
            cursor="pointer"
            color="ui.danger"
            _hover={{ bg: "ui.danger", color: "white" }}
            onClick={handleLogout}
          >
            <FiLogOut />
            <Text fontWeight="500">Log Out</Text>
          </MenuItem>
        </MenuContent>
      </MenuRoot>

      {/* Notifications Dialog for Mobile */}
      <DialogRoot
        open={showNotifications}
        onOpenChange={(e) => setShowNotifications(e.open)}
        size="full"
        motionPreset="slide-in-bottom"
      >
        <DialogContent>
          <DialogHeader borderBottomWidth="1px" bg="bg.muted">
            <Flex justify="space-between" align="center">
              <DialogTitle>Notifications</DialogTitle>
              {unreadCount > 0 && (
                <Button
                  size="xs"
                  variant="ghost"
                  colorPalette="main"
                  onClick={() => markAllAsReadMutation.mutate()}
                >
                  Mark all as read
                </Button>
              )}
            </Flex>
            <DialogCloseTrigger />
          </DialogHeader>
          <DialogBody p={0}>
            <NotificationsList
              onItemClick={() => setShowNotifications(false)}
            />
          </DialogBody>
        </DialogContent>
      </DialogRoot>
    </Box>
  )
}

export default UserMenu
