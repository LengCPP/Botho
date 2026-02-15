import { Button, Flex, Text, VStack } from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FiUserPlus } from "react-icons/fi"

import { CommunitiesService, FriendsService } from "@/client"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import useCustomToast from "@/hooks/useCustomToast"

interface InviteFriendProps {
  communityId: string
  communityName: string
}

export default function InviteFriend({
  communityId,
  communityName,
}: InviteFriendProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const queryClient = useQueryClient()

  const { data: friends, isLoading: isLoadingFriends } = useQuery({
    queryKey: ["friends"],
    queryFn: () => FriendsService.readFriends({ limit: 100 }),
    enabled: isOpen,
  })

  // Fetch all memberships to filter out those already in community
  const { data: allMembers, isLoading: isLoadingMembers } = useQuery({
    queryKey: ["communityMembersAll", communityId],
    queryFn: () =>
      CommunitiesService.readCommunityMembers({
        id: communityId,
        limit: 1000,
      }),
    enabled: isOpen,
  })

  const inviteMutation = useMutation({
    mutationFn: (friendId: string) =>
      CommunitiesService.inviteFriend({
        id: communityId,
        requestBody: { friend_id: friendId },
      }),
    onSuccess: () => {
      showSuccessToast("Invitation sent!")
      // Invalidate queries to update UI
      queryClient.invalidateQueries({
        queryKey: ["communityInvited", communityId],
      })
      queryClient.invalidateQueries({
        queryKey: ["communityMembersAll", communityId],
      })
    },
    onError: (err: any) => {
      showErrorToast(err.body?.detail || "Failed to send invitation")
    },
  })

  const existingMemberIds = new Set(
    allMembers?.data?.map((m: any) => m.id) || [],
  )

  const friendsToInvite =
    friends?.data?.filter((f) => !existingMemberIds.has(f.id)) || []

  return (
    <DialogRoot open={isOpen} onOpenChange={(e) => setIsOpen(e.open)}>
      <DialogTrigger asChild>
        <Button size="sm" colorPalette="accent" variant="outline">
          <FiUserPlus /> Invite Friend
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite to {communityName}</DialogTitle>
        </DialogHeader>
        <DialogBody pb={6}>
          {isLoadingFriends || isLoadingMembers ? (
            <Text>Loading...</Text>
          ) : !friendsToInvite.length ? (
            <Text color="fg.muted">
              {friends?.data.length
                ? "All your friends are already in this community."
                : "You have no friends to invite yet."}
            </Text>
          ) : (
            <VStack align="stretch" gap={4} maxH="400px" overflowY="auto">
              {friendsToInvite.map((friend) => (
                <Flex
                  key={friend.id}
                  justify="space-between"
                  align="center"
                  p={3}
                  borderWidth="1px"
                  rounded="md"
                >
                  <Text fontWeight="bold">
                    {friend.full_name || friend.email}
                  </Text>
                  <Button
                    size="xs"
                    colorPalette="accent"
                    onClick={() => inviteMutation.mutate(friend.id)}
                    loading={
                      inviteMutation.isPending &&
                      inviteMutation.variables === friend.id
                    }
                  >
                    Invite
                  </Button>
                </Flex>
              ))}
            </VStack>
          )}
        </DialogBody>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}
