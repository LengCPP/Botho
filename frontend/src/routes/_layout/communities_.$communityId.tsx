import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Heading,
  Input,
  Separator,
  SimpleGrid,
  Tabs,
  Text,
  Textarea,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import {
  FiArrowLeft,
  FiBell,
  FiBellOff,
  FiBox,
  FiClock,
  FiLogOut,
  FiMessageSquare,
  FiPlus,
  FiSend,
  FiSettings,
  FiShield,
  FiTrash2,
  FiUserCheck,
  FiUserMinus,
  FiUserPlus,
  FiUsers,
} from "react-icons/fi"

import {
  CollectionsService,
  CommunitiesService,
  type CommunityPublic,
  FriendsService,
  type ItemPublic,
} from "@/client"
import AddCollection from "@/components/Collections/AddCollection"
import CollectionCard from "@/components/Collections/CollectionCard"
import ConfirmationModal from "@/components/Common/ConfirmationModal"
import AddItem from "@/components/Items/AddItem"
import { CompactItemCard } from "@/components/Items/CompactItemCard"
import ItemCard from "@/components/Items/ItemCard"
import { ItemDetailModal } from "@/components/Items/ItemDetailModal"
import { LoanCard } from "@/components/Items/LoanCard"
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
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { groupItems } from "@/utils"

export const Route = createFileRoute("/_layout/communities/$communityId")({
  component: CommunityBoard,
})

