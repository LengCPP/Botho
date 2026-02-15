// ============================================================================
// IMPORTS
// ============================================================================

import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  GridItem,
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
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { isPast, isToday } from "date-fns"
import { useCallback, useEffect, useMemo, useState } from "react"
import { FaChevronLeft } from "react-icons/fa"
import {
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
  FiShield,
  FiTrash2,
  FiUserCheck,
  FiUserMinus,
  FiUserPlus,
  FiUsers,
  FiX,
} from "react-icons/fi"
import { z } from "zod"

// Services
import { CommunitiesService, FriendsService, LoansService } from "@/client"

// Components
import ConfirmationModal from "@/components/Common/ConfirmationModal"
import ForgiveModal from "@/components/Common/ForgiveModal"
import ReviewModal from "@/components/Common/ReviewModal"
import InviteFriend from "@/components/Communities/InviteFriend"
import AddItem from "@/components/Items/AddItem"
import { CollectionGrid } from "@/components/Items/CollectionGrid"
import { CompactItemCard } from "@/components/Items/CompactItemCard"
import { ExtensionRequestModal } from "@/components/Items/ExtensionRequestModal"
import ItemCard from "@/components/Items/ItemCard"
import { ItemDetailModal } from "@/components/Items/ItemDetailModal"
import { ItemsViewOptions } from "@/components/Items/ItemsViewOptions"
import { LoanCard } from "@/components/Items/LoanCard"
import { LoanRequestModal } from "@/components/Items/LoanRequestModal"
import { ManageItems } from "@/components/Items/ManageItems"
import PendingItems from "@/components/Pending/PendingItems"
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

// Hooks
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"

// Utilities
import { groupItems } from "@/utils"

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTIONS_LIMIT = 12

// Search schema
const searchSchema = z.object({
  tab: z
    .enum(["board", "items", "members", "loans", "settings", "manage-items"])
    .catch("board"),
  q: z.string().optional(),
  page: z.number().catch(1),
  limit: z.number().catch(() => Number(localStorage.getItem("limit")) || 8),
  sort_by: z
    .string()
    .catch(() => localStorage.getItem("sort_by") || "created_at"),
  sort_order: z
    .string()
    .catch(() => localStorage.getItem("sort_order") || "desc"),
  category: z.string().optional(),
  genre: z.string().optional(),
  view_mode: z
    .enum(["card", "list"])
    .catch(() => (localStorage.getItem("view_mode") as any) || "card"),
  display_type: z
    .enum(["items", "collections"])
    .catch(
      () => (localStorage.getItem("display_type") as any) || "collections",
    ),
  subject: z.string().optional(),
  author: z.string().optional(),
  organize_by: z
    .enum(["subject", "genre", "category", "author", "ownership"])
    .catch(() => (localStorage.getItem("organize_by") as any) || "subject"),
})

// ============================================================================
// ROUTE SETUP
// ============================================================================

