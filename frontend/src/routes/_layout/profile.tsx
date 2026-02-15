import {
  Box,
  Container,
  Flex,
  Heading,
  IconButton,
  Separator,
  Tabs,
  VStack,
} from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { BsThreeDotsVertical } from "react-icons/bs"
import { FiAward, FiEdit2, FiShare2, FiUser } from "react-icons/fi"

import type { ApiError } from "@/client"
import EditProfileModal from "@/components/UserSettings/EditProfileModal"
import ReputationOverview from "@/components/UserSettings/ReputationOverview"
import UserInformation from "@/components/UserSettings/UserInformation"
import UserProfilePicture from "@/components/UserSettings/UserProfilePicture"
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu"
import type { UserPublicExtended } from "@/customTypes"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { formatPublicId, handleError } from "@/utils"

export const Route = createFileRoute("/_layout/profile")({
  component: Profile,
})

function Profile() {
  const { user: currentUser } = useAuth()
  const { showSuccessToast } = useCustomToast()
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  const handleShareId = async () => {
    const formattedId = formatPublicId(currentUser?.public_id)
    try {
      await navigator.clipboard.writeText(formattedId)
      showSuccessToast("User ID copied to clipboard!")
    } catch (err) {
      handleError({ message: "Failed to copy to clipboard" } as ApiError)
    }
  }

  if (!currentUser) {
    return null
  }

  return (
    <Container maxW="full">
      <Flex align="center" justify="space-between" py={12}>
        <Heading size="lg">My Profile</Heading>
        <MenuRoot>
          <MenuTrigger asChild>
            <IconButton variant="ghost" aria-label="Profile Options">
              <BsThreeDotsVertical />
            </IconButton>
          </MenuTrigger>
          <MenuContent>
            <MenuItem
              value="edit-profile"
              onClick={() => setIsEditModalOpen(true)}
            >
              <FiEdit2 style={{ marginRight: "8px" }} /> Edit Profile
            </MenuItem>
            <MenuItem value="copy-id" onClick={handleShareId}>
              <FiShare2 style={{ marginRight: "8px" }} /> Copy User ID
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      </Flex>

      <Tabs.Root defaultValue="info" variant="plain" width="full">
        <Tabs.List mb={8}>
          <Tabs.Trigger value="info">
            <FiUser /> Overview
          </Tabs.Trigger>
          <Tabs.Trigger value="reputation">
            <FiAward /> Reputation
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="info">
          <VStack align="stretch" gap={8} maxW="3xl">
            <UserProfilePicture user={currentUser as UserPublicExtended} />
            <Separator />
            <UserInformation user={currentUser as UserPublicExtended} />
          </VStack>
        </Tabs.Content>

        <Tabs.Content value="reputation">
          <Box maxW="3xl">
            <ReputationOverview />
          </Box>
        </Tabs.Content>
      </Tabs.Root>

      <EditProfileModal
        user={currentUser as any}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
      />
    </Container>
  )
}
