import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Flex,
  Grid,
  HStack,
  Heading,
  Image,
  Input,
  Popover,
  Portal,
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
import { useMemo, useState } from "react"
import {
  FaChevronLeft,
  FaFilter,
  FaFolder,
  FaList,
  FaThLarge,
} from "react-icons/fa"
import {
  FiArrowLeft,
  FiBell,
  FiBellOff,
  FiBox,
  FiCheck,
  FiClock,
  FiEdit2,
  FiLogOut,
  FiMessageSquare,
  FiPlus,
  FiSend,
  FiSettings,
  FiShare2,
  FiShield,
  FiTrash2,
  FiUserCheck,
  FiUserMinus,
  FiUserPlus,
  FiUsers,
  FiX,
} from "react-icons/fi"

import {
  CollectionsService,
  CommunitiesService,
  type CommunityPublic,
  FriendsService,
  type ItemPublic,
} from "@/client"
import CollectionCard from "@/components/Collections/CollectionCard"
import ConfirmationModal from "@/components/Common/ConfirmationModal"
import AddItem from "@/components/Items/AddItem"
import { CompactItemCard } from "@/components/Items/CompactItemCard"
import ItemCard from "@/components/Items/ItemCard"
import { ItemDetailModal } from "@/components/Items/ItemDetailModal"
import { LoanCard } from "@/components/Items/LoanCard"
import { useColorModeValue } from "@/components/ui/color-mode"
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
import { getImageUrl, groupItems } from "@/utils"

export const Route = createFileRoute("/_layout/communities/$communityId")({
  component: CommunityBoard,
})

function GroupCard({
  name,
  type,
  groups,
  onOpen,
}: { name: string; type: string; groups: ItemPublic[][]; onOpen: () => void }) {
  const bgColor = useColorModeValue("accent.50", "gray.800")
  const borderColor = useColorModeValue("accent.200", "gray.600")
  const textColor = useColorModeValue("gray.800", "gray.100")

  const allItems = groups.flat()
  const previewItems = allItems.slice(0, 3)

  return (
    <Card.Root
      width="100%"
      variant="outline"
      bg={bgColor}
      borderColor={borderColor}
      overflow="hidden"
      transition="transform 0.2s"
      _hover={{ transform: "translateY(-4px)", boxShadow: "lg" }}
      cursor="pointer"
      onClick={onOpen}
    >
      <Card.Body p={4} as={Flex} direction="column" h="100%">
        <Flex justify="space-between" align="start" mb={4}>
          <VStack align="start" gap={0} flex={1}>
            <Text
              fontSize="xl"
              fontWeight="bold"
              color={textColor}
              lineClamp={1}
            >
              {name}
            </Text>
            <Badge colorPalette="accent" variant="subtle" size="sm">
              {(type || "subject").toUpperCase()} COLLECTION
            </Badge>
          </VStack>
          <Badge variant="solid" colorPalette="teal">
            {groups.length}{" "}
            {groups[0][0].item_type === "book"
              ? groups.length === 1
                ? "Book"
                : "Books"
              : groups.length === 1
                ? "Item"
                : "Items"}
          </Badge>
        </Flex>

        <Box
          height="120px"
          position="relative"
          mb={4}
          bg="blackAlpha.100"
          borderRadius="md"
          p={2}
        >
          {previewItems.length > 0 ? (
            <HStack gap={-4} justify="center" height="100%">
              {previewItems.map((item, index) => (
                <Box
                  key={item.id}
                  zIndex={3 - index}
                  transform={`translateX(${index * 10}px) rotate(${
                    index * 5
                  }deg)`}
                >
                  {item.image_url ? (
                    <Image
                      src={getImageUrl(item.image_url)}
                      alt={item.title}
                      height="100px"
                      width="70px"
                      objectFit="cover"
                      borderRadius="sm"
                      boxShadow="md"
                      border="1px solid white"
                    />
                  ) : (
                    <Box
                      height="100px"
                      width="70px"
                      bg="gray.400"
                      borderRadius="sm"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      border="1px solid white"
                      p={1}
                    >
                      <Text
                        fontSize="8px"
                        fontWeight="bold"
                        textAlign="center"
                        color="white"
                        lineClamp={3}
                      >
                        {item.title}
                      </Text>
                    </Box>
                  )}
                </Box>
              ))}
            </HStack>
          ) : (
            <Flex height="100%" align="center" justify="center">
              <Text fontSize="sm" color="gray.500" fontStyle="italic">
                Empty collection
              </Text>
            </Flex>
          )}
        </Box>

        <Button
          variant="solid"
          colorPalette="accent"
          width="full"
          size="sm"
          mt="auto"
        >
          View Details
        </Button>
      </Card.Body>
    </Card.Root>
  )
}

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

