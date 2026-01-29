import {
  Box,
  Button,
  Card,
  Flex,
  HStack,
  Heading,
  Text,
  VStack,
} from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"
import { FiUserPlus } from "react-icons/fi"

import type { UserPublic } from "@/client"
import UserAvatar from "@/components/Common/UserAvatar"
import { useColorModeValue } from "@/components/ui/color-mode"
import useAuth from "@/hooks/useAuth"
import { formatPublicId } from "@/utils"

interface UserCardProps {
  user: UserPublic
}

const UserCard = ({ user }: UserCardProps) => {
  const { user: currentUser } = useAuth()
  const bgColor = useColorModeValue("orange.50", "gray.800")
  const borderColor = useColorModeValue("orange.200", "gray.600")
  const textColor = useColorModeValue("gray.800", "gray.100")

  const isSelf = user.id === currentUser?.id
  const displayName = user.profile?.alias || user.full_name || "Anonymous"

  return (
    <Card.Root
      width="100%"
      variant="outline"
      bg={bgColor}
      borderColor={borderColor}
      overflow="hidden"
      transition="transform 0.2s"
      _hover={{ transform: "translateY(-4px)", boxShadow: "lg" }}
      display="flex"
      flexDirection="column"
      h="100%"
    >
      <Card.Body p={6} as={Flex} direction="column" h="100%">
        <Flex justify="space-between" align="start" mb={4}>
          <HStack gap={4} minH="3em">
            <UserAvatar user={user as any} size="48px" />
            <VStack align="start" gap={0}>
              <Heading size="md" color={textColor} lineClamp={1}>
                {displayName}
              </Heading>
              <Text fontSize="sm" color="fg.muted">
                ID: {formatPublicId(user.public_id)}
              </Text>
            </VStack>
          </HStack>
          {user.friendship_status && (
            <Box
              color={
                user.friendship_status === "accepted"
                  ? "green.500"
                  : "orange.500"
              }
              title={
                user.friendship_status === "accepted"
                  ? "Friends"
                  : "Friend Request Pending"
              }
              pt={1}
            >
              <FiUserPlus />
            </Box>
          )}
        </Flex>

        <Box flex="1">
          <Text color="fg.muted" lineClamp={2} minH="3em">
            {user.profile?.bio || "No bio provided."}
          </Text>
        </Box>

        <Button
          asChild
          variant="solid"
          colorPalette="orange"
          width="full"
          size="sm"
          mt={6}
        >
          <Link
            to={isSelf ? "/profile" : ("/users/$userId" as any)}
            params={isSelf ? {} : { userId: user.id }}
          >
            View Profile
          </Link>
        </Button>
      </Card.Body>
    </Card.Root>
  )
}

export default UserCard