function AddAnnouncementModal({ communityId }: { communityId: string }) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const isMobile = useBreakpointValue({ base: true, md: false })

  const mutation = useMutation({
    mutationFn: () =>
      CommunitiesService.createCommunityAnnouncement({
        id: communityId,
        requestBody: { title, content },
      }),
    onSuccess: () => {
      showSuccessToast("Announcement posted!")
      setTitle("")
      setContent("")
      setIsOpen(false)
      queryClient.invalidateQueries({
        queryKey: ["communityAnnouncements", communityId],
      })
    },
    onError: () => showErrorToast("Failed to post announcement"),
  })

  return (
    <DialogRoot open={isOpen} onOpenChange={(e) => setIsOpen(e.open)}>
      <DialogTrigger asChild>
        <Button size="sm" colorPalette="accent" variant="outline">
          <FiPlus /> {isMobile ? "Announcement" : "Add Announcement"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Announcement</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <VStack gap={4}>
            <Field label="Title" required>
              <Input
                id="announcement-title"
                placeholder="Announcement Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Content" required>
              <Textarea
                id="announcement-content"
                placeholder="Write your announcement here..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
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
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
            disabled={!title.trim() || !content.trim()}
          >
            Post
          </Button>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

function AnnouncementItem({ ann }: { ann: any }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <Box
      p={4}
      borderWidth="1px"
      rounded="md"
      bg="bg.panel"
      borderColor={isExpanded ? "ui.hover" : "border.subtle"}
      cursor="pointer"
      onClick={() => setIsExpanded(!isExpanded)}
      transition="all 0.2s"
    >
      <Flex justify="space-between" align="center" gap={4}>
        <Heading size="sm" lineClamp={isExpanded ? undefined : 1} flex={1}>
          {ann.title}
        </Heading>
        <Text fontSize="2xs" color="fg.subtle" whiteSpace="nowrap">
          {new Date(ann.created_at).toLocaleDateString()}
        </Text>
      </Flex>
      {isExpanded && (
        <VStack align="start" mt={4} gap={3}>
          <Separator />
          <Text fontSize="sm" whiteSpace="pre-wrap" color="fg.muted">
            {ann.content}
          </Text>
          <Box pt={2}>
            <Text fontSize="2xs" color="fg.subtle" fontWeight="bold">
              Posted by {ann.author.full_name || ann.author.email}
            </Text>
          </Box>
        </VStack>
      )}
    </Box>
  )
}

function CommunityBoard() {
  const { communityId } = Route.useParams()
  const { user: currentUser } = useAuth()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [message, setMessage] = useState("")
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<ItemPublic | null>(null)
  const isMobile = useBreakpointValue({ base: true, md: false })

  const { data: community, isLoading: isLoadingCommunity } = useQuery({
    queryKey: ["community", communityId],
    queryFn: () =>
      CommunitiesService.readCommunity({
        id: communityId,
      }) as Promise<CommunityPublic>,
  })

  const isMember = community?.current_user_status === "ACCEPTED"
  const isPending = community?.current_user_status === "PENDING"
  const isAdmin =
    community?.created_by === currentUser?.id ||
    currentUser?.is_superuser ||
    community?.current_user_role === "ADMIN"
  const isModerator = community?.current_user_role === "MODERATOR"
  const isStaff = isAdmin || isModerator

  const { data: members, isLoading: isLoadingMembers } = useQuery({
    queryKey: ["communityMembers", communityId],
    queryFn: () =>
      CommunitiesService.readCommunityMembers({
        id: communityId,
        status: "ACCEPTED" as any,
      }),
    enabled: !!isMember,
  })

  const { data: applicants, isLoading: isLoadingApplicants } = useQuery({
    queryKey: ["communityApplicants", communityId],
    queryFn: () =>
      CommunitiesService.readCommunityMembers({
        id: communityId,
        status: "PENDING" as any,
      }),
    enabled: !!isStaff,
  })

  const { data: communityItems, isLoading: isLoadingItems } = useQuery({
    queryKey: ["communityItems", communityId],
    queryFn: () => CommunitiesService.readCommunityItems({ id: communityId }),
    enabled: !!isMember,
  })

  const { data: communityCollections, isLoading: isLoadingCollections } =
    useQuery({
      queryKey: ["communityCollections", communityId],
      queryFn: () => CollectionsService.readCollections({ communityId }),
      enabled: !!isMember,
    })

  const { data: messages, isLoading: isLoadingMessages } = useQuery({
    queryKey: ["communityMessages", communityId],
    queryFn: () =>
      CommunitiesService.readCommunityMessages({ id: communityId }),
    enabled: !!isMember,
  })

  const { data: announcements, isLoading: isLoadingAnnouncements } = useQuery({
    queryKey: ["communityAnnouncements", communityId],
    queryFn: () =>
      CommunitiesService.readCommunityAnnouncements({ id: communityId }),
    enabled: !!isMember,
  })

  const { data: communityLoans, isLoading: isLoadingLoans } = useQuery({
    queryKey: ["communityLoans", communityId],
    queryFn: () => CommunitiesService.readCommunityLoans({ id: communityId }),
    enabled: !!isStaff,
  })

  const postMessageMutation = useMutation({
    mutationFn: (content: string) =>
      CommunitiesService.createCommunityMessage({
        id: communityId,
        requestBody: { content },
      }),
    onSuccess: () => {
      setMessage("")
      queryClient.invalidateQueries({
        queryKey: ["communityMessages", communityId],
      })
    },
    onError: () => showErrorToast("Failed to post message"),
  })

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) =>
      CommunitiesService.deleteCommunityMessage({
        id: communityId,
        messageId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["communityMessages", communityId],
      })
    },
    onError: () => showErrorToast("Failed to delete message"),
  })

  const toggleNotifMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      CommunitiesService.updateCommunityNotifications({
        id: communityId,
        enabled,
      }),
    onSuccess: (data) => {
      showSuccessToast(data.message)
      queryClient.invalidateQueries({ queryKey: ["community", communityId] })
    },
    onError: () => showErrorToast("Failed to update notification settings"),
  })

  // Management Mutations
  const updateMemberMutation = useMutation({
    mutationFn: (data: { userId: string; role?: string; status?: string }) =>
      CommunitiesService.updateCommunityMemberRole({
        id: communityId,
        userId: data.userId,
        requestBody: { role: data.role as any, status: data.status as any },
      }),
    onSuccess: () => {
      showSuccessToast("Member updated successfully")
      queryClient.invalidateQueries({
        queryKey: ["communityMembers", communityId],
      })
      queryClient.invalidateQueries({
        queryKey: ["communityApplicants", communityId],
      })
    },
    onError: () => showErrorToast("Failed to update member"),
  })

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      CommunitiesService.leaveCommunity({ id: communityId, userId }),
    onSuccess: () => {
      showSuccessToast("Member removed")
      queryClient.invalidateQueries({
        queryKey: ["communityMembers", communityId],
      })
      queryClient.invalidateQueries({
        queryKey: ["communityApplicants", communityId],
      })
    },
    onError: () => showErrorToast("Failed to remove member"),
  })

  const leaveMutation = useMutation({
    mutationFn: () => CommunitiesService.leaveCommunity({ id: communityId }),
    onSuccess: () => {
      showSuccessToast("Left community")
      queryClient.invalidateQueries({ queryKey: ["communities"] })
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      navigate({ to: "/communities" })
    },
    onError: () => showErrorToast("Failed to leave community"),
  })

  const friendMutation = useMutation({
    mutationFn: (userId: string) =>
      FriendsService.createFriendRequest({ friendId: userId }),
    onSuccess: () => showSuccessToast("Friend request sent!"),
    onError: () => showErrorToast("Failed to send friend request"),
  })

  if (isLoadingCommunity) {
    return (
      <Container maxW="full" pt={12}>
        <Text>Loading community...</Text>
      </Container>
    )
  }

  if (!community) {
    return (
      <Container maxW="full" pt={12}>
        <Text>Community not found</Text>
      </Container>
    )
  }

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    postMessageMutation.mutate(message)
  }

  const groupedCommunityItems = groupItems(communityItems?.data || [])

  return (
    <Container maxW="full">
      <VStack align="stretch" gap={6} pt={8}>
        <Flex align="center" gap={4} wrap="wrap">
          <Heading size="xl">{community.name}</Heading>
          <HStack>
            {community.is_private ? (
              <Badge colorPalette="gray">Private</Badge>
            ) : (
              <Badge colorPalette="main">Global</Badge>
            )}
            {community.requires_approval ? (
              <Badge colorPalette="red">Closed</Badge>
            ) : (
              <Badge colorPalette="green">Open</Badge>
            )}
            {isMember && (
              <HStack gap={2}>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    toggleNotifMutation.mutate(!community.notifications_enabled)
                  }
                  loading={toggleNotifMutation.isPending}
                  title={
                    community.notifications_enabled
                      ? "Notifications enabled"
                      : "Notifications disabled"
                  }
                >
                  {community.notifications_enabled ? (
                    <FiBell />
                  ) : (
                    <FiBellOff color="gray" />
                  )}
                  <Text fontSize="2xs" ml={1}>
                    {community.notifications_enabled ? "On" : "Off"}
                  </Text>
                </Button>
                {!isAdmin && (
                  <Button
                    size="xs"
                    variant="outline"
                    colorPalette="red"
                    onClick={() => setIsLeaveModalOpen(true)}
                    loading={leaveMutation.isPending}
                  >
                    <FiLogOut /> Leave
                  </Button>
                )}
              </HStack>
            )}
          </HStack>
        </Flex>

        <Text color="fg.muted" fontSize="lg">
          {community.description || "No description provided."}
        </Text>

        <Separator />

        <Tabs.Root defaultValue="board" variant="enclosed">
          <Tabs.List
            display={{ base: "grid", md: "flex" }}
            gridTemplateColumns={{ base: "repeat(3, 1fr)", md: "none" }}
            gap={{ base: 1, md: 0 }}
          >
            <Tabs.Trigger value="board" justifyContent="center">
              <FiMessageSquare /> Board
            </Tabs.Trigger>
            <Tabs.Trigger value="items" justifyContent="center">
              <FiBox /> Items ({communityItems?.count || 0})
            </Tabs.Trigger>
            <Tabs.Trigger value="members" justifyContent="center">
              <FiUsers /> Members ({members?.count || 0})
            </Tabs.Trigger>
            {isStaff && (
              <>
                <Tabs.Trigger value="loans" justifyContent="center">
                  <FiClock /> Loans
                </Tabs.Trigger>
                <Tabs.Trigger value="manage" justifyContent="center">
                  <FiShield /> Manage
                </Tabs.Trigger>
              </>
            )}
          </Tabs.List>

          <Tabs.Content value="board" pt={6}>
            {!isMember ? (
              <Box
                p={8}
                textAlign="center"
                borderWidth="1px"
                rounded="md"
                bg="bg.muted"
              >
                <Text>You must be a member to see the board and messages.</Text>
              </Box>
            ) : (
              <SimpleGrid columns={{ base: 1, md: 3 }} gap={8}>
                <Box>
                  <VStack align="stretch" gap={4}>
                    <Flex justify="space-between" align="center">
                      <Heading size="md">Announcement Board</Heading>
                      {isStaff && (
                        <AddAnnouncementModal communityId={communityId} />
                      )}
                    </Flex>
                    <Box
                      h="400px"
                      overflowY="auto"
                      pr={2}
                      css={{
                        "&::-webkit-scrollbar": { width: "4px" },
                        "&::-webkit-scrollbar-thumb": {
                          background: "gray.subtle",
                          borderRadius: "full",
                        },
                      }}
                    >
                      <VStack align="stretch" gap={3}>
                        {isLoadingAnnouncements ? (
                          <Text>Loading...</Text>
                        ) : announcements?.data.length === 0 ? (
                          <Box
                            p={4}
                            borderWidth="1px"
                            rounded="md"
                            bg="bg.panel"
                          >
                            <Text color="fg.muted" fontStyle="italic">
                              No announcements yet.
                            </Text>
                          </Box>
                        ) : (
                          announcements?.data.map((ann) => (
                            <AnnouncementItem key={ann.id} ann={ann} />
                          ))
                        )}
                      </VStack>
                    </Box>
                  </VStack>
                </Box>
                <Box md={{ colSpan: 2 }}>
                  <VStack align="stretch" gap={4}>
                    <Heading size="md">Message Board</Heading>
                    <Box
                      h="400px"
                      borderWidth="1px"
                      rounded="md"
                      p={4}
                      bg="bg.panel"
                      overflowY="auto"
                      display="flex"
                      flexDirection="column-reverse"
                    >
                      <VStack align="stretch" gap={3}>
                        {isLoadingMessages ? (
                          <Text color="fg.muted">Loading messages...</Text>
                        ) : messages?.data.length === 0 ? (
                          <Text color="fg.muted" fontStyle="italic">
                            No messages yet. Start the conversation!
                          </Text>
                        ) : (
                          messages?.data.map((msg) => (
                            <Box key={msg.id} p={3} bg="bg.muted" rounded="lg">
                              <Flex
                                justify="space-between"
                                align="baseline"
                                mb={1}
                              >
                                <HStack gap={2}>
                                  <Text
                                    fontWeight="bold"
                                    fontSize="xs"
                                    color="ui.hover"
                                  >
                                    {msg.author.full_name || msg.author.email}
                                  </Text>
                                  {(msg.author_id === currentUser?.id ||
                                    isStaff) && (
                                    <Button
                                      size="2xs"
                                      variant="ghost"
                                      colorPalette="red"
                                      onClick={() => {
                                        if (
                                          window.confirm("Delete this message?")
                                        ) {
                                          deleteMessageMutation.mutate(msg.id)
                                        }
                                      }}
                                      loading={deleteMessageMutation.isPending}
                                    >
                                      <FiTrash2 size="10px" />
                                    </Button>
                                  )}
                                </HStack>
                                <Text fontSize="2xs" color="fg.subtle">
                                  {new Date(msg.created_at).toLocaleString()}
                                </Text>
                              </Flex>
                              <Text fontSize="sm">{msg.content}</Text>
                            </Box>
                          ))
                        )}
                      </VStack>
                    </Box>
                    <form onSubmit={handleSendMessage}>
                      <Flex gap={2}>
                        <Input
                          id="chat-message"
                          placeholder="Type a message..."
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                        />
                        <Button
                          type="submit"
                          colorPalette="accent"
                          loading={postMessageMutation.isPending}
                        >
                          <FiSend />
                        </Button>
                      </Flex>
                    </form>
                  </VStack>
                </Box>
              </SimpleGrid>
            )}
          </Tabs.Content>

          <Tabs.Content value="items" pt={6}>
            <VStack align="stretch" gap={10}>
              {/* Community Collections Section */}
              {communityCollections?.data &&
                communityCollections.data.length > 0 && (
                  <Box>
                    <Flex justify="space-between" align="center" mb={4}>
                      <Heading size="md">Community Collections</Heading>
                      {isStaff && <AddCollection communityId={communityId} />}
                    </Flex>
                    <SimpleGrid
                      columns={{ base: 1, sm: 2, lg: 3, xl: 4 }}
                      gap={6}
                    >
                      {communityCollections.data.map((collection) => (
                        <CollectionCard
                          key={collection.id}
                          collection={collection}
                        />
                      ))}
                    </SimpleGrid>
                  </Box>
                )}

              {/* Community Items Section */}
              <Box>
                <Flex justify="space-between" align="center" mb={4}>
                  <Heading size="md">All Items</Heading>
                  <HStack gap={2}>
                    {isStaff &&
                      (!communityCollections?.data ||
                        communityCollections.data.length === 0) && (
                        <AddCollection communityId={communityId} />
                      )}
                    <AddItem communityId={communityId} isAdmin={isStaff} />
                  </HStack>
                </Flex>

                {isLoadingItems ? (
                  <Text>Loading items...</Text>
                ) : communityItems?.data.length === 0 ? (
                  <Box
                    p={10}
                    textAlign="center"
                    borderWidth="1px"
                    borderStyle="dashed"
                    rounded="md"
                  >
                    <Text color="fg.muted">
                      No items in this community pool yet.
                    </Text>
                  </Box>
                ) : (
                  <>
                    <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} gap={6}>
                      {groupedCommunityItems.map((group) => {
                        const item = group[0]
                        return (
                          <Box key={item.id} position="relative">
                            {isMobile ? (
                              <CompactItemCard
                                item={group}
                                communityId={communityId}
                                isAdmin={isStaff}
                                onShowDetails={() => setSelectedItem(item)}
                              />
                            ) : (
                              <ItemCard
                                item={group}
                                communityId={communityId}
                                isAdmin={isStaff}
                              />
                            )}
                            {item.is_donation_pending && (
                              <Badge
                                colorPalette="yellow"
                                variant="solid"
                                size="xs"
                                position="absolute"
                                top={2}
                                left={2}
                                zIndex={1}
                              >
                                Donation Pending
                              </Badge>
                            )}
                          </Box>
                        )
                      })}
                    </SimpleGrid>

                    <ItemDetailModal
                      item={selectedItem}
                      isOpen={!!selectedItem}
                      onClose={() => setSelectedItem(null)}
                    />
                  </>
                )}
              </Box>
            </VStack>
          </Tabs.Content>

          <Tabs.Content value="members" pt={6}>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
              {isLoadingMembers ? (
                <Text>Loading members...</Text>
              ) : (
                members?.data
                  .filter((m) => m.community_status === "ACCEPTED")
                  .map((member) => (
                    <Box
                      key={member.id}
                      p={4}
                      borderWidth="1px"
                      rounded="md"
                      bg="bg.panel"
                      _hover={{ borderColor: "ui.hover" }}
                    >
                      <Flex justify="space-between" align="center">
                        <VStack align="start" gap={0}>
                          <Text fontWeight="bold">
                            {member.full_name || member.email}
                          </Text>
                          <Badge
                            size="xs"
                            colorPalette={
                              member.community_role === "ADMIN"
                                ? "purple"
                                : member.community_role === "MODERATOR"
                                  ? "main"
                                  : "gray"
                            }
                          >
                            {member.community_role?.toUpperCase() || "MEMBER"}
                          </Badge>
                        </VStack>
                        <Flex gap={2}>
                          {member.id !== currentUser?.id && (
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                if (!member.friendship_status) {
                                  friendMutation.mutate(member.id)
                                }
                              }}
                              colorPalette={
                                member.friendship_status === "PENDING"
                                  ? "accent"
                                  : member.friendship_status === "ACCEPTED"
                                    ? "green"
                                    : "gray"
                              }
                              disabled={!!member.friendship_status}
                            >
                              {member.friendship_status === "ACCEPTED" ? (
                                <FiUserCheck />
                              ) : (
                                <FiUserPlus />
                              )}
                            </Button>
                          )}
                          <Link to={`/users/${member.id}`}>
                            <Button size="xs" variant="outline">
                              Profile
                            </Button>
                          </Link>
                        </Flex>
                      </Flex>
                    </Box>
                  ))
              )}
            </SimpleGrid>
          </Tabs.Content>

          {isStaff && (
            <>
              <Tabs.Content value="loans" pt={6}>
                <VStack align="stretch" gap={4}>
                  <Heading size="md">Manage Loan Requests</Heading>
                  {isLoadingLoans ? (
                    <Text>Loading loans...</Text>
                  ) : communityLoans?.data.length === 0 ? (
                    <Box
                      p={8}
                      textAlign="center"
                      borderWidth="1px"
                      borderRadius="lg"
                      borderStyle="dashed"
                    >
                      <Text color="fg.muted" fontStyle="italic">
                        No loan requests found.
                      </Text>
                    </Box>
                  ) : (
                    <VStack align="stretch" gap={4}>
                      {communityLoans?.data.map((loan) => (
                        <LoanCard key={loan.id} loan={loan} type="incoming" />
                      ))}
                    </VStack>
                  )}
                </VStack>
              </Tabs.Content>

              <Tabs.Content value="manage" pt={6}>
                <VStack align="stretch" gap={8}>
                  {/* Applicants Section */}
                  {isLoadingApplicants ? (
                    <Text>Loading applicants...</Text>
                  ) : (
                    applicants?.data &&
                    applicants.data.length > 0 && (
                      <Box>
                        <Heading size="md" mb={4} color="ui.hover">
                          Pending Applications ({applicants.count})
                        </Heading>
                        <VStack align="stretch" gap={3}>
                          {applicants.data.map((member) => (
                            <Flex
                              key={member.id}
                              justify="space-between"
                              align="center"
                              p={4}
                              borderWidth="1px"
                              rounded="md"
                              bg="bg.panel"
                              borderColor="ui.hover"
                            >
                              <VStack align="start" gap={0}>
                                <Text fontWeight="bold">
                                  {member.full_name || member.email}
                                </Text>
                                <Badge size="xs" colorPalette="yellow">
                                  APPLICANT
                                </Badge>
                              </VStack>

                              <HStack gap={2}>
                                <Button
                                  size="xs"
                                  colorPalette="green"
                                  variant="solid"
                                  onClick={() =>
                                    updateMemberMutation.mutate({
                                      userId: member.id,
                                      status: "ACCEPTED",
                                    })
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="xs"
                                  colorPalette="red"
                                  variant="outline"
                                  onClick={() =>
                                    updateMemberMutation.mutate({
                                      userId: member.id,
                                      status: "REJECTED",
                                    })
                                  }
                                >
                                  Reject
                                </Button>
                              </HStack>
                            </Flex>
                          ))}
                        </VStack>
                      </Box>
                    )
                  )}

                  {/* Members Section */}
                  <Box>
                    <Heading size="md" mb={4}>
                      Manage Members
                    </Heading>
                    {isLoadingMembers ? (
                      <Text>Loading members...</Text>
                    ) : (
                      <VStack align="stretch" gap={3}>
                        {members?.data
                          .filter((m) => m.community_status === "ACCEPTED")
                          .map((member) => {
                            const isCreator = member.id === community.created_by
                            const role =
                              member.community_role ||
                              (isCreator ? "ADMIN" : "MEMBER")

                            const isTargetStaff =
                              role === "ADMIN" || role === "MODERATOR"

                            return (
                              <Flex
                                key={member.id}
                                justify="space-between"
                                align="center"
                                p={4}
                                borderWidth="1px"
                                rounded="md"
                                bg="bg.panel"
                              >
                                <VStack align="start" gap={0}>
                                  <Text fontWeight="bold">
                                    {member.full_name || member.email}
                                  </Text>
                                  <Badge
                                    size="xs"
                                    colorPalette={
                                      role === "ADMIN"
                                        ? "purple"
                                        : role === "MODERATOR"
                                          ? "main"
                                          : "gray"
                                    }
                                  >
                                    {role.toUpperCase()}
                                  </Badge>
                                </VStack>

                                <HStack gap={2}>
                                  {!isCreator &&
                                    member.id !== currentUser?.id && (
                                      <>
                                        {/* Only Admins can change roles or remove staff */}
                                        {isAdmin && !isCreator && (
                                          <MenuRoot>
                                            <MenuTrigger asChild>
                                              <Button
                                                size="xs"
                                                variant="outline"
                                              >
                                                <FiSettings /> Role
                                              </Button>
                                            </MenuTrigger>
                                            <MenuContent>
                                              <MenuItem
                                                value="ADMIN"
                                                onClick={() =>
                                                  updateMemberMutation.mutate({
                                                    userId: member.id,
                                                    role: "ADMIN",
                                                  })
                                                }
                                                disabled={role === "ADMIN"}
                                              >
                                                Promote to Admin
                                              </MenuItem>
                                              <MenuItem
                                                value="MODERATOR"
                                                onClick={() =>
                                                  updateMemberMutation.mutate({
                                                    userId: member.id,
                                                    role: "MODERATOR",
                                                  })
                                                }
                                                disabled={role === "MODERATOR"}
                                              >
                                                Promote to Moderator
                                              </MenuItem>
                                              <MenuItem
                                                value="MEMBER"
                                                onClick={() =>
                                                  updateMemberMutation.mutate({
                                                    userId: member.id,
                                                    role: "MEMBER",
                                                  })
                                                }
                                                disabled={role === "MEMBER"}
                                              >
                                                Demote to Member
                                              </MenuItem>
                                            </MenuContent>
                                          </MenuRoot>
                                        )}

                                        {/* Moderators can remove regular members, Admins can remove anyone but creator */}
                                        {(isAdmin ||
                                          (isModerator && !isTargetStaff)) && (
                                          <Button
                                            size="xs"
                                            colorPalette="red"
                                            variant="outline"
                                            onClick={() => {
                                              if (
                                                window.confirm(
                                                  `Are you sure you want to remove ${
                                                    member.full_name ||
                                                    member.email
                                                  }?`,
                                                )
                                              ) {
                                                removeMemberMutation.mutate(
                                                  member.id,
                                                )
                                              }
                                            }}
                                          >
                                            <FiUserMinus /> Remove
                                          </Button>
                                        )}
                                      </>
                                    )}
                                </HStack>
                              </Flex>
                            )
                          })}
                      </VStack>
                    )}
                  </Box>
                </VStack>
              </Tabs.Content>
            </>
          )}
        </Tabs.Root>
      </VStack>
      <ConfirmationModal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        onConfirm={() => leaveMutation.mutate()}
        title="Leave Community"
        message="Are you sure you want to leave this community?"
        isLoading={leaveMutation.isPending}
      />
    </Container>
  )
}

export default CommunityBoard
