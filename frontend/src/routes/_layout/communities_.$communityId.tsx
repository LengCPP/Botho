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
  Image,
  Input,
  Separator,
  SimpleGrid,
  Tabs,
  Text,
  Textarea,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react"
import { Tooltip } from "@/components/ui/tooltip"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { formatDistanceToNow, isPast, isToday } from "date-fns"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  FiBell,
  FiBellOff,
  FiBook,
  FiBox,
  FiCheck,
  FiClock,
  FiEdit2,
  FiList,
  FiLogOut,
  FiMapPin,
  FiMessageSquare,
  FiPlus,
  FiSend,
  FiSettings,
  FiShield,
  FiSlash,
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
import { ExtensionRequestModal } from "@/components/Items/ExtensionRequestModal"
import { ItemDetailModal } from "@/components/Items/ItemDetailModal"
import { ItemsBrowser } from "@/components/Items/ItemsBrowser"
import { LoanCard } from "@/components/Items/LoanCard"
import { LoanRequestModal } from "@/components/Items/LoanRequestModal"
import { ManageItems } from "@/components/Items/ManageItems"
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
  owner_filter: z.string().optional(),
  item_type: z.string().optional(),
  organize_by: z
    .enum(["subject", "genre", "category", "author", "ownership"])
    .catch(() => (localStorage.getItem("organize_by") as any) || "subject"),
})

// ============================================================================
// ROUTE SETUP
// ============================================================================