export const Route = createFileRoute("/_layout/communities/$communityId")({
  component: CommunityBoard,
  validateSearch: (s) => searchSchema.parse(s),
})

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function CommunityBoard() {
  // Route params and search
  const { communityId: cId } = Route.useParams()
  const {
    tab,
    q: qP,
    limit,
    sort_by,
    sort_order,
    category,
    genre,
    view_mode,
    display_type,
    subject,
    author,
    organize_by,
  } = Route.useSearch()

  // Hooks
  const { user: currU } = useAuth()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: Route.fullPath })

  // Local state
  const [msg, setMsg] = useState("")
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false)
  const [removeMember, setRemoveMember] = useState<any>(null)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [selectedLoan, setSelectedLoan] = useState<any>(null)
  const [selectedLoanForForgive, setSelectedLoanForForgive] =
    useState<any>(null)
  const [selectedItemForLoan, setSelectedItemForLoan] = useState<any>(null)
  const [selectedLoanForExtension, setSelectedLoanForExtension] =
    useState<any>(null)

  const [confirmConfig, setConfirmConfig] = useState<{
    title: string
    message: string
    onConfirm: () => void
    isLoading: boolean
  } | null>(null)

  // Derived state
  const isFiltered = !!subject || !!author || !!category || !!genre
  const currentFilter = subject || author || genre || category || "Unknown"

  // ========================================================================
  // EFFECTS
  // ========================================================================

  // Save view preferences to localStorage
  useEffect(() => {
    Object.entries({
      view_mode,
      display_type,
      organize_by,
      sort_by,
      sort_order,
      limit,
    }).forEach(([key, value]) => {
      localStorage.setItem(key, String(value))
    })
  }, [view_mode, display_type, organize_by, sort_by, sort_order, limit])

  // ========================================================================
  // NAVIGATION HELPERS
  // ========================================================================

  const updateSearch = useCallback(
    (params: any) =>
      navigate({
        search: (prev: any) => ({
          ...prev,
          ...params,
          page: 1,
        }),
      }),
    [navigate],
  )

  const handleOrganizeClick = (name: string) =>
    updateSearch(
      organize_by === "author"
        ? { author: name }
        : organize_by === "genre"
          ? { genre: name }
          : organize_by === "category"
            ? { category: name }
            : { subject: name },
    )

  // ========================================================================
  // QUERIES
  // ========================================================================

  // Community data
  const { data: comm, isLoading: isLoadingCommunity } = useQuery({
    queryKey: ["community", cId],
    queryFn: () =>
      CommunitiesService.readCommunity({
        id: cId,
      }) as Promise<any>,
    initialData: () => {
      const communities =
        queryClient.getQueryData<any>(["communities"])?.data || []
      return communities.find((c: any) => c.id === cId)
    },
  })

  // Permission flags
  const isMember = comm?.current_user_status === "ACCEPTED"
  const isAdmin =
    (!!comm?.created_by && !!currU?.id && comm.created_by === currU.id) ||
    !!currU?.is_superuser ||
    comm?.current_user_role === "ADMIN"
  const isStaff = isAdmin || comm?.current_user_role === "MODERATOR"

  // Community members
  const { data: members, isLoading: isLoadingMembers } = useQuery({
    queryKey: ["communityMembers", cId],
    queryFn: () =>
      CommunitiesService.readCommunityMembers({
        id: cId,
        status: "ACCEPTED" as any,
      }),
    enabled: !!isMember,
  })

  const otherAdminsExist = useMemo(
    () =>
      members?.data?.some(
        (m: any) => m.community_role === "ADMIN" && m.id !== currU?.id,
      ) || false,
    [members, currU],
  )

  // Pending applicants
  const { data: apps, isLoading: isLoadingApplicants } = useQuery({
    queryKey: ["communityApplicants", cId],
    queryFn: () =>
      CommunitiesService.readCommunityMembers({
        id: cId,
        status: "PENDING" as any,
      }),
    enabled: !!isStaff,
  })

  // Invited users
  const { data: invited, isLoading: isLoadingInvited } = useQuery({
    queryKey: ["communityInvited", cId],
    queryFn: () =>
      CommunitiesService.readCommunityMembers({
        id: cId,
        status: "INVITED" as any,
      }),
    enabled: !!isStaff,
  })

  // Items (infinite scroll)
  const {
    data: commI,
    isLoading: isLoadingItems,
    fetchNextPage: fetchNextItems,
    hasNextPage: hasNextItems,
    isFetchingNextPage: isFetchingNextItems,
  } = useInfiniteQuery({
    queryKey: [
      "communityItemsInfinite",
      cId,
      { sort_by, sort_order, limit, category, genre, author, q: qP },
    ],
    queryFn: ({ pageParam = 0 }) =>
      CommunitiesService.readCommunityItems({
        id: cId,
        skip: pageParam as number,
        limit,
        sortBy: sort_by,
        sortOrder: sort_order,
        category,
        genre,
        author,
        q: qP,
        excludeLost: true,
        excludePrivate: true,
      } as any),
    getNextPageParam: (last, all) => {
      const loaded = all.length * limit
      return loaded < last.count ? loaded : undefined
    },
    initialPageParam: 0,
    enabled:
      !!isMember && tab === "items" && (isFiltered || display_type === "items"),
  })

  // Facets/collections (infinite scroll)
  const {
    data: facets,
    isLoading: isLoadingFacets,
    fetchNextPage: fetchNextFacets,
    hasNextPage: hasNextFacets,
    isFetchingNextPage: isFetchingNextFacets,
  } = useInfiniteQuery({
    queryKey: ["communityFacetsInfinite", cId, organize_by, qP],
    queryFn: ({ pageParam = 0 }) =>
      (CommunitiesService as any).readCommunityItemFacets({
        id: cId,
        groupBy: organize_by,
        q: qP,
        skip: pageParam,
        limit: COLLECTIONS_LIMIT,
      }),
    getNextPageParam: (last: any, all) => {
      const loaded = all.length * COLLECTIONS_LIMIT
      return loaded < (last.count || 0) ? loaded : undefined
    },
    initialPageParam: 0,
    enabled:
      !!isMember &&
      tab === "items" &&
      display_type === "collections" &&
      !isFiltered,
  })

  // Outgoing loans
  useQuery({
    queryKey: ["loans", "outgoing"],
    queryFn: () => LoansService.readOutgoingLoanRequests({}),
    enabled: !!currU && isMember && tab === "items",
  })

  // Community loans
  const { data: commL, isLoading: isLoadingLoans } = useQuery({
    queryKey: ["communityLoans", cId],
    queryFn: () =>
      CommunitiesService.readCommunityLoans({
        id: cId,
      }),
    enabled: !!isMember,
  })

  // Announcements
  const { data: ann, isLoading: isLoadingAnnouncements } = useQuery({
    queryKey: ["communityAnnouncements", cId],
    queryFn: () =>
      CommunitiesService.readCommunityAnnouncements({
        id: cId,
      }),
    enabled: !!isMember,
  })

  // Messages
  const { data: msgs, isLoading: isLoadingMessages } = useQuery({
    queryKey: ["communityMessages", cId],
    queryFn: () =>
      CommunitiesService.readCommunityMessages({
        id: cId,
      }),
    enabled: !!isMember,
  })

  // ========================================================================
  // COMPUTED
  // ========================================================================

  // Loan categorization
  const { overdueLoans, dueTodayLoans, restActiveLoans, activeLoan } =
    useMemo(() => {
      const loans =
        commL?.data.filter((l: any) =>
          [
            "ACCEPTED",
            "ACTIVE",
            "RETURN_PENDING",
            "EXTENSION_PENDING",
          ].includes(l.status),
        ) || []

      return {
        overdueLoans: loans.filter(
          (l: any) =>
            isPast(new Date(l.end_date)) && !isToday(new Date(l.end_date)),
        ),
        dueTodayLoans: loans.filter((l: any) => isToday(new Date(l.end_date))),
        restActiveLoans: loans.filter(
          (l: any) =>
            !isPast(new Date(l.end_date)) && !isToday(new Date(l.end_date)),
        ),
        activeLoan: loans,
      }
    }, [commL])

  const pendingLoan = useMemo(
    () =>
      commL?.data.filter((l: any) =>
        ["PENDING", "EXTENSION_PENDING"].includes(l.status),
      ) || [],
    [commL],
  )

  const auditTrailLoan = useMemo(
    () =>
      commL?.data.filter((l: any) =>
        ["REJECTED", "CANCELLED", "RETURNED", "DEFAULTED"].includes(l.status),
      ) || [],
    [commL],
  )

  // ========================================================================
  // MUTATIONS
  // ========================================================================

  const postMessageMutation = useMutation({
    mutationFn: (content: string) =>
      CommunitiesService.createCommunityMessage({
        id: cId,
        requestBody: { content },
      }),
    onSuccess: () => {
      setMsg("")
      queryClient.invalidateQueries({
        queryKey: ["communityMessages", cId],
      })
    },
    onError: () => showErrorToast("Failed"),
  })

  const toggleNotificationsMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      CommunitiesService.updateCommunityNotifications({
        id: cId,
        enabled,
      }),
    onSuccess: (data) => {
      showSuccessToast(data.message)
      queryClient.invalidateQueries({
        queryKey: ["community", cId],
      })
    },
    onError: () => showErrorToast("Failed"),
  })

  const updateMemberMutation = useMutation({
    mutationFn: (data: any) =>
      CommunitiesService.updateCommunityMemberRole({
        id: cId,
        userId: data.userId,
        requestBody: {
          role: data.role,
          status: data.status,
        },
      }),
    onSuccess: () => {
      showSuccessToast("Updated")
      ;["communityMembers", "communityApplicants"].forEach((key) =>
        queryClient.invalidateQueries({
          queryKey: [key, cId],
        }),
      )
    },
    onError: () => showErrorToast("Failed"),
  })

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      CommunitiesService.leaveCommunity({
        id: cId,
        userId,
      }),
    onSuccess: () => {
      showSuccessToast("Removed")
      setIsRemoveModalOpen(false)
      setRemoveMember(null)
      ;["communityMembers", "communityApplicants"].forEach((key) =>
        queryClient.invalidateQueries({
          queryKey: [key, cId],
        }),
      )
    },
    onError: () => showErrorToast("Failed"),
  })

  const leaveCommunityMutation = useMutation({
    mutationFn: () => CommunitiesService.leaveCommunity({ id: cId }),
    onSuccess: () => {
      showSuccessToast("Left")
      queryClient.invalidateQueries({
        queryKey: ["communities"],
      })
      navigate({ to: "/communities" })
    },
    onError: () => showErrorToast("Failed"),
  })

  const joinMutation = useMutation({
    mutationFn: () => CommunitiesService.joinCommunity({ id: cId }),
    onSuccess: (data) => {
      showSuccessToast(data.message)
      queryClient.invalidateQueries({
        queryKey: ["community", cId],
      })
    },
    onError: () => showErrorToast("Failed to join"),
  })

  const createFriendRequestMutation = useMutation({
    mutationFn: (friendId: string) =>
      FriendsService.createFriendRequest({ friendId }),
    onSuccess: () => {
      showSuccessToast("Sent!")
      queryClient.invalidateQueries({
        queryKey: ["communityMembers", cId],
      })
    },
    onError: () => showErrorToast("Failed"),
  })

  const actionMutation = useMutation({
    mutationFn: async ({
      loan,
      action,
      params,
    }: { loan: any; action: string; params?: any }) => {
      switch (action) {
        case "cancel":
          return LoansService.cancelLoan({ id: loan.id })
        case "respond":
          return LoansService.respondToLoanRequest({
            id: loan.id,
            accept: params.accept,
          })
        case "ratify":
          return LoansService.ratifyLoan({ id: loan.id })
        case "return":
          return LoansService.returnLoan({ id: loan.id })
        case "extension":
          return LoansService.respondToExtensionRequest({
            id: loan.id,
            accept: params.accept,
          })
        case "remind":
          return LoansService.sendReturnReminder({ id: loan.id })
        case "default":
          return LoansService.markLoanDefaulted({ id: loan.id })
        case "signalReturn":
          return LoansService.signalReturn({ id: loan.id })
        default:
          throw new Error("Unknown action")
      }
    },
    onSuccess: (data, variables) => {
      showSuccessToast("Action completed successfully")
      queryClient.invalidateQueries({ queryKey: ["communityLoans", cId] })
      setConfirmConfig(null)
      if (variables.action === "return") {
        setSelectedLoan(variables.loan)
      }
      if (variables.action === "signalReturn") {
        setSelectedLoan(data)
      }
    },
  })

  // ========================================================================
  // DATA TRANSFORMATIONS
  // ========================================================================

  const allItems = useMemo(
    () => commI?.pages.flatMap((p) => p.data) || [],
    [commI],
  )

  const allCollections = useMemo(() => {
    if (qP || !comm?.collection_index?.[organize_by]) {
      return facets?.pages.flatMap((p: any) => p.data) || []
    }
    return Object.entries(comm.collection_index[organize_by])
      .map(([name, data]: any) => ({
        name,
        count: data.count,
        sample_images: data.sample_images,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [comm, organize_by, facets, qP])

  // ========================================================================
  // RENDER HELPERS
  // ========================================================================

  const renderItemGrid = (items: any[]) => (
    <SimpleGrid
      columns={view_mode === "list" ? 1 : { base: 2, sm: 3, md: 4 }}
      gap={view_mode === "list" ? 2 : { base: 2, md: 6 }}
    >
      {items.map((x: any) =>
        view_mode === "list" ? (
          <CompactItemCard
            key={x[0].id}
            item={x}
            communityId={cId}
            isAdmin={isAdmin}
            onShowDetails={() => setSelectedItem(x[0])}
            onReview={setSelectedLoan}
            onLoanRequest={(i) => setSelectedItemForLoan(i)}
            onExtensionRequest={(l) => setSelectedLoanForExtension(l)}
          />
        ) : (
          <ItemCard
            key={x[0].id}
            item={x}
            communityId={cId}
            isAdmin={isAdmin}
            onShowDetails={() => setSelectedItem(x[0])}
            onReview={setSelectedLoan}
            onLoanRequest={(i) => setSelectedItemForLoan(i)}
            onExtensionRequest={(l) => setSelectedLoanForExtension(l)}
          />
        ),
      )}
    </SimpleGrid>
  )

  const handleAction = (loan: any, action: any, params?: any) => {
    if (action === "forgive") {
      setSelectedLoanForForgive(loan)
      return
    }

    const config = {
      cancel: {
        title: "Cancel Request",
        message: `Cancel request for '${loan.item.title}'?`,
      },
      respond: {
        title: params?.accept ? "Accept Request" : "Reject Request",
        message: `${params?.accept ? "Accept" : "Reject"} request for '${
          loan.item.title
        }'?`,
      },
      ratify: {
        title: "Confirm Receipt",
        message: `Confirm you have received '${loan.item.title}'?`,
      },
      return: {
        title: "Confirm Return",
        message:
          loan.status === "RETURN_PENDING"
            ? `Confirm return of '${loan.item.title}'?`
            : `Mark '${loan.item.title}' as returned?`,
      },
      extension: {
        title: params?.accept ? "Accept Extension" : "Reject Extension",
        message: `${params?.accept ? "Accept" : "Reject"} extension for '${
          loan.item.title
        }'?`,
      },
      remind: {
        title: "Send Reminder",
        message: `Send return reminder for '${loan.item.title}'?`,
      },
      default: {
        title: "Mark Unrecoverable",
        message: `Mark '${loan.item.title}' as lost? This will penalize the borrower's honor score significantly.`,
      },
    }[action as keyof typeof config]

    if (!config) return

    setConfirmConfig({
      ...config,
      isLoading: actionMutation.isPending,
      onConfirm: () => actionMutation.mutate({ loan, action, params }),
    })
  }

  // ========================================================================
  // EARLY RETURNS
  // ========================================================================

  if (isLoadingCommunity) {
    return (
      <Container maxW="full" pt={12}>
        <Text>Loading...</Text>
      </Container>
    )
  }

  if (!comm) {
    return (
      <Container maxW="full" pt={12}>
        <Text>Not found</Text>
      </Container>
    )
  }

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <Container maxW="full">
      <VStack align="stretch" gap={6} pt={8}>
        {/* Header */}
        <Flex align="center" gap={4} wrap="wrap" justify="space-between">
          <VStack align="start" gap={1}>
            <Heading size="xl">{comm.name}</Heading>
            <HStack>
              <Badge colorPalette={comm.is_private ? "gray" : "main"}>
                {comm.is_private ? "Private" : "Global"}
              </Badge>
              <Badge colorPalette={comm.requires_approval ? "red" : "green"}>
                {comm.requires_approval ? "Closed" : "Open"}
              </Badge>
            </HStack>
          </VStack>

          <HStack gap={2}>
            {isMember ? (
              <>
                <InviteFriend communityId={cId} communityName={comm.name} />
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    toggleNotificationsMutation.mutate(
                      !comm.notifications_enabled,
                    )
                  }
                  loading={toggleNotificationsMutation.isPending}
                >
                  {comm.notifications_enabled ? (
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
                    loading={leaveCommunityMutation.isPending}
                  >
                    <FiLogOut /> Leave
                  </Button>
                )}
              </>
            ) : (
              <Button
                size="sm"
                colorPalette="accent"
                onClick={() => joinMutation.mutate()}
                loading={joinMutation.isPending}
                disabled={comm.current_user_status === "PENDING"}
              >
                {comm.current_user_status === "INVITED"
                  ? "Accept Invitation"
                  : comm.current_user_status === "PENDING"
                    ? "Application Pending"
                    : comm.requires_approval
                      ? "Request to Join"
                      : "Join Community"}
              </Button>
            )}
          </HStack>
        </Flex>

        <Text color="fg.muted" fontSize="lg">
          {comm.description || "No description."}
        </Text>

        {!isMember && (
          <Box
            p={10}
            textAlign="center"
            borderWidth="1px"
            rounded="md"
            bg="bg.muted"
          >
            <Text fontSize="lg" mb={4}>
              You are not a member of this community.
            </Text>
            {comm.is_private && comm.current_user_status !== "INVITED" ? (
              <Text color="red.500">
                This is a private community. You can only join via invitation.
              </Text>
            ) : (
              <Button
                colorPalette="accent"
                onClick={() => joinMutation.mutate()}
                loading={joinMutation.isPending}
                disabled={comm.current_user_status === "PENDING"}
              >
                {comm.current_user_status === "INVITED"
                  ? "Join Now"
                  : comm.requires_approval
                    ? "Apply to Join"
                    : "Join Now"}
              </Button>
            )}
          </Box>
        )}

        <Separator />

        {/* Tabs */}
        {isMember && (
          <Tabs.Root
            value={tab}
            onValueChange={(e) =>
              navigate({
                search: (p: any) => ({
                  ...p,
                  tab: e.value as any,
                }),
              })
            }
            variant="enclosed"
          >
            <Tabs.List
              display={{ base: "grid", md: "flex" }}
              gridTemplateColumns={{
                base: "repeat(3, 1fr)",
                md: "none",
              }}
              gap={{ base: 1, md: 0 }}
            >
              <Tabs.Trigger value="board" justifyContent="center">
                <FiMessageSquare /> Board
              </Tabs.Trigger>

              <Tabs.Trigger value="items" justifyContent="center">
                <FiBox /> Items ({comm?.collection_index?.total ?? 0})
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
                <Tabs.Trigger value="settings" justifyContent="center">
                  <FiShield /> Settings
                </Tabs.Trigger>
              )}

              {isAdmin && (
                <Tabs.Trigger value="manage-items" justifyContent="center">
                  <FiSettings /> Manage Items
                </Tabs.Trigger>
              )}
            </Tabs.List>

            {/* Board Tab */}
            <Tabs.Content value="board" pt={6}>
              <SimpleGrid columns={{ base: 1, md: 3 }} gap={8}>
                {/* Announcements */}
                <Box>
                  <VStack align="stretch" gap={4}>
                    <Flex justify="space-between" align="center">
                      <Heading size="md">Announcements</Heading>

                      {isAdmin && <AddAnnouncementModal communityId={cId} />}
                    </Flex>

                    <Box
                      maxH="400px"
                      overflowY="auto"
                      css={{
                        "&::-webkit-scrollbar": {
                          display: "none",
                        },
                        scrollbarWidth: "none",
                      }}
                    >
                      <VStack align="stretch" gap={3}>
                        {isLoadingAnnouncements ? (
                          <Text>...</Text>
                        ) : !ann?.data.length ? (
                          <Text fontStyle="italic">No announcements.</Text>
                        ) : (
                          ann.data.map((a: any) => (
                            <AnnouncementItem key={a.id} ann={a} />
                          ))
                        )}
                      </VStack>
                    </Box>
                  </VStack>
                </Box>

                {/* Messages */}
                <GridItem colSpan={{ base: 1, md: 2 }}>
                  <VStack align="stretch" gap={4}>
                    <Heading size="md">Messages</Heading>

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
                          <Text>...</Text>
                        ) : !msgs?.data.length ? (
                          <Text fontStyle="italic">No messages.</Text>
                        ) : (
                          msgs.data.map((m: any) => (
                            <MessageItem
                              key={m.id}
                              msg={m}
                              communityId={cId}
                              isStaff={isStaff}
                              currentUser={currU}
                              queryClient={queryClient}
                            />
                          ))
                        )}
                      </VStack>
                    </Box>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (msg.trim()) {
                          postMessageMutation.mutate(msg)
                        }
                      }}
                    >
                      <Flex gap={2}>
                        <Input
                          placeholder="Type a message..."
                          value={msg}
                          onChange={(e) => setMsg(e.target.value)}
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
                </GridItem>
              </SimpleGrid>
            </Tabs.Content>

            {/* Items Tab */}
            <Tabs.Content value="items" pt={6}>
              <VStack align="stretch" gap={8}>
                {isAdmin && (
                  <DonationManagement
                    items={allItems}
                    communityId={cId}
                    otherAdminsExist={otherAdminsExist}
                    currentUserId={currU?.id}
                  />
                )}

                {/* Controls */}
                <Flex
                  justify="space-between"
                  align="center"
                  wrap="wrap"
                  gap={4}
                >
                  <HStack gap={4} align="baseline">
                    <AddItem communityId={cId} isAdmin={isAdmin} />
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateSearch({ tab: "manage-items" })}
                      >
                        <FiSettings /> Manage Items
                      </Button>
                    )}
                  </HStack>

                  <ItemsViewOptions
                    q={qP}
                    onChangeQ={(v) => updateSearch({ q: v })}
                    viewMode={view_mode}
                    onChangeViewMode={(m) =>
                      updateSearch({
                        view_mode: m,
                      })
                    }
                    displayType={display_type}
                    onChangeDisplayType={(t) =>
                      updateSearch({
                        display_type: t,
                        subject: undefined,
                      })
                    }
                    sortBy={sort_by}
                    onChangeSortBy={(v) =>
                      updateSearch({
                        sort_by: v,
                      })
                    }
                    sortOrder={sort_order}
                    onChangeSortOrder={(v) =>
                      updateSearch({
                        sort_order: v,
                      })
                    }
                    limit={limit}
                    onChangeLimit={(v) => updateSearch({ limit: v })}
                    category={category}
                    onChangeCategory={(v) =>
                      updateSearch({
                        category: v,
                        genre: undefined,
                      })
                    }
                    genre={genre}
                    onChangeGenre={(v) => updateSearch({ genre: v })}
                    organizeBy={organize_by}
                    onChangeOrganizeBy={(v) =>
                      updateSearch({
                        organize_by: v,
                        subject: undefined,
                      })
                    }
                    showDisplayToggle
                    showViewToggle
                    showFilter
                    showSort
                    showLimit
                    organizeOptions={[
                      "subject",
                      "genre",
                      "category",
                      "author",
                      ...(isAdmin ? ["ownership"] : []),
                    ]}
                  />
                </Flex>

                {/* Content */}
                {(isLoadingItems && !allItems.length) ||
                (isLoadingFacets && !allCollections.length) ? (
                  <PendingItems />
                ) : !allItems.length && !allCollections.length ? (
                  <Box
                    p={10}
                    textAlign="center"
                    borderWidth="1px"
                    borderStyle="dashed"
                    rounded="md"
                  >
                    <Text color="fg.muted">
                      {qP ? "No matches." : "Empty pool."}
                    </Text>
                  </Box>
                ) : (
                  <Box mt={8}>
                    {display_type === "collections" && !isFiltered ? (
                      <Box>
                        <CollectionGrid
                          items={allCollections}
                          type={organize_by}
                          onOpen={handleOrganizeClick}
                        />

                        {hasNextFacets && (
                          <Flex justify="center" mt={8}>
                            <Button
                              variant="ghost"
                              colorPalette="accent"
                              onClick={() => fetchNextFacets()}
                              loading={isFetchingNextFacets}
                            >
                              Load More Collections
                            </Button>
                          </Flex>
                        )}
                      </Box>
                    ) : (
                      <Box>
                        {display_type === "collections" && isFiltered && (
                          <VStack align="start" mb={6} gap={2}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                updateSearch({
                                  subject: undefined,
                                  author: undefined,
                                  genre: undefined,
                                  category: undefined,
                                })
                              }
                            >
                              <FaChevronLeft /> Collections
                            </Button>

                            <Heading
                              size="lg"
                              color="ui.hover"
                              textTransform="uppercase"
                            >
                              {allItems[0]?.item_type === "book"
                                ? "Books"
                                : "Items"}{" "}
                              {currentFilter.toLowerCase() === "others"
                                ? `with unspecified ${organize_by}`
                                : `${
                                    organize_by === "author"
                                      ? "by"
                                      : organize_by === "genre"
                                        ? "in"
                                        : organize_by === "category"
                                          ? "in category"
                                          : "on"
                                  } ${currentFilter}`}{" "}
                              ({commI?.pages[0]?.count})
                            </Heading>
                          </VStack>
                        )}

                        <VStack align="stretch" gap={8}>
                          {renderItemGrid(groupItems(allItems, false))}

                          {hasNextItems && (
                            <Flex justify="center">
                              <Button
                                variant="ghost"
                                colorPalette="accent"
                                onClick={() => fetchNextItems()}
                                loading={isFetchingNextItems}
                              >
                                Load More Items
                              </Button>
                            </Flex>
                          )}
                        </VStack>
                      </Box>
                    )}
                  </Box>
                )}
              </VStack>

              <ItemDetailModal
                item={selectedItem}
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
              />
            </Tabs.Content>

            {/* Members Tab */}
            <Tabs.Content value="members" pt={6}>
              <SimpleGrid
                columns={{
                  base: 1,
                  md: 2,
                  lg: 3,
                }}
                gap={4}
              >
                {isLoadingMembers ? (
                  <Text>...</Text>
                ) : (
                  members?.data
                    .filter(
                      (m: any) =>
                        m.community_status === "ACCEPTED" ||
                        (isStaff &&
                          ["PENDING", "INVITED"].includes(m.community_status)),
                    )
                    .map((m: any) => (
                      <Box
                        key={m.id}
                        p={4}
                        borderWidth="1px"
                        rounded="md"
                        bg="bg.panel"
                        _hover={{
                          borderColor: "ui.hover",
                        }}
                      >
                        <Flex justify="space-between" align="center">
                          <VStack align="start" gap={0}>
                            <HStack>
                              <Text fontWeight="bold">
                                {m.full_name || m.email}
                              </Text>
                              {m.community_status !== "ACCEPTED" && (
                                <Badge
                                  size="xs"
                                  colorPalette="orange"
                                  variant="outline"
                                >
                                  {m.community_status}
                                </Badge>
                              )}
                            </HStack>

                            <Badge
                              size="xs"
                              colorPalette={
                                m.community_role === "ADMIN"
                                  ? "purple"
                                  : m.community_role === "MODERATOR"
                                    ? "main"
                                    : "gray"
                              }
                            >
                              {m.community_role || "MEMBER"}
                            </Badge>
                          </VStack>

                          <Flex gap={2}>
                            {m.id !== currU?.id && (
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() =>
                                  !m.friendship_status &&
                                  createFriendRequestMutation.mutate(m.id)
                                }
                                colorPalette={
                                  m.friendship_status === "PENDING"
                                    ? "accent"
                                    : m.friendship_status === "ACCEPTED"
                                      ? "green"
                                      : "gray"
                                }
                                disabled={!!m.friendship_status}
                              >
                                {m.friendship_status === "ACCEPTED" ? (
                                  <FiUserCheck />
                                ) : (
                                  <FiUserPlus />
                                )}
                              </Button>
                            )}

                            <Link to={`/users/${m.id}`}>
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

            {/* Loans Tab (Admin) */}
            {isStaff && isAdmin && (
              <Tabs.Content value="loans" pt={6}>
                <VStack align="stretch" gap={4}>
                  <Tabs.Root defaultValue="requests" variant="plain">
                    <Tabs.List gap={8} mb={6} borderBottomWidth="1px" pb={2}>
                      {[
                        {
                          v: "requests",
                          l: "Requests",
                          c: pendingLoan.length,
                        },
                        {
                          v: "active",
                          l: "Active",
                          c: activeLoan.length,
                        },
                        {
                          v: "audit",
                          l: "Audit",
                          c: auditTrailLoan.length,
                        },
                      ].map((t) => (
                        <Tabs.Trigger
                          key={t.v}
                          value={t.v}
                          _selected={{
                            color: "ui.hover",
                            borderBottom: "2px solid",
                            borderColor: "ui.hover",
                          }}
                        >
                          <Heading size="md">
                            {t.l} ({t.c})
                          </Heading>
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>

                    {[
                      {
                        v: "requests",
                        d: pendingLoan,
                      },
                      {
                        v: "active",
                        d: activeLoan,
                      },
                      {
                        v: "audit",
                        d: auditTrailLoan,
                      },
                    ].map((t) => (
                      <Tabs.Content key={t.v} value={t.v}>
                        {isLoadingLoans ? (
                          <Text>...</Text>
                        ) : !t.d.length ? (
                          <Box
                            p={8}
                            textAlign="center"
                            borderWidth="1px"
                            borderRadius="lg"
                            borderStyle="dashed"
                          >
                            <Text fontStyle="italic">Empty.</Text>
                          </Box>
                        ) : t.v === "active" ? (
                          <VStack align="stretch" gap={8}>
                            {overdueLoans.length > 0 && (
                              <Box>
                                <Heading
                                  size="sm"
                                  mb={4}
                                  color="red.500"
                                  display="flex"
                                  alignItems="center"
                                  gap={2}
                                >
                                  Overdue ({overdueLoans.length})
                                </Heading>
                                <VStack align="stretch" gap={4}>
                                  {overdueLoans.map((l: any) => (
                                    <LoanCard
                                      key={l.id}
                                      loan={l}
                                      type="incoming"
                                      onReview={setSelectedLoan}
                                      onAction={handleAction}
                                    />
                                  ))}
                                </VStack>
                              </Box>
                            )}
                            {dueTodayLoans.length > 0 && (
                              <Box>
                                <Heading
                                  size="sm"
                                  mb={4}
                                  color="orange.500"
                                  display="flex"
                                  alignItems="center"
                                  gap={2}
                                >
                                  Due Today ({dueTodayLoans.length})
                                </Heading>
                                <VStack align="stretch" gap={4}>
                                  {dueTodayLoans.map((l: any) => (
                                    <LoanCard
                                      key={l.id}
                                      loan={l}
                                      type="incoming"
                                      onReview={setSelectedLoan}
                                      onAction={handleAction}
                                    />
                                  ))}
                                </VStack>
                              </Box>
                            )}
                            {restActiveLoans.length > 0 && (
                              <Box>
                                <Heading
                                  size="sm"
                                  mb={4}
                                  color="blue.500"
                                  display="flex"
                                  alignItems="center"
                                  gap={2}
                                >
                                  Other Active ({restActiveLoans.length})
                                </Heading>
                                <VStack align="stretch" gap={4}>
                                  {restActiveLoans.map((l: any) => (
                                    <LoanCard
                                      key={l.id}
                                      loan={l}
                                      type="incoming"
                                      onReview={setSelectedLoan}
                                      onAction={handleAction}
                                    />
                                  ))}
                                </VStack>
                              </Box>
                            )}
                          </VStack>
                        ) : (
                          <VStack align="stretch" gap={4}>
                            {t.d.map((l: any) => (
                              <LoanCard
                                key={l.id}
                                loan={l}
                                type="incoming"
                                onReview={setSelectedLoan}
                                onAction={handleAction}
                              />
                            ))}
                          </VStack>
                        )}
                      </Tabs.Content>
                    ))}
                  </Tabs.Root>
                </VStack>
              </Tabs.Content>
            )}

            {/* Settings Tab (Staff) */}
            {isStaff && (
              <Tabs.Content value="settings" pt={6}>
                <VStack align="stretch" gap={8}>
                  {/* Pending Applicants */}
                  {!isLoadingApplicants && (apps?.data?.length ?? 0) > 0 ? (
                    <Box>
                      <Heading size="md" mb={4} color="ui.hover">
                        Pending ({apps?.count})
                      </Heading>

                      <VStack align="stretch" gap={3}>
                        {apps?.data?.map((m: any) => (
                          <Flex
                            key={m.id}
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
                                {m.full_name || m.email}
                              </Text>

                              <Badge size="xs" colorPalette="yellow">
                                APPLICANT
                              </Badge>
                            </VStack>

                            <HStack gap={2}>
                              <Button
                                size="xs"
                                colorPalette="green"
                                onClick={() =>
                                  updateMemberMutation.mutate({
                                    userId: m.id,
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
                                    userId: m.id,
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
                  ) : null}

                  {/* Members List */}
                  <Box>
                    <Heading size="md" mb={4}>
                      Members
                    </Heading>

                    {isLoadingMembers ? (
                      <Text>...</Text>
                    ) : (
                      <VStack align="stretch" gap={3}>
                        {members?.data
                          .filter((m: any) => m.community_status === "ACCEPTED")
                          .map((m: any) => {
                            const isCreator = m.id === comm.created_by
                            const role =
                              m.community_role ||
                              (isCreator ? "ADMIN" : "MEMBER")
                            const isStaffMember =
                              role === "ADMIN" || role === "MODERATOR"

                            return (
                              <Flex
                                key={m.id}
                                justify="space-between"
                                align="center"
                                p={4}
                                borderWidth="1px"
                                rounded="md"
                                bg="bg.panel"
                              >
                                <VStack align="start" gap={0}>
                                  <Text fontWeight="bold">
                                    {m.full_name || m.email}
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
                                    {role}
                                  </Badge>
                                </VStack>

                                <HStack gap={2}>
                                  {!isCreator && m.id !== currU?.id && (
                                    <>
                                      {isAdmin && (
                                        <MenuRoot>
                                          <MenuTrigger asChild>
                                            <Button size="xs" variant="outline">
                                              <FiSettings /> Role
                                            </Button>
                                          </MenuTrigger>

                                          <MenuContent>
                                            {[
                                              "ADMIN",
                                              "MODERATOR",
                                              "MEMBER",
                                            ].map((roleValue) => (
                                              <MenuItem
                                                key={roleValue}
                                                value={roleValue}
                                                onClick={() =>
                                                  updateMemberMutation.mutate({
                                                    userId: m.id,
                                                    role: roleValue,
                                                  })
                                                }
                                                disabled={role === roleValue}
                                              >
                                                {roleValue}
                                              </MenuItem>
                                            ))}
                                          </MenuContent>
                                        </MenuRoot>
                                      )}

                                      {(isAdmin ||
                                        (isStaff && !isStaffMember)) && (
                                        <Button
                                          size="xs"
                                          colorPalette="red"
                                          variant="outline"
                                          onClick={() => {
                                            setRemoveMember({
                                              id: m.id,
                                              name: m.full_name || m.email,
                                            })
                                            setIsRemoveModalOpen(true)
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
            )}

            {/* Manage Items Tab (Admin) */}
            {isAdmin && (
              <Tabs.Content value="manage-items" pt={6}>
                <ManageItems ownerId={cId} communityId={cId} />
              </Tabs.Content>
            )}
          </Tabs.Root>
        )}
      </VStack>

      {/* Modals */}
      <ConfirmationModal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        onConfirm={() => leaveCommunityMutation.mutate()}
        title="Leave"
        message="Leave community?"
        isLoading={leaveCommunityMutation.isPending}
      />

      <ConfirmationModal
        isOpen={isRemoveModalOpen}
        onClose={() => {
          setIsRemoveModalOpen(false)
          setRemoveMember(null)
        }}
        onConfirm={() => removeMemberMutation.mutate(removeMember!.id)}
        title="Remove"
        message={`Remove ${removeMember?.name}?`}
        isLoading={removeMemberMutation.isPending}
      />

      {selectedLoan && (
        <ReviewModal
          loan={selectedLoan}
          isOpen={!!selectedLoan}
          onClose={() => setSelectedLoan(null)}
        />
      )}

      {selectedLoanForForgive && (
        <ForgiveModal
          loan={selectedLoanForForgive}
          isOpen={!!selectedLoanForForgive}
          onClose={() => setSelectedLoanForForgive(null)}
        />
      )}

      {selectedItemForLoan && (
        <LoanRequestModal
          item={selectedItemForLoan}
          isOpen={!!selectedItemForLoan}
          onClose={() => setSelectedItemForLoan(null)}
          community={comm}
        />
      )}

      {selectedLoanForExtension && (
        <ExtensionRequestModal
          loanId={selectedLoanForExtension.id}
          itemTitle={selectedLoanForExtension.item.title}
          currentEndDate={selectedLoanForExtension.end_date}
          isOpen={!!selectedLoanForExtension}
          onClose={() => setSelectedLoanForExtension(null)}
        />
      )}

      {confirmConfig && (
        <ConfirmationModal
          isOpen={!!confirmConfig}
          onClose={() => setConfirmConfig(null)}
          onConfirm={confirmConfig.onConfirm}
          title={confirmConfig.title}
          message={confirmConfig.message}
          isLoading={actionMutation.isPending}
        />
      )}
    </Container>
  )
}

// ============================================================================
// ADD ANNOUNCEMENT MODAL
// ============================================================================

function AddAnnouncementModal({
  communityId,
}: {
  communityId: string
}) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const isMobile = useBreakpointValue({
    base: true,
    md: false,
  })

  const mutation = useMutation({
    mutationFn: () =>
      CommunitiesService.createCommunityAnnouncement({
        id: communityId,
        requestBody: { title, content },
      }),
    onSuccess: () => {
      showSuccessToast("Posted!")
      setTitle("")
      setContent("")
      setIsOpen(false)
      queryClient.invalidateQueries({
        queryKey: ["communityAnnouncements", communityId],
      })
    },
    onError: () => showErrorToast("Failed"),
  })

  return (
    <DialogRoot open={isOpen} onOpenChange={(e) => setIsOpen(e.open)}>
      <DialogTrigger asChild>
        <Button size="sm" colorPalette="accent" variant="outline">
          <FiPlus /> {isMobile ? "Announce" : "Add Announcement"}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Announcement</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <VStack gap={4}>
            <Field label="Title" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>

            <Field label="Content" required>
              <Textarea
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

// ============================================================================
// ANNOUNCEMENT ITEM
// ============================================================================

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

          <Text fontSize="2xs" color="fg.subtle" fontWeight="bold">
            Posted by {ann.author.full_name || ann.author.email}
          </Text>
        </VStack>
      )}
    </Box>
  )
}

// ============================================================================
// MESSAGE ITEM
// ============================================================================

function MessageItem({
  msg,
  communityId,
  isStaff,
  currentUser,
  queryClient,
}: any) {
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editedContent, setEditedContent] = useState(msg.content)
  const { showErrorToast } = useCustomToast()

  const isAuthor = msg.author_id === currentUser?.id

  const deleteMessageMutation = useMutation({
    mutationFn: () =>
      CommunitiesService.deleteCommunityMessage({
        id: communityId,
        messageId: msg.id,
      }),
    onSuccess: () => {
      setIsDeleting(false)
      queryClient.invalidateQueries({
        queryKey: ["communityMessages", communityId],
      })
    },
    onError: () => showErrorToast("Failed"),
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
    onError: () => showErrorToast("Failed"),
  })

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
                onClick={() => setIsDeleting(true)}
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
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
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
              onClick={() =>
                editedContent.trim() &&
                updateMessageMutation.mutate(editedContent)
              }
              loading={updateMessageMutation.isPending}
            >
              <FiCheck />
            </Button>
          </HStack>
        </VStack>
      ) : (
        <Text fontSize="sm">{msg.content}</Text>
      )}

      <ConfirmationModal
        isOpen={isDeleting}
        onClose={() => setIsDeleting(false)}
        onConfirm={() => deleteMessageMutation.mutate()}
        title="Delete"
        message="Delete message?"
        isLoading={deleteMessageMutation.isPending}
      />
    </Box>
  )
}

// ============================================================================
// DONATION MANAGEMENT
// ============================================================================

function DonationManagement({
  items,
  communityId,
  otherAdminsExist,
  currentUserId,
}: {
  items: any[]
  communityId: string
  otherAdminsExist: boolean
  currentUserId?: string
}) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const pendingDonations = items.filter((i: any) => i.is_donation_pending)

  const ratifyDonationMutation = useMutation({
    mutationFn: (itemId: string) =>
      CommunitiesService.ratifyDonation({
        id: communityId,
        itemId,
      }),
    onSuccess: () => {
      showSuccessToast("Donation ratified!")
      queryClient.invalidateQueries({ queryKey: ["communityItems", communityId] })
      queryClient.invalidateQueries({ queryKey: ["community", communityId] })
    },
    onError: () => showErrorToast("Failed to ratify donation"),
  })

  if (!pendingDonations.length) return null

  return (
    <Box p={4} borderWidth="1px" borderColor="ui.hover" rounded="md" bg="bg.panel">
      <Heading size="md" mb={4}>
        Pending Donations
      </Heading>
      <VStack align="stretch" gap={3}>
        {pendingDonations.map((item: any) => {
          const isDonor = item.added_by_id === currentUserId
          const canRatify = !isDonor || !otherAdminsExist

          return (
            <Flex key={item.id} justify="space-between" align="center">
              <HStack gap={3}>
                {item.image_url && <Image src={item.image_url} h="40px" />}
                <VStack align="start" gap={0}>
                  <Text fontWeight="bold">{item.title}</Text>
                  <Text fontSize="xs" color="fg.muted">
                    {isDonor ? "Your donation" : "Member donation"}
                  </Text>
                </VStack>
              </HStack>
              <Button
                size="xs"
                colorPalette="green"
                onClick={() => ratifyDonationMutation.mutate(item.id)}
                loading={ratifyDonationMutation.isPending}
                disabled={!canRatify}
                title={!canRatify ? "Another admin must ratify your donation" : ""}
              >
                Ratify
              </Button>
            </Flex>
          )
        })}
      </VStack>
    </Box>
  )
}

export default CommunityBoard
