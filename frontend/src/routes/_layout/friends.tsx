import {
  Badge,
  Box,
  Button,
  Container,
  EmptyState,
  Flex,
  HStack,
  Heading,
  Input,
  Separator,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { FiSend, FiUserPlus, FiUsers } from "react-icons/fi"

import { Friends } from "@/client"
import UserCard from "@/components/Common/UserCard"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import useCustomToast from "@/hooks/useCustomToast"
import { formatPublicId } from "@/utils"

export const Route = createFileRoute("/_layout/friends")({
  component: FriendsPage,
})

const FRIENDS_PER_PAGE = 12

function AddFriendModal() {
  const [searchId, setSearchId] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const searchAndRequestMutation = useMutation({
    mutationFn: async (publicId: string) => {
      const user = await Friends.searchUserById({ public_id: publicId })
      return Friends.createFriendRequest({ friend_id: user.id })
    },
    onSuccess: () => {
      showSuccessToast("Friend request sent!")
      setSearchId("")
      setIsOpen(false)
      queryClient.invalidateQueries({ queryKey: ["friendRequestsSent"] })
    },
    onError: (err: any) => {
      showErrorToast(
        err.body?.detail || "User not found or request already exists",
      )
    },
  })

  return (
    <DialogRoot open={isOpen} onOpenChange={(e) => setIsOpen(e.open)}>
      <DialogTrigger asChild>
        <Button variant="solid" colorPalette="accent">
          <FiUserPlus /> Add Friend by ID
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Friend</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <VStack gap={4} align="stretch">
            <Text fontSize="sm" color="fg.muted">
              Enter the unique User ID (e.g., u-1234abcd) of the person you want
              to add.
            </Text>
            <Field label="User ID">
              <Input
                placeholder="u-xxxxxxx"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                autoFocus
              />
            </Field>
          </VStack>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            colorPalette="accent"
            loading={searchAndRequestMutation.isPending}
            onClick={() => searchAndRequestMutation.mutate(searchId)}
            disabled={!searchId.trim()}
          >
            Send Request
          </Button>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

function FriendsPage() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const {
    data: infiniteFriends,
    isLoading: isLoadingFriends,
    fetchNextPage: fetchNextFriends,
    hasNextPage: hasNextFriends,
    isFetchingNextPage: isFetchingNextFriends,
  } = useInfiniteQuery({
    queryKey: ["friendsInfinite"],
    queryFn: ({ pageParam = 0 }) =>
      Friends.readFriends({
        skip: pageParam as number,
        limit: FRIENDS_PER_PAGE,
      }),
    getNextPageParam: (last, all) => {
      const loaded = all.length * FRIENDS_PER_PAGE
      return loaded < last.count ? loaded : undefined
    },
    initialPageParam: 0,
  })

  const allFriends = useMemo(
    () => infiniteFriends?.pages.flatMap((p) => p.data) || [],
    [infiniteFriends],
  )
  const totalFriendsCount = infiniteFriends?.pages[0]?.count || 0

  const { data: requestsReceived, isLoading: isLoadingRequests } = useQuery({
    queryKey: ["friendRequests"],
    queryFn: () => Friends.readFriendRequests({}),
  })

  const { data: requestsSent, isLoading: isLoadingSent } = useQuery({
    queryKey: ["friendRequestsSent"],
    queryFn: () => Friends.readSentFriendRequests({}),
  })

  const acceptMutation = useMutation({
    mutationFn: (id: string) =>
      Friends.acceptFriendRequest({ friend_id: id }),
    onSuccess: () => {
      showSuccessToast("Friend request accepted!")
      queryClient.invalidateQueries({ queryKey: ["friendsInfinite"] })
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] })
    },
    onError: () => showErrorToast("Failed to accept friend request"),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => Friends.removeFriend({ friend_id: id }),
    onSuccess: () => {
      showSuccessToast("Friend removed/Request cancelled")
      queryClient.invalidateQueries({ queryKey: ["friendsInfinite"] })
      queryClient.invalidateQueries({ queryKey: ["friendRequests"] })
      queryClient.invalidateQueries({ queryKey: ["friendRequestsSent"] })
    },
    onError: () => showErrorToast("Operation failed"),
  })

  return (
    <Container maxW="full">
      <Flex justify="space-between" align="center" pt={12} wrap="wrap" gap={4}>
        <Heading size="lg">Friends Management</Heading>
        <AddFriendModal />
      </Flex>

      <Box mt={12}>
        <Heading size="md" mb={6}>
          Friend Requests
        </Heading>

        <VStack align="stretch" gap={8}>
          {/* Incoming */}
          <Box>
            <HStack mb={4}>
              <Text fontWeight="bold">Incoming</Text>
              <Badge colorPalette="accent" variant="subtle">
                {requestsReceived?.count || 0}
              </Badge>
            </HStack>
            {isLoadingRequests ? (
              <Text>Loading...</Text>
            ) : requestsReceived?.data.length === 0 ? (
              <Text fontSize="sm" color="fg.muted">
                No incoming requests.
              </Text>
            ) : (
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
                {requestsReceived?.data.map((user) => (
                  <Box
                    key={user.id}
                    p={4}
                    borderWidth="1px"
                    rounded="md"
                    bg="bg.panel"
                  >
                    <Text fontWeight="bold">
                      {user.full_name || user.email}
                    </Text>
                    <Text fontSize="xs" color="fg.muted" mb={3}>
                      ID: {formatPublicId(user.public_id)}
                    </Text>
                    <Flex gap={2}>
                      <Button
                        size="xs"
                        colorPalette="accent"
                        onClick={() => acceptMutation.mutate(user.id)}
                        loading={acceptMutation.isPending}
                      >
                        Accept
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => removeMutation.mutate(user.id)}
                        loading={removeMutation.isPending}
                      >
                        Decline
                      </Button>
                    </Flex>
                  </Box>
                ))}
              </SimpleGrid>
            )}
          </Box>

          <Separator />

          {/* Outgoing */}
          <Box>
            <HStack mb={4}>
              <Text fontWeight="bold">Sent</Text>
              <Badge colorPalette="main" variant="subtle">
                {requestsSent?.count || 0}
              </Badge>
            </HStack>
            {isLoadingSent ? (
              <Text>Loading...</Text>
            ) : requestsSent?.data.length === 0 ? (
              <Text fontSize="sm" color="fg.muted">
                No sent requests pending.
              </Text>
            ) : (
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
                {requestsSent?.data.map((user) => (
                  <Box
                    key={user.id}
                    p={4}
                    borderWidth="1px"
                    rounded="md"
                    bg="bg.panel"
                    opacity={0.8}
                  >
                    <HStack justify="space-between" mb={1}>
                      <Text fontWeight="bold">
                        {user.full_name || user.email}
                      </Text>
                      <FiSend color="gray" size="12px" />
                    </HStack>
                    <Text fontSize="xs" color="fg.muted" mb={3}>
                      ID: {formatPublicId(user.public_id)}
                    </Text>
                    <Button
                      size="xs"
                      variant="ghost"
                      colorPalette="red"
                      onClick={() => removeMutation.mutate(user.id)}
                      loading={removeMutation.isPending}
                    >
                      Cancel Request
                    </Button>
                  </Box>
                ))}
              </SimpleGrid>
            )}
          </Box>
        </VStack>
      </Box>

      <Separator my={12} />

      <Box pb={20}>
        <Heading size="md" mb={6}>
          My Friends
        </Heading>
        {isLoadingFriends ? (
          <Text>Loading friends...</Text>
        ) : allFriends.length === 0 ? (
          <EmptyState.Root>
            <EmptyState.Content>
              <EmptyState.Indicator>
                <FiUsers />
              </EmptyState.Indicator>
              <VStack textAlign="center">
                <EmptyState.Title>No friends yet</EmptyState.Title>
                <EmptyState.Description>
                  Join a community to find people!
                </EmptyState.Description>
              </VStack>
            </EmptyState.Content>
          </EmptyState.Root>
        ) : (
          <VStack align="stretch" gap={8}>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} gap={6}>
              {allFriends.map((user) => (
                <UserCard key={user.id} user={user} />
              ))}
            </SimpleGrid>

            {hasNextFriends && (
              <Flex justify="center" mb={10}>
                <Button
                  variant="ghost"
                  colorPalette="accent"
                  onClick={() => fetchNextFriends()}
                  loading={isFetchingNextFriends}
                >
                  Load More Friends (Showing {allFriends.length} of{" "}
                  {totalFriendsCount})
                </Button>
              </Flex>
            )}
          </VStack>
        )}
      </Box>
    </Container>
  )
}