export const Route = createFileRoute("/_layout/communities_/$communityId")({
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
    owner_filter,
    item_type,
    organize_by,
  } = Route.useSearch()

  // Hooks
  const { user: currU } = useAuth()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: Route.fullPath })

  // Local state
  const [msg, setMsg] = useState("")
  const [showRules, setShowRules] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [isEditRulesOpen, setIsEditRulesOpen] = useState(false)
  const [rulesText, setRulesText] = useState("")
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

  // Governance modals
  const [suspendTarget, setSuspendTarget] = useState<any>(null)
  const [banTarget, setBanTarget] = useState<any>(null)
  const [banReason, setBanReason] = useState("")
  const [isBanModalOpen, setIsBanModalOpen] = useState(false)
  const [isResignModalOpen, setIsResignModalOpen] = useState(false)
  const [isDisbandModalOpen, setIsDisbandModalOpen] = useState(false)
  const [isDisbandVoteModalOpen, setIsDisbandVoteModalOpen] = useState(false)
  const [memberActionConfig, setMemberActionConfig] = useState<{
    title: string
    message: string
    onConfirm: () => void
  } | null>(null)
  const [allowedTypesEdit, setAllowedTypesEdit] = useState<string[] | null | undefined>(undefined)

  // Derived state
  const isFiltered = !!subject || !!author || !!category || !!genre || !!owner_filter

  // ========================================================================
  // EFFECTS
  // ========================================================================

  // Save view preferences to localStorage
  useEffect(() => {
    for (const [key, value] of Object.entries({
      view_mode,
      display_type,
      organize_by,
      sort_by,
      sort_order,
      limit,
    })) {
      localStorage.setItem(key, String(value))
    }
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

  const handleOrganizeClick = (name: string, iType?: string, ownerId?: string) =>
    updateSearch({
      item_type: iType,
      author: organize_by === "author" ? name : undefined,
      genre: organize_by === "genre" ? name : undefined,
      category: organize_by === "category" ? name : undefined,
      subject: organize_by === "subject" ? name : undefined,
      owner_filter: organize_by === "ownership" ? ownerId : undefined,
    })

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
      const cached = queryClient.getQueryData<any>(["communitiesInfinite"])
      const communities = cached?.pages?.flatMap((p: any) => p.data) || []
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

  // Community members (ACCEPTED for general display; all statuses for staff settings)
  const { data: members, isLoading: isLoadingMembers } = useQuery({
    queryKey: ["communityMembers", cId],
    queryFn: () =>
      CommunitiesService.readCommunityMembers({
        id: cId,
        status: "ACCEPTED" as any,
      }),
    enabled: !!isMember,
  })

  // Staff view: also load banned/suspended members
  const { data: bannedSuspended } = useQuery({
    queryKey: ["communityMembersBannedSuspended", cId],
    queryFn: async () => {
      const [banned, suspended] = await Promise.all([
        CommunitiesService.readCommunityMembers({ id: cId, status: "BANNED" as any }),
        CommunitiesService.readCommunityMembers({ id: cId, status: "SUSPENDED" as any }),
      ])
      return {
        data: [...(banned.data ?? []), ...(suspended.data ?? [])],
        count: (banned.count ?? 0) + (suspended.count ?? 0),
      }
    },
    enabled: !!isStaff,
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
      { sort_by, sort_order, limit, category, genre, subject, author, owner_filter, item_type, q: qP },
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
        subject,
        author,
        ownerFilter: owner_filter,
        itemType: item_type,
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

  // Community log
  const { data: logData } = useQuery({
    queryKey: ["communityLog", cId],
    queryFn: () => CommunitiesService.readCommunityLog({ id: cId, limit: 50 }),
    enabled: !!isMember && showLog,
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
          suspension_until: data.suspension_until,
          action_reason: data.action_reason,
        } as any,
      }),
    onSuccess: () => {
      showSuccessToast("Updated")
      for (const key of ["communityMembers", "communityApplicants"]) {
        queryClient.invalidateQueries({
          queryKey: [key, cId],
        })
      }
    },
    onError: (e: any) => showErrorToast(e?.body?.detail || "Failed"),
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
      for (const key of ["communityMembers", "communityApplicants"]) {
        queryClient.invalidateQueries({
          queryKey: [key, cId],
        })
      }
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

  // Admin count for guard checks
  const adminCount = useMemo(
    () => members?.data?.filter((m: any) => m.community_role === "ADMIN").length ?? 0,
    [members],
  )
  const myRole = comm?.current_user_role ?? null
  const isLastAdmin = myRole === "ADMIN" && adminCount === 1

  // Disband vote status
  const { data: disbandVote, refetch: refetchDisbandVote } = useQuery({
    queryKey: ["disbandVote", cId],
    queryFn: () =>
      fetch(`/api/v1/communities/${cId}/disband-vote`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
      }).then((r) => (r.ok ? r.json() : null)),
    enabled: !!isAdmin && !!isMember,
  })

  const castDisbandVoteMutation = useMutation({
    mutationFn: (vote: boolean) =>
      fetch(`/api/v1/communities/${cId}/disband-vote?vote=${vote}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
      }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data?.message?.includes("disbanded")) {
        showSuccessToast("Community disbanded")
        navigate({ to: "/communities" })
      } else if (data?.message?.includes("cancelled")) {
        showSuccessToast("Vote withdrawn")
        refetchDisbandVote()
      } else {
        showSuccessToast("Vote cast")
        refetchDisbandVote()
      }
    },
    onError: () => showErrorToast("Failed"),
  })

  const resignMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/communities/${cId}/resign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
      }).then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.detail || "Failed")
        return data
      }),
    onSuccess: () => {
      showSuccessToast("Resigned successfully")
      queryClient.invalidateQueries({ queryKey: ["community", cId] })
      queryClient.invalidateQueries({ queryKey: ["communityMembers", cId] })
    },
    onError: (e: any) => showErrorToast(e.message || "Failed"),
  })

  const castDemotionVoteMutation = useMutation({
    mutationFn: ({ userId, vote }: { userId: string; vote: boolean }) =>
      fetch(`/api/v1/communities/${cId}/members/${userId}/demotion-vote?vote=${vote}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
      }).then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.detail || "Failed")
        return data
      }),
    onSuccess: (data) => {
      if (data?.message) {
        showSuccessToast(data.message)
      } else {
        showSuccessToast("Vote cast")
      }
      queryClient.invalidateQueries({ queryKey: ["communityMembers", cId] })
    },
    onError: (e: any) => showErrorToast(e.message || "Failed"),
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

  const updateRulesMutation = useMutation({
    mutationFn: (rules: string | null) =>
      CommunitiesService.updateCommunityRules({ id: cId, requestBody: { rules } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community", cId] })
      setIsEditRulesOpen(false)
      showSuccessToast("Rules updated")
    },
    onError: () => showErrorToast("Failed to update rules"),
  })

  // Item pool requests (admin only)
  const { data: itemRequests, isLoading: isLoadingItemRequests } = useQuery({
    queryKey: ["communityItemRequests", cId],
    queryFn: () => CommunitiesService.getCommunityItemRequests({ id: cId }),
    enabled: !!isAdmin && tab === "items",
  })

  const approveItemRequestMutation = useMutation({
    mutationFn: (requestId: string) =>
      CommunitiesService.approveItemRequest({ id: cId, requestId }),
    onSuccess: () => {
      showSuccessToast("Request approved")
      queryClient.invalidateQueries({ queryKey: ["communityItemRequests", cId] })
      queryClient.invalidateQueries({ queryKey: ["communityItemsInfinite", cId] })
    },
    onError: () => showErrorToast("Failed to approve"),
  })

  const rejectItemRequestMutation = useMutation({
    mutationFn: (requestId: string) =>
      CommunitiesService.rejectItemRequest({ id: cId, requestId }),
    onSuccess: () => {
      showSuccessToast("Request rejected")
      queryClient.invalidateQueries({ queryKey: ["communityItemRequests", cId] })
    },
    onError: () => showErrorToast("Failed to reject"),
  })

  const updateSettingsMutation = useMutation({
    mutationFn: (allowedTypes: string[] | null) =>
      CommunitiesService.updateCommunitySettings({
        id: cId,
        requestBody: { allowed_item_types: allowedTypes },
      }),
    onSuccess: () => {
      showSuccessToast("Settings saved")
      queryClient.invalidateQueries({ queryKey: ["community", cId] })
    },
    onError: () => showErrorToast("Failed to save settings"),
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

  const allCollections = useMemo(
    () => facets?.pages.flatMap((p: any) => p.data) || [],
    [facets],
  )

  // ========================================================================
  // RENDER HELPERS
  // ========================================================================

  const handleAction = (loan: any, action: string, params?: any) => {
    if (action === "forgive") {
      setSelectedLoanForForgive(loan)
      return
    }

    const configs: Record<string, { title: string; message: string }> = {
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
    }

    const config = configs[action]

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
                {isAdmin && (
                  <Tooltip
                    content={
                      isLastAdmin
                        ? "Promote another admin before leaving"
                        : undefined
                    }
                  >
                    <Button
                      size="xs"
                      variant="outline"
                      colorPalette="red"
                      disabled={isLastAdmin}
                      onClick={() => setIsLeaveModalOpen(true)}
                      loading={leaveCommunityMutation.isPending}
                    >
                      <FiLogOut /> Leave
                    </Button>
                  </Tooltip>
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

        {/* Rules panel */}
        {(comm.rules || isStaff) && (
          <Box>
            <HStack gap={2}>
              {comm.rules ? (
                <Button size="xs" variant="ghost" onClick={() => setShowRules(r => !r)}>
                  <FiList size="12px" /> {showRules ? "Hide Rules" : "Show Rules"}
                </Button>
              ) : isStaff ? (
                <Button size="xs" variant="ghost" onClick={() => { setRulesText(""); setIsEditRulesOpen(true) }}>
                  <FiPlus size="12px" /> Add Rules
                </Button>
              ) : null}
              {isStaff && comm.rules && (
                <Button size="xs" variant="ghost" onClick={() => { setRulesText(comm.rules ?? ""); setIsEditRulesOpen(true) }}>
                  <FiEdit2 size="12px" /> Edit Rules
                </Button>
              )}
            </HStack>
            {showRules && comm.rules && (
              <Box mt={2} p={3} bg="bg.subtle" borderRadius="md" whiteSpace="pre-wrap">
                <Text fontSize="sm">{comm.rules}</Text>
              </Box>
            )}
          </Box>
        )}

        {/* Edit Rules dialog */}
        <DialogRoot open={isEditRulesOpen} onOpenChange={(e) => setIsEditRulesOpen(e.open)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Community Rules</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Textarea
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                rows={8}
                maxLength={5000}
                placeholder="Write your community rules here..."
              />
              <Text fontSize="xs" color="fg.muted" mt={1}>{rulesText.length}/5000</Text>
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsEditRulesOpen(false)}>Cancel</Button>
              <Button
                colorPalette="accent"
                onClick={() => updateRulesMutation.mutate(rulesText || null)}
                loading={updateRulesMutation.isPending}
              >
                Save
              </Button>
            </DialogFooter>
            <DialogCloseTrigger />
          </DialogContent>
        </DialogRoot>

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
                            <AnnouncementItem
                              key={a.id}
                              ann={a}
                              isAdmin={isAdmin}
                              communityId={cId}
                              queryClient={queryClient}
                            />
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
                              isAdmin={isAdmin}
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

              {/* Community Log */}
              <Box mt={6}>
                <Button size="xs" variant="ghost" onClick={() => setShowLog(l => !l)}>
                  <FiList size="12px" /> {showLog ? "Hide Activity Log" : "Show Activity Log"}
                </Button>
                {showLog && (
                  <Box mt={2} maxH="300px" overflowY="auto" borderWidth="1px" rounded="md" p={3} bg="bg.panel">
                    {!logData?.data?.length ? (
                      <Text fontSize="sm" color="fg.muted" fontStyle="italic">No activity yet.</Text>
                    ) : (
                      <VStack align="stretch" gap={2}>
                        {logData.data.map((entry: any) => (
                          <HStack key={entry.id} gap={2} align="start">
                            <Box pt="2px" color="fg.muted" flexShrink={0}>
                              {entry.event_type.startsWith("BOOK") ? <FiBook size="12px" /> :
                               entry.event_type === "RULES_UPDATED" ? <FiEdit2 size="12px" /> :
                               <FiUsers size="12px" />}
                            </Box>
                            <Box flex={1}>
                              <Text fontSize="xs">
                                {formatLogEntry(entry)}
                              </Text>
                              <Text fontSize="2xs" color="fg.subtle">
                                {entry.created_at ? formatDistanceToNow(new Date(entry.created_at), { addSuffix: true }) : ""}
                              </Text>
                            </Box>
                          </HStack>
                        ))}
                      </VStack>
                    )}
                  </Box>
                )}
              </Box>
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

                {/* Pending item pool requests banner (admin only) */}
                {isAdmin && !isLoadingItemRequests && (itemRequests?.data?.length ?? 0) > 0 && (
                  <Box
                    p={4}
                    borderWidth="1px"
                    borderColor="yellow.400"
                    borderRadius="md"
                    bg="yellow.subtle"
                  >
                    <Heading size="sm" mb={3} color="yellow.700">
                      {itemRequests!.data.length} pending item pool request{itemRequests!.data.length !== 1 ? "s" : ""}
                    </Heading>
                    <VStack align="stretch" gap={2}>
                      {itemRequests!.data.map((req: any) => (
                        <Flex
                          key={req.id}
                          justify="space-between"
                          align="center"
                          p={3}
                          borderWidth="1px"
                          rounded="md"
                          bg="bg.panel"
                        >
                          <VStack align="start" gap={0}>
                            <Text fontWeight="medium" fontSize="sm">{req.item_title}</Text>
                            <HStack gap={2}>
                              <Badge size="xs" colorPalette="purple">{req.item_type}</Badge>
                              <Text fontSize="xs" color="fg.muted">by {req.requester_name}</Text>
                            </HStack>
                          </VStack>
                          <HStack gap={2}>
                            <Button
                              size="xs"
                              colorPalette="green"
                              loading={approveItemRequestMutation.isPending}
                              onClick={() => approveItemRequestMutation.mutate(req.id)}
                            >
                              <FiCheck /> Approve
                            </Button>
                            <Button
                              size="xs"
                              colorPalette="red"
                              variant="outline"
                              loading={rejectItemRequestMutation.isPending}
                              onClick={() => rejectItemRequestMutation.mutate(req.id)}
                            >
                              <FiX /> Reject
                            </Button>
                          </HStack>
                        </Flex>
                      ))}
                    </VStack>
                  </Box>
                )}

                <ItemsBrowser
                  displayType={display_type}
                  viewMode={view_mode}
                  organizeBy={organize_by}
                  sortBy={sort_by}
                  sortOrder={sort_order}
                  limit={limit}
                  q={qP}
                  category={category}
                  genre={genre}
                  subject={subject}
                  author={author}
                  ownerFilter={owner_filter}
                  itemType={item_type}
                  typeBreakdown={(comm?.collection_index as any)?.item_type ?? {}}
                  onChangeItemType={(type) =>
                    updateSearch({
                      item_type: type,
                      subject: undefined,
                      category: undefined,
                      genre: undefined,
                      author: undefined,
                      owner_filter: undefined,
                      ...(type && type !== "book" ? { display_type: "items" } : {}),
                    })
                  }
                  items={groupItems(allItems as any)}
                  facets={allCollections}
                  totalItemCount={commI?.pages[0]?.count || 0}
                  totalFacetCount={(facets?.pages[0] as any)?.count || 0}
                  isLoading={
                    (isLoadingItems && !allItems.length) ||
                    (isLoadingFacets && !allCollections.length)
                  }
                  hasNextItems={hasNextItems}
                  hasNextFacets={hasNextFacets}
                  isFetchingNextItems={isFetchingNextItems}
                  isFetchingNextFacets={isFetchingNextFacets}
                  onChangeDisplayType={(t) =>
                    updateSearch({
                      display_type: t,
                      subject: undefined,
                      item_type: undefined,
                    })
                  }
                  onChangeViewMode={(m) => updateSearch({ view_mode: m })}
                  onChangeOrganizeBy={(v) =>
                    updateSearch({
                      organize_by: v,
                      subject: undefined,
                      owner_filter: undefined,
                      item_type: undefined,
                    })
                  }
                  onChangeSortBy={(v) => updateSearch({ sort_by: v })}
                  onChangeSortOrder={(v) => updateSearch({ sort_order: v })}
                  onChangeLimit={(v) => updateSearch({ limit: v })}
                  onChangeQ={(v) => updateSearch({ q: v })}
                  onChangeCategory={(v) =>
                    updateSearch({ category: v, genre: undefined })
                  }
                  onChangeGenre={(v) => updateSearch({ genre: v })}
                  onOpenCollection={handleOrganizeClick}
                  onClearDrilldown={() =>
                    updateSearch({
                      subject: undefined,
                      author: undefined,
                      genre: undefined,
                      category: undefined,
                      owner_filter: undefined,
                      item_type: undefined,
                    })
                  }
                  onFetchNextItems={fetchNextItems}
                  onFetchNextFacets={fetchNextFacets}
                  communityId={cId}
                  isAdmin={isAdmin}
                  onShowDetails={setSelectedItem}
                  onReview={setSelectedLoan}
                  onLoanRequest={setSelectedItemForLoan}
                  onExtensionRequest={setSelectedLoanForExtension}
                  organizeOptions={[
                    "subject",
                    "genre",
                    "category",
                    "author",
                    ...(isAdmin ? ["ownership"] : []),
                  ]}
                  leftSlot={
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
                  }
                  emptyMessage={qP ? "No matches." : "Empty pool."}
                />
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
                  {/* Allowed Item Types (admin only) */}
                  {isAdmin && (() => {
                    const typeIndex: Record<string, number> = (comm?.collection_index as any)?.item_type ?? {}
                    const knownTypes = ["book", "general", ...Object.keys(typeIndex).filter(t => t !== "book" && t !== "general")]
                    const current: string[] | null = allowedTypesEdit !== undefined
                      ? allowedTypesEdit
                      : (comm as any)?.allowed_item_types ?? null
                    const isAllAllowed = current === null
                    const toggleType = (slug: string) => {
                      const base: string[] = current ?? knownTypes
                      if (base.includes(slug)) {
                        setAllowedTypesEdit(base.filter(t => t !== slug))
                      } else {
                        setAllowedTypesEdit([...base, slug])
                      }
                    }
                    return (
                      <Box>
                        <Heading size="md" mb={4} color="ui.hover">
                          Allowed Item Types
                        </Heading>
                        <Text fontSize="sm" color="fg.muted" mb={3}>
                          Restrict which item types members can pool directly. Restricted types require admin approval.
                          Leave all enabled to allow all types.
                        </Text>
                        <VStack align="start" gap={2} mb={4}>
                          <HStack>
                            <input
                              type="checkbox"
                              id="allow-all"
                              checked={isAllAllowed}
                              onChange={(e) => {
                                if (e.target.checked) setAllowedTypesEdit(null)
                                else setAllowedTypesEdit(knownTypes)
                              }}
                            />
                            <label htmlFor="allow-all" style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                              All types allowed (no restrictions)
                            </label>
                          </HStack>
                          {!isAllAllowed && knownTypes.map((slug) => (
                            <HStack key={slug} ml={4}>
                              <input
                                type="checkbox"
                                id={`type-${slug}`}
                                checked={(current ?? []).includes(slug)}
                                onChange={() => toggleType(slug)}
                              />
                              <label htmlFor={`type-${slug}`} style={{ fontSize: "0.875rem" }}>
                                {slug}
                              </label>
                            </HStack>
                          ))}
                        </VStack>
                        <Button
                          size="sm"
                          colorPalette="accent"
                          loading={updateSettingsMutation.isPending}
                          onClick={() => updateSettingsMutation.mutate(current)}
                          disabled={allowedTypesEdit === undefined}
                        >
                          Save
                        </Button>
                        {allowedTypesEdit !== undefined && (
                          <Button
                            size="sm"
                            variant="ghost"
                            ml={2}
                            onClick={() => setAllowedTypesEdit(undefined)}
                          >
                            Cancel
                          </Button>
                        )}
                      </Box>
                    )
                  })()}

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
                        {[...(members?.data ?? []), ...(bannedSuspended?.data ?? [])]
                          .filter(
                            (m: any, idx: number, arr: any[]) =>
                              arr.findIndex((x: any) => x.id === m.id) === idx,
                          )
                          .map((m: any) => {
                            const isCreator = m.id === comm.created_by
                            const role =
                              m.community_role ||
                              (isCreator ? "ADMIN" : "MEMBER")
                            const isStaffMember =
                              role === "ADMIN" || role === "MODERATOR"
                            const isSelf = m.id === currU?.id
                            const status = m.community_status
                            const isBanned = status === "BANNED"
                            const isSuspended = status === "SUSPENDED"
                            const isActionedByAdmin =
                              m.action_by_role === "ADMIN"

                            return (
                              <Flex
                                key={m.id}
                                justify="space-between"
                                align="center"
                                p={4}
                                borderWidth="1px"
                                rounded="md"
                                bg={
                                  isBanned || isSuspended
                                    ? "red.subtle"
                                    : "bg.panel"
                                }
                                opacity={
                                  isBanned || isSuspended ? 0.85 : 1
                                }
                              >
                                <VStack align="start" gap={1}>
                                  <Text fontWeight="bold">
                                    {m.full_name || m.email}
                                  </Text>
                                  <HStack gap={1} wrap="wrap">
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
                                    {isBanned && (
                                      <Badge
                                        size="xs"
                                        colorPalette="red"
                                        variant="solid"
                                      >
                                        BANNED
                                      </Badge>
                                    )}
                                    {isSuspended && (
                                      <Badge
                                        size="xs"
                                        colorPalette="orange"
                                        variant="solid"
                                      >
                                        SUSPENDED
                                        {m.suspension_until
                                          ? ` until ${new Date(m.suspension_until).toLocaleDateString()}`
                                          : ""}
                                      </Badge>
                                    )}
                                  </HStack>
                                </VStack>

                                <HStack gap={2} flexWrap="wrap">
                                  {/* Lift ban/suspend */}
                                  {(isBanned || isSuspended) && !isSelf && (
                                    <Tooltip
                                      content={
                                        isActionedByAdmin && !isAdmin
                                          ? "Only an admin can lift this action"
                                          : undefined
                                      }
                                    >
                                      <Button
                                        size="xs"
                                        colorPalette="green"
                                        variant="outline"
                                        disabled={
                                          isActionedByAdmin && !isAdmin
                                        }
                                        onClick={() =>
                                          updateMemberMutation.mutate({
                                            userId: m.id,
                                            status: "ACCEPTED",
                                          })
                                        }
                                        loading={updateMemberMutation.isPending}
                                      >
                                        <FiCheck /> Lift
                                      </Button>
                                    </Tooltip>
                                  )}

                                  {/* Actions for ACCEPTED members only */}
                                  {status === "ACCEPTED" && !isSelf && !isCreator && (
                                    <>
                                      {/* Promote to ADMIN (admin only) */}
                                      {isAdmin && role !== "ADMIN" && (
                                        <MenuRoot>
                                          <MenuTrigger asChild>
                                            <Button size="xs" variant="outline">
                                              <FiSettings /> Role
                                            </Button>
                                          </MenuTrigger>
                                          <MenuContent>
                                            {role !== "ADMIN" && (
                                              <MenuItem
                                                value="ADMIN"
                                                onClick={() =>
                                                  setMemberActionConfig({
                                                    title: "Promote to Admin",
                                                    message: `Promote ${m.full_name || m.email} to Admin?`,
                                                    onConfirm: () => updateMemberMutation.mutate({ userId: m.id, role: "ADMIN" }),
                                                  })
                                                }
                                              >
                                                Promote to ADMIN
                                              </MenuItem>
                                            )}
                                            {role !== "MODERATOR" && (
                                              <MenuItem
                                                value="MODERATOR"
                                                onClick={() =>
                                                  setMemberActionConfig({
                                                    title: role === "ADMIN" ? "Demote to Moderator" : "Promote to Moderator",
                                                    message: role === "ADMIN"
                                                      ? `Demote ${m.full_name || m.email} to Moderator (requires vote)?`
                                                      : `Promote ${m.full_name || m.email} to Moderator?`,
                                                    onConfirm: () => updateMemberMutation.mutate({ userId: m.id, role: "MODERATOR" }),
                                                  })
                                                }
                                              >
                                                {role === "ADMIN"
                                                  ? "Demote to MODERATOR (vote)"
                                                  : "Promote to MODERATOR"}
                                              </MenuItem>
                                            )}
                                            {role !== "MEMBER" && role !== "ADMIN" && (
                                              <MenuItem
                                                value="MEMBER"
                                                onClick={() =>
                                                  setMemberActionConfig({
                                                    title: "Demote to Member",
                                                    message: `Demote ${m.full_name || m.email} to Member?`,
                                                    onConfirm: () => updateMemberMutation.mutate({ userId: m.id, role: "MEMBER" }),
                                                  })
                                                }
                                              >
                                                Demote to MEMBER
                                              </MenuItem>
                                            )}
                                          </MenuContent>
                                        </MenuRoot>
                                      )}

                                      {/* Initiate demotion vote (admin vs admin) */}
                                      {isAdmin && role === "ADMIN" && (
                                        <Button
                                          size="xs"
                                          variant="outline"
                                          colorPalette="orange"
                                          onClick={() =>
                                            setMemberActionConfig({
                                              title: "Vote to Demote",
                                              message: `Cast your vote to demote ${m.full_name || m.email} from Admin?`,
                                              onConfirm: () => castDemotionVoteMutation.mutate({ userId: m.id, vote: true }),
                                            })
                                          }
                                          loading={
                                            castDemotionVoteMutation.isPending
                                          }
                                        >
                                          Vote Demote
                                        </Button>
                                      )}

                                      {/* Suspend (admin or mod on non-staff) */}
                                      {(isAdmin ||
                                        (isStaff && !isStaffMember)) && (
                                        <Button
                                          size="xs"
                                          variant="outline"
                                          colorPalette="orange"
                                          onClick={() =>
                                            setSuspendTarget(m)
                                          }
                                        >
                                          <FiClock /> Suspend
                                        </Button>
                                      )}

                                      {/* Ban (admin or mod on non-staff) */}
                                      {(isAdmin ||
                                        (isStaff && !isStaffMember)) && (
                                        <Button
                                          size="xs"
                                          colorPalette="red"
                                          variant="outline"
                                          onClick={() => {
                                            setBanTarget(m)
                                            setBanReason("")
                                            setIsBanModalOpen(true)
                                          }}
                                        >
                                          <FiSlash /> Ban
                                        </Button>
                                      )}

                                      {/* Remove (admin only) */}
                                      {isAdmin && (
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

                  {/* Resign button for staff */}
                  {(myRole === "ADMIN" || myRole === "MODERATOR") && (
                    <Box pt={2}>
                      <Separator mb={6} />
                      <Heading size="sm" mb={3}>
                        My Position
                      </Heading>
                      <Tooltip
                        content={
                          isLastAdmin
                            ? "Cannot resign as the last admin. Promote another member first."
                            : undefined
                        }
                      >
                        <Button
                          variant="outline"
                          colorPalette="orange"
                          size="sm"
                          disabled={isLastAdmin}
                          onClick={() => setIsResignModalOpen(true)}
                        >
                          Resign Position
                        </Button>
                      </Tooltip>
                    </Box>
                  )}

                  {/* Disband section (admin only) */}
                  {isAdmin && (
                    <Box pt={2}>
                      <Separator mb={6} />
                      <Heading size="sm" mb={3} color="red.500">
                        Danger Zone
                      </Heading>
                      {adminCount === 1 ? (
                        <Button
                          colorPalette="red"
                          size="sm"
                          onClick={() => setIsDisbandModalOpen(true)}
                        >
                          Disband Community
                        </Button>
                      ) : (
                        <VStack align="start" gap={3}>
                          <Text fontSize="sm" color="fg.muted">
                            Disbanding requires all admins to vote yes. A single
                            no vote cancels the motion.
                          </Text>
                          {disbandVote && (
                            <Text fontSize="sm">
                              <strong>
                                {disbandVote.voted_ids?.length ?? 0}/
                                {disbandVote.total_admins}
                              </strong>{" "}
                              admins have voted to disband.
                            </Text>
                          )}
                          {disbandVote?.voted_ids?.includes(currU?.id) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                castDisbandVoteMutation.mutate(false)
                              }
                              loading={castDisbandVoteMutation.isPending}
                            >
                              Withdraw Vote
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              colorPalette="red"
                              onClick={() => setIsDisbandVoteModalOpen(true)}
                              loading={castDisbandVoteMutation.isPending}
                            >
                              Vote to Disband
                            </Button>
                          )}
                        </VStack>
                      )}
                    </Box>
                  )}
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

      {/* Ban modal */}
      {banTarget && (
        <ConfirmationModal
          isOpen={isBanModalOpen}
          onClose={() => {
            setIsBanModalOpen(false)
            setBanTarget(null)
          }}
          onConfirm={() => {
            updateMemberMutation.mutate({
              userId: banTarget.id,
              status: "BANNED",
              action_reason: banReason || undefined,
            })
            setIsBanModalOpen(false)
            setBanTarget(null)
          }}
          title="Ban Member"
          message={`Ban ${banTarget.full_name || banTarget.email} from this community?`}
          isLoading={updateMemberMutation.isPending}
          showCheckbox={false}
        />
      )}

      {/* Suspend dialog */}
      {suspendTarget && (
        <SuspendDialog
          member={suspendTarget}
          communityId={cId}
          isAdmin={isAdmin}
          onClose={() => setSuspendTarget(null)}
          onConfirm={(suspensionUntil: string, reason?: string) => {
            updateMemberMutation.mutate({
              userId: suspendTarget.id,
              status: "SUSPENDED",
              suspension_until: suspensionUntil,
              action_reason: reason,
            })
            setSuspendTarget(null)
          }}
          isLoading={updateMemberMutation.isPending}
        />
      )}

      {/* Resign modal */}
      <ConfirmationModal
        isOpen={isResignModalOpen}
        onClose={() => setIsResignModalOpen(false)}
        onConfirm={() => {
          resignMutation.mutate()
          setIsResignModalOpen(false)
        }}
        title="Resign Position"
        message="You will become a regular member. Continue?"
        isLoading={resignMutation.isPending}
      />

      {/* Disband modal (solo admin) */}
      <ConfirmationModal
        isOpen={isDisbandModalOpen}
        onClose={() => setIsDisbandModalOpen(false)}
        onConfirm={() => {
          castDisbandVoteMutation.mutate(true)
          setIsDisbandModalOpen(false)
        }}
        title="Disband Community"
        message={`Permanently disband "${comm?.name}"? This cannot be undone.`}
        isLoading={castDisbandVoteMutation.isPending}
        showCheckbox={false}
      />

      {/* Disband vote modal (multi-admin) */}
      <ConfirmationModal
        isOpen={isDisbandVoteModalOpen}
        onClose={() => setIsDisbandVoteModalOpen(false)}
        onConfirm={() => {
          castDisbandVoteMutation.mutate(true)
          setIsDisbandVoteModalOpen(false)
        }}
        title="Vote to Disband"
        message={`Cast your vote to disband "${comm?.name}"? All admins must vote yes for it to take effect.`}
        isLoading={castDisbandVoteMutation.isPending}
        showCheckbox={false}
      />

      {/* Promote/Demote/Vote-demote confirmation modal */}
      {memberActionConfig && (
        <ConfirmationModal
          isOpen={!!memberActionConfig}
          onClose={() => setMemberActionConfig(null)}
          onConfirm={() => {
            memberActionConfig.onConfirm()
            setMemberActionConfig(null)
          }}
          title={memberActionConfig.title}
          message={memberActionConfig.message}
          isLoading={updateMemberMutation.isPending || castDemotionVoteMutation.isPending}
          showCheckbox={false}
        />
      )}
    </Container>
  )
}

// ============================================================================
// LOG ENTRY FORMATTER
// ============================================================================

function formatLogEntry(entry: any): string {
  const { event_type, actor_name, target_name, extra } = entry
  switch (event_type) {
    case "BOOK_LOANED": return `${actor_name ?? "Community"} lent '${extra ?? "a book"}' to ${target_name ?? "a member"}`
    case "BOOK_RETURNED": return `${actor_name ?? "Member"} returned '${extra ?? "a book"}'`
    case "BOOK_DEFAULTED": return `${actor_name ?? "Member"} defaulted on '${extra ?? "a book"}'`
    case "BOOK_ADDED": return `${actor_name ?? "Member"} added '${extra ?? "a book"}' to the pool`
    case "BOOK_REMOVED": return `${actor_name ?? "Member"} removed '${extra ?? "a book"}' from the pool`
    case "MEMBER_JOINED": return `${actor_name ?? "Someone"} joined the community`
    case "MEMBER_LEFT": return `${actor_name ?? "Someone"} left the community`
    case "MEMBER_PROMOTED": return `${target_name ?? "Member"} was promoted to ${extra ?? "a role"} by ${actor_name ?? "staff"}`
    case "MEMBER_DEMOTED": return `${target_name ?? "Member"} was demoted${extra ? ` ${extra}` : ""} by ${actor_name ?? "staff"}`
    case "MEMBER_RESIGNED": return `${actor_name ?? "Staff"} resigned from ${extra ?? "a staff role"}`
    case "MEMBER_BANNED": return `${target_name ?? "Member"} was banned by ${actor_name ?? "staff"}`
    case "MEMBER_UNBANNED": return `${target_name ?? "Member"} was unbanned by ${actor_name ?? "staff"}`
    case "MEMBER_SUSPENDED": return `${target_name ?? "Member"} was suspended${extra ? ` ${extra}` : ""} by ${actor_name ?? "staff"}`
    case "MEMBER_UNSUSPENDED": return `${target_name ?? "Member"}'s suspension was lifted by ${actor_name ?? "system"}`
    case "RULES_UPDATED": return `Community rules were updated by ${actor_name ?? "staff"}`
    default: return `${event_type.replace(/_/g, " ").toLowerCase()}`
  }
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

function AnnouncementItem({
  ann,
  isAdmin,
  communityId,
  queryClient,
}: {
  ann: any
  isAdmin: boolean
  communityId: string
  queryClient: any
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editTitle, setEditTitle] = useState(ann.title)
  const [editContent, setEditContent] = useState(ann.content)
  const { showErrorToast } = useCustomToast()

  const wasEdited =
    ann.updated_at && ann.created_at && ann.updated_at !== ann.created_at

  const deleteAnnouncementMutation = useMutation({
    mutationFn: () =>
      CommunitiesService.deleteCommunityAnnouncement({
        id: communityId,
        announcementId: ann.id,
      }),
    onSuccess: () => {
      setIsDeleting(false)
      queryClient.invalidateQueries({
        queryKey: ["communityAnnouncements", communityId],
      })
    },
    onError: () => showErrorToast("Failed to delete announcement"),
  })

  const updateAnnouncementMutation = useMutation({
    mutationFn: () =>
      CommunitiesService.updateCommunityAnnouncement({
        id: communityId,
        announcementId: ann.id,
        requestBody: { title: editTitle, content: editContent },
      }),
    onSuccess: () => {
      setIsEditing(false)
      queryClient.invalidateQueries({
        queryKey: ["communityAnnouncements", communityId],
      })
    },
    onError: () => showErrorToast("Failed to update announcement"),
  })

  const pinAnnouncementMutation = useMutation({
    mutationFn: (is_pinned: boolean) =>
      CommunitiesService.pinCommunityAnnouncement({
        id: communityId,
        announcementId: ann.id,
        requestBody: { is_pinned },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["communityAnnouncements", communityId] }),
    onError: () => showErrorToast("Failed"),
  })

  return (
    <Box p={4} borderWidth="1px" rounded="md" bg="bg.panel" borderColor={ann.is_pinned ? "yellow.500" : isExpanded ? "ui.hover" : "border.subtle"} transition="all 0.2s">
      <Flex justify="space-between" align="center" gap={4} cursor="pointer" onClick={() => !isEditing && setIsExpanded(!isExpanded)}>
        <HStack gap={2} flex={1} minW={0}>
          {ann.is_pinned && <Badge colorPalette="yellow" variant="subtle" size="xs" flexShrink={0}>Pinned</Badge>}
          <Heading size="sm" lineClamp={isExpanded ? undefined : 1} flex={1}>
            {ann.title}
          </Heading>
        </HStack>

        <HStack gap={1} flexShrink={0}>
          {wasEdited && (
            <Text fontSize="2xs" color="fg.subtle" fontStyle="italic">
              edited
            </Text>
          )}
          <Text fontSize="2xs" color="fg.subtle" whiteSpace="nowrap">
            {new Date(ann.created_at).toLocaleDateString()}
          </Text>
          {isAdmin && !isEditing && (
            <HStack gap={0} onClick={(e) => e.stopPropagation()}>
              <Button
                size="2xs"
                variant="ghost"
                aria-label={ann.is_pinned ? "Unpin" : "Pin"}
                onClick={() => pinAnnouncementMutation.mutate(!ann.is_pinned)}
                loading={pinAnnouncementMutation.isPending}
              >
                <FiMapPin size="10px" style={{ fill: ann.is_pinned ? "currentColor" : "none" }} />
              </Button>
              <Button size="2xs" variant="ghost" onClick={() => { setIsExpanded(true); setIsEditing(true) }}>
                <FiEdit2 size="10px" />
              </Button>
              <Button size="2xs" variant="ghost" colorPalette="red" onClick={() => {
                if (localStorage.getItem(`skip_delete_announcement_${communityId}`)) {
                  deleteAnnouncementMutation.mutate()
                } else {
                  setIsDeleting(true)
                }
              }} loading={deleteAnnouncementMutation.isPending}>
                <FiTrash2 size="10px" />
              </Button>
            </HStack>
          )}
        </HStack>
      </Flex>

      {isExpanded && !isEditing && (
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

      {isEditing && (
        <VStack align="stretch" mt={4} gap={3} onClick={(e) => e.stopPropagation()}>
          <Separator />
          <Input
            size="sm"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Title"
          />
          <Textarea
            size="sm"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={4}
            placeholder="Content"
          />
          <HStack justify="flex-end" gap={2}>
            <Button size="xs" variant="ghost" onClick={() => { setIsEditing(false); setEditTitle(ann.title); setEditContent(ann.content) }}>
              <FiX />
            </Button>
            <Button
              size="xs"
              colorPalette="accent"
              onClick={() => editTitle.trim() && editContent.trim() && updateAnnouncementMutation.mutate()}
              loading={updateAnnouncementMutation.isPending}
            >
              <FiCheck />
            </Button>
          </HStack>
        </VStack>
      )}

      <ConfirmationModal
        isOpen={isDeleting}
        onClose={() => setIsDeleting(false)}
        onConfirm={(dontShowAgain) => {
          if (dontShowAgain) localStorage.setItem(`skip_delete_announcement_${communityId}`, "1")
          deleteAnnouncementMutation.mutate()
        }}
        title="Delete"
        message="Delete this announcement?"
        isLoading={deleteAnnouncementMutation.isPending}
      />
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
  isAdmin,
  currentUser,
  queryClient,
}: any) {
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editedContent, setEditedContent] = useState(msg.content)
  const { showErrorToast } = useCustomToast()

  const isAuthor = msg.author_id === currentUser?.id
  const wasEdited =
    msg.updated_at && msg.created_at && msg.updated_at !== msg.created_at

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

  const pinMessageMutation = useMutation({
    mutationFn: (is_pinned: boolean) =>
      CommunitiesService.pinCommunityMessage({
        id: communityId,
        messageId: msg.id,
        requestBody: { is_pinned },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["communityMessages", communityId] }),
    onError: () => showErrorToast("Failed"),
  })

  return (
    <Box p={3} bg={msg.is_pinned ? "yellow.subtle" : "bg.muted"} rounded="lg" borderWidth={msg.is_pinned ? "1px" : 0} borderColor="yellow.500">
      <Flex justify="space-between" align="baseline" mb={1}>
        <HStack gap={2} flexWrap="wrap">
          {msg.is_pinned && <Badge colorPalette="yellow" variant="subtle" size="xs">Pinned</Badge>}
          <Text fontWeight="bold" fontSize="xs" color="ui.hover">
            {msg.author.full_name || msg.author.email}
          </Text>

          {(isAuthor || isStaff) && !isEditing && (
            <HStack gap={1}>
              {isAdmin && (
                <Button
                  size="2xs"
                  variant="ghost"
                  aria-label={msg.is_pinned ? "Unpin" : "Pin"}
                  onClick={() => pinMessageMutation.mutate(!msg.is_pinned)}
                  loading={pinMessageMutation.isPending}
                >
                  <FiMapPin size="10px" style={{ fill: msg.is_pinned ? "currentColor" : "none" }} />
                </Button>
              )}
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
                  if (localStorage.getItem(`skip_delete_message_${communityId}`)) {
                    deleteMessageMutation.mutate()
                  } else {
                    setIsDeleting(true)
                  }
                }}
                loading={deleteMessageMutation.isPending}
              >
                <FiTrash2 size="10px" />
              </Button>
            </HStack>
          )}
        </HStack>

        <HStack gap={1}>
          {wasEdited && (
            <Text fontSize="2xs" color="fg.subtle" fontStyle="italic">
              edited
            </Text>
          )}
          <Text fontSize="2xs" color="fg.subtle">
            {new Date(msg.created_at).toLocaleString()}
          </Text>
        </HStack>
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
        onConfirm={(dontShowAgain) => {
          if (dontShowAgain) localStorage.setItem(`skip_delete_message_${communityId}`, "1")
          deleteMessageMutation.mutate()
        }}
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
      queryClient.invalidateQueries({
        queryKey: ["communityItems", communityId],
      })
      queryClient.invalidateQueries({ queryKey: ["community", communityId] })
    },
    onError: () => showErrorToast("Failed to ratify donation"),
  })

  if (!pendingDonations.length) return null

  return (
    <Box
      p={4}
      borderWidth="1px"
      borderColor="ui.hover"
      rounded="md"
      bg="bg.panel"
    >
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
                title={
                  !canRatify ? "Another admin must ratify your donation" : ""
                }
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

// ============================================================================
// SUSPEND DIALOG
// ============================================================================

function SuspendDialog({
  member,
  onClose,
  onConfirm,
  isLoading,
}: {
  member: any
  communityId: string
  isAdmin: boolean
  onClose: () => void
  onConfirm: (suspensionUntil: string, reason?: string) => void
  isLoading: boolean
}) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split("T")[0]

  const [until, setUntil] = useState(minDate)
  const [reason, setReason] = useState("")

  return (
    <DialogRoot open onOpenChange={(e) => !e.open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Suspend {member.full_name || member.email}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <VStack gap={4}>
            <Field label="Suspended until" required>
              <Input
                type="date"
                min={minDate}
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </Field>
            <Field label="Reason (optional)">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Reason for suspension..."
              />
            </Field>
          </VStack>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            colorPalette="orange"
            loading={isLoading}
            disabled={!until || until < minDate}
            onClick={() => onConfirm(new Date(until).toISOString(), reason || undefined)}
          >
            Suspend
          </Button>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default CommunityBoard