function MessageItem({
  msg,
  communityId,
  isAdmin,
  isStaff,
  currentUser,
  queryClient,
}: any) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditEditing] = useState(msg.content)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const deleteMessageMutation = useMutation({
    mutationFn: () =>
      CommunitiesService.deleteCommunityMessage({
        id: communityId,
        messageId: msg.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["communityMessages", communityId],
      })
    },
    onError: () => showErrorToast("Failed to delete message"),
  })

  const updateMessageMutation = useMutation({
    mutationFn: (content: string) =>
      CommunitiesService.updateCommunityMessage({
        id: communityId,
        messageId: msg.id,
        requestBody: { content },
      }),
    onSuccess: () => {
      setIsEditing(false)
      queryClient.invalidateQueries({
        queryKey: ["communityMessages", communityId],
      })
    },
    onError: () => showErrorToast("Failed to update message"),
  })

  const handleUpdate = () => {
    if (!editContent.trim()) return
    updateMessageMutation.mutate(editContent)
  }

  const isAuthor = msg.author_id === currentUser?.id

  return (
    <Box p={3} bg="bg.muted" rounded="lg">
      <Flex justify="space-between" align="baseline" mb={1}>
        <HStack gap={2}>
          <Text fontWeight="bold" fontSize="xs" color="ui.hover">
            {msg.author.full_name || msg.author.email}
          </Text>
          {(isAuthor || isStaff) && !isEditing && (
            <HStack gap={1}>
              {isAuthor && (
                <Button
                  size="2xs"
                  variant="ghost"
                  onClick={() => setIsEditing(true)}
                >
                  <FiEdit2 size="10px" />
                </Button>
              )}
              <Button
                size="2xs"
                variant="ghost"
                colorPalette="red"
                onClick={() => {
                  if (window.confirm("Delete this message?")) {
                    deleteMessageMutation.mutate()
                  }
                }}
                loading={deleteMessageMutation.isPending}
              >
                <FiTrash2 size="10px" />
              </Button>
            </HStack>
          )}
        </HStack>
        <Text fontSize="2xs" color="fg.subtle">
          {new Date(msg.created_at).toLocaleString()}
        </Text>
      </Flex>

      {isEditing ? (
        <VStack align="stretch" mt={2} gap={2}>
          <Textarea
            size="sm"
            value={editContent}
            onChange={(e) => setEditEditing(e.target.value)}
            rows={2}
          />
          <HStack justify="flex-end" gap={2}>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setIsEditing(false)}
            >
              <FiX />
            </Button>
            <Button
              size="xs"
              colorPalette="accent"
              onClick={handleUpdate}
              loading={updateMessageMutation.isPending}
            >
              <FiCheck />
            </Button>
          </HStack>
        </VStack>
      ) : (
        <Text fontSize="sm">{msg.content}</Text>
      )}
    </Box>
  )
}

