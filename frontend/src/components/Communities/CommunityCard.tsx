import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { FiTrash2 } from "react-icons/fi"

import { CommunitiesService } from "@/client"
import EditCommunity from "@/components/Communities/EditCommunity"
import { useColorModeValue } from "@/components/ui/color-mode"
import type { CommunityPublicExtended } from "@/customTypes"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"

interface CommunityCardProps {
  community: CommunityPublicExtended
  onJoinRequest?: (community: CommunityPublicExtended) => void
  onDisbandRequest?: (community: CommunityPublicExtended) => void
}

const CommunityCard = ({ community, onJoinRequest, onDisbandRequest }: CommunityCardProps) => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { user: currentUser } = useAuth()

  const bgColor = useColorModeValue("accent.50", "gray.800")
  const borderColor = useColorModeValue("accent.200", "gray.600")
  const textColor = useColorModeValue("gray.800", "gray.100")

  const requiresApproval = community.requires_approval
  const isPrivate = community.is_private

  const joinMutation = useMutation({
    mutationFn: () => CommunitiesService.joinCommunity({ id: community.id }),
    onSuccess: () => {
      showSuccessToast("Joined community!")
      queryClient.invalidateQueries({ queryKey: ["communities"] })
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      queryClient.invalidateQueries({ queryKey: ["search"] })
    },
    onError: () => showErrorToast("Failed to join community"),
  })

  const isMember = community.current_user_status === "ACCEPTED"
  const isPending = community.current_user_status === "PENDING"

  const isAdmin =
    community.created_by === currentUser?.id ||
    currentUser?.is_superuser ||
    community.current_user_role === "ADMIN"

  const handleJoinClick = () => {
    if (requiresApproval) {
      onJoinRequest?.(community)
    } else {
      joinMutation.mutate()
    }
  }

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
          <VStack align="start" gap={2}>
            <Heading size="md" color={textColor} lineClamp={2} minH="3em">
              {community.name}
            </Heading>
            <Flex gap={2} wrap="wrap">
              {isPrivate ? (
                <Badge colorPalette="gray" variant="solid">
                  Private
                </Badge>
              ) : (
                <Badge colorPalette="main" variant="subtle">
                  Global
                </Badge>
              )}
              {requiresApproval ? (
                <Badge colorPalette="red" variant="subtle">
                  Closed
                </Badge>
              ) : (
                <Badge colorPalette="green" variant="subtle">
                  Open
                </Badge>
              )}
            </Flex>
          </VStack>
          {isAdmin && (
            <Flex gap={2}>
              <EditCommunity community={community} />
              <Button
                size="xs"
                variant={"danger" as any}
                onClick={() => onDisbandRequest?.(community)}
                title="Disband Community"
              >
                <FiTrash2 />
              </Button>
            </Flex>
          )}
        </Flex>

        <Box flex="1">
          <Text color="fg.muted" lineClamp={3} minH="4.5em">
            {community.description || "No description provided."}
          </Text>
        </Box>

        <Flex mt={6} gap={2}>
          {isMember ? (
            <Button
              asChild
              size="sm"
              colorPalette="accent"
              variant="solid"
              width="full"
            >
              <Link to={`/communities/${community.id}`}>View Community</Link>
            </Button>
          ) : isPending ? (
            <Button
              size="sm"
              variant="outline"
              colorPalette="gray"
              disabled
              width="full"
            >
              Pending Approval
            </Button>
          ) : (
            <Button
              size="sm"
              variant={"primary" as any}
              onClick={handleJoinClick}
              loading={joinMutation.isPending}
              width="full"
            >
              {requiresApproval ? "Apply to Join" : "Join Community"}
            </Button>
          )}
        </Flex>
      </Card.Body>
    </Card.Root>
  )
}

export default CommunityCard
