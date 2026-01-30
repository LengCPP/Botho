import type { UserPublicExtended } from "@/customTypes"
import { getImageUrl } from "@/utils"
import { Avatar, Box, Flex } from "@chakra-ui/react"

interface UserAvatarProps {
  user?: UserPublicExtended | null
  size?: string
  fontSize?: string
  hasNotification?: boolean
}

const PALETTES = [
  "blue",
  "cyan",
  "green",
  "orange",
  "pink",
  "purple",
  "red",
  "teal",
  "yellow",
]

const pickPalette = (name: string) => {
  const index = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return PALETTES[index % PALETTES.length]
}

const UserAvatar = ({
  user,
  size = "40px",
  fontSize,
  hasNotification,
}: UserAvatarProps) => {
  const imageUrl = getImageUrl(user?.profile?.image_url)
  const fullName = user?.full_name || user?.email || ""

  return (
    <Box position="relative" display="inline-flex">
      <Box
        p="2px"
        borderRadius="full"
        border="2px solid"
        borderColor="ui.primary"
      >
        <Avatar.Root boxSize={size}>
          <Avatar.Fallback
            name={fullName}
            fontSize={fontSize || `calc(${size} * 0.4)`}
            colorPalette={pickPalette(fullName)}
          />
          <Avatar.Image src={imageUrl || undefined} />
        </Avatar.Root>
      </Box>
      {hasNotification && (
        <Flex
          position="absolute"
          top="0"
          right="0"
          bg="red.500"
          w="3"
          h="3"
          rounded="full"
          border="2px solid"
          borderColor="bg.muted"
          zIndex={1}
        />
      )}
    </Box>
  )
}

export default UserAvatar