function DonationManagement({
  items,
  communityId,
}: { items: ItemPublic[]; communityId: string }) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const pending = items.filter((i) => i.is_donation_pending)

  const ratifyMutation = useMutation({
    mutationFn: (itemId: string) =>
      CommunitiesService.ratifyDonation({ id: communityId, itemId }),
    onSuccess: () => {
      showSuccessToast("Donation accepted and item received!")
      queryClient.invalidateQueries({
        queryKey: ["communityItems", communityId],
      })
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
    onError: () => showErrorToast("Failed to accept donation"),
  })

  if (pending.length === 0) return null

  return (
    <Box
      mb={8}
      p={4}
      borderWidth="1px"
      rounded="lg"
      bg="bg.panel"
      borderColor="orange.500"
    >
      <Heading size="md" mb={4} color="orange.500">
        Donation Management
      </Heading>
      <VStack align="stretch" gap={3}>
        {pending.map((item) => (
          <Flex
            key={item.id}
            justify="space-between"
            align="center"
            p={3}
            bg="bg.muted"
            rounded="md"
          >
            <VStack align="start" gap={0}>
              <Text fontWeight="bold">{item.title}</Text>
              <Text fontSize="xs" color="fg.muted">
                Donated by member
              </Text>
            </VStack>
            <Button
              size="sm"
              colorPalette="green"
              onClick={() => ratifyMutation.mutate(item.id)}
              loading={
                ratifyMutation.isPending && ratifyMutation.variables === item.id
              }
            >
              Accept & Confirm Receipt
            </Button>
          </Flex>
        ))}
      </VStack>
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
  const [viewMode, setViewMode] = useState<"card" | "list">("card")
  const [displayType, setDisplayType] = useState<"items" | "collections">(
    "collections",
  )
  const [organizeBy, setOrganizeBy] = useState<
    "subject" | "genre" | "category" | "author" | "ownership"
  >("subject")
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
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
      queryKey: ["collections", { communityId }],
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
    enabled: !!isAdmin,
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
    onSuccess: () => {
      showSuccessToast("Friend request sent!")
      queryClient.invalidateQueries({
        queryKey: ["communityMembers", communityId],
      })
    },
    onError: () => showErrorToast("Failed to send friend request"),
  })

  const items = communityItems?.data || []

  const organizedItems = useMemo(() => {
    const groupedPhysical = groupItems(items)
    const sections: Record<
      string,
      { pooled: ItemPublic[][]; owned: ItemPublic[][] }
    > = {}

    for (const group of groupedPhysical) {
      const first = group[0]
      const isOwned = first.owner_id === communityId

      let keys: string[] = []
      if (organizeBy === "subject") {
        keys = first.work_metadata?.tags || []
      } else if (organizeBy === "genre") {
        const g = (first.extra_data as any)?.genre
        if (g) keys = [g]
      } else if (organizeBy === "category") {
        const c = (first.extra_data as any)?.category
        if (c) keys = [c]
      } else if (organizeBy === "author") {
        if (first.author) keys = [first.author]
      } else if (organizeBy === "ownership") {
        keys = [isOwned ? "Community Owned" : "Member Shared Pool"]
      }

      const targetKeys = keys.length === 0 ? ["Others"] : keys

      for (const key of targetKeys) {
        if (!sections[key]) sections[key] = { pooled: [], owned: [] }
        if (isOwned) {
          sections[key].owned.push(group)
        } else {
          sections[key].pooled.push(group)
        }
      }
    }
    return sections
  }, [items, communityId, organizeBy])

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    postMessageMutation.mutate(message)
  }

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

  const renderGroup = (groups: ItemPublic[][]) => (
    <SimpleGrid
      columns={viewMode === "list" ? 1 : { base: 2, md: 3, lg: 4, xl: 5 }}
      gap={viewMode === "list" ? 2 : { base: 3, md: 6 }}
    >
      {groups.map((group) => {
        const item = group[0]
        return viewMode === "list" ? (
          <CompactItemCard
            key={item.id}
            item={group}
            communityId={communityId}
            isAdmin={isAdmin}
            onShowDetails={() => setSelectedItem(item)}
          />
        ) : (
          <ItemCard
            key={item.id}
            item={group}
            communityId={communityId}
            isAdmin={isAdmin}
            onShowDetails={() => setSelectedItem(item)}
          />
        )
      })}
    </SimpleGrid>
  )

  const groupCardType = organizeBy

  return (
    <Container maxW="full">
      <VStack align="stretch" gap={6} pt={8}>
        <Flex align="center" gap={4} wrap="wrap" justify="space-between">
          <VStack align="start" gap={1}>
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
            </HStack>
          </VStack>

          {isMember && (
            <HStack gap={2}>
              <HStack
                border="1px solid"
                borderColor="border.subtle"
                p={1}
                rounded="md"
                gap={0}
              >
                <Button
                  size="xs"
                  variant={displayType === "items" ? "solid" : "ghost"}
                  onClick={() => {
                    setDisplayType("items")
                    setSelectedGroup(null)
                  }}
                  title="Item View"
                >
                  <FiBox />
                </Button>
                <Button
                  size="xs"
                  variant={displayType === "collections" ? "solid" : "ghost"}
                  onClick={() => setDisplayType("collections")}
                  title="Collection View"
                >
                  <FaFolder />
                </Button>
              </HStack>

              <Separator orientation="vertical" height="20px" mx={1} />

              <Flex
                border="1px solid"
                borderColor="border.subtle"
                p={1}
                rounded="md"
                gap={0}
              >
                <Button
                  size="xs"
                  variant={viewMode === "card" ? "solid" : "ghost"}
                  onClick={() => setViewMode("card")}
                >
                  <FaThLarge />
                </Button>
                <Button
                  size="xs"
                  variant={viewMode === "list" ? "solid" : "ghost"}
                  onClick={() => setViewMode("list")}
                >
                  <FaList />
                </Button>
              </Flex>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  toggleNotifMutation.mutate(!community.notifications_enabled)
                }
                loading={toggleNotifMutation.isPending}
              >
                {community.notifications_enabled ? (
                  <FiBell />
                ) : (
                  <FiBellOff color="gray" />
                )}
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
            {isAdmin && (
              <Tabs.Trigger value="loans" justifyContent="center">
                <FiClock /> Loans
              </Tabs.Trigger>
            )}
            {isStaff && (
              <Tabs.Trigger value="manage" justifyContent="center">
                <FiShield /> Manage
              </Tabs.Trigger>
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
                      {isAdmin && (
                        <AddAnnouncementModal communityId={communityId} />
                      )}
                    </Flex>
                    <Box
                      maxH="400px"
                      overflowY="auto"
                      css={{
                        "&::-webkit-scrollbar": { display: "none" },
                        scrollbarWidth: "none",
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
                            <MessageItem
                              key={msg.id}
                              msg={msg}
                              communityId={communityId}
                              isAdmin={isAdmin}
                              isStaff={isStaff}
                              currentUser={currentUser}
                              queryClient={queryClient}
                            />
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
            <VStack align="stretch" gap={8}>
              <Flex justify="space-between" align="center" wrap="wrap" gap={4}>
                <HStack gap={2}>
                  {/* Organize Button */}
                  {displayType === "collections" && !selectedGroup && (
                    <Popover.Root>
                      <Popover.Trigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          colorPalette="accent"
                        >
                          <FaFilter /> Organize
                        </Button>
                      </Popover.Trigger>
                      <Portal>
                        <Popover.Positioner>
                          <Popover.Content width="300px">
                            <Popover.Arrow />
                            <Popover.Body>
                              <VStack gap={4} align="stretch">
                                <Box>
                                  <Text fontSize="sm" fontWeight="bold" mb={2}>
                                    Organize Collections By
                                  </Text>
                                  <VStack gap={2} align="stretch">
                                    {(
                                      [
                                        "subject",
                                        "genre",
                                        "category",
                                        "author",
                                        ...(isAdmin ? ["ownership"] : []),
                                      ] as const
                                    ).map((opt) => (
                                      <Button
                                        key={opt}
                                        size="sm"
                                        variant={
                                          organizeBy === opt ? "solid" : "ghost"
                                        }
                                        justifyContent="flex-start"
                                        onClick={() =>
                                          setOrganizeBy(opt as any)
                                        }
                                      >
                                        {opt.charAt(0).toUpperCase() +
                                          opt.slice(1)}
                                      </Button>
                                    ))}
                                  </VStack>
                                </Box>
                              </VStack>
                            </Popover.Body>
                          </Popover.Content>
                        </Popover.Positioner>
                      </Portal>
                    </Popover.Root>
                  )}
                  {selectedGroup && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedGroup(null)}
                    >
                      <FaChevronLeft style={{ marginRight: "8px" }} />{" "}
                      Collections
                    </Button>
                  )}
                </HStack>
                <AddItem communityId={communityId} isAdmin={isAdmin} />
              </Flex>

              {isLoadingItems ? (
                <Text>Loading items...</Text>
              ) : items.length === 0 ? (
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
                <VStack align="stretch" gap={12}>
                  {displayType === "collections" && !selectedGroup ? (
                    <Grid
                      templateColumns={{
                        base: "1fr",
                        sm: "repeat(2, 1fr)",
                        md: "repeat(3, 1fr)",
                        lg: "repeat(4, 1fr)",
                        xl: "repeat(5, 1fr)",
                      }}
                      gap={6}
                    >
                      {Object.entries(organizedItems).map(([name, data]) => (
                        <GroupCard
                          key={name}
                          name={name}
                          type={organizeBy}
                          groups={[...data.pooled, ...data.owned]}
                          onOpen={() => setSelectedGroup(name)}
                        />
                      ))}
                    </Grid>
                  ) : displayType === "items" ? (
                    renderGroup(groupItems(items))
                  ) : (
                    <>
                      {Object.entries(organizedItems)
                        .filter(([name]) => name === selectedGroup)
                        .map(([name, data]) => (
                          <Box key={name}>
                            <Heading
                              size="md"
                              mb={6}
                              color="ui.hover"
                              textTransform="uppercase"
                              letterSpacing="widest"
                            >
                              {[...data.pooled, ...data.owned][0]?.[0]
                                ?.item_type === "book"
                                ? "Books"
                                : "Items"}{" "}
                              {organizeBy === "author"
                                ? "by"
                                : organizeBy === "genre"
                                  ? "in"
                                  : "on"}{" "}
                              {name}
                              {data.pooled.length + data.owned.length > 1 &&
                                ` (${data.pooled.length + data.owned.length})`}
                            </Heading>

                            {renderGroup([...data.pooled, ...data.owned])}
                          </Box>
                        ))}
                    </>
                  )}
                </VStack>
              )}

              {/* Community Collections Section (Libraries) */}
              {!selectedGroup &&
                communityCollections?.data &&
                communityCollections.data.length > 0 && (
                  <Box mt={8}>
                    <Heading size="md" mb={4}>
                      Community Collections
                    </Heading>
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

              <ItemDetailModal
                item={selectedItem}
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
              />
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
                              aria-label={
                                member.friendship_status === "ACCEPTED"
                                  ? "Already Friends"
                                  : member.friendship_status === "PENDING"
                                    ? "Friend Request Pending"
                                    : "Add Friend"
                              }
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
              {isAdmin && (
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
              )}

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
