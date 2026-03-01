import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Heading,
  IconButton,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { BsThreeDotsVertical } from "react-icons/bs"
import { FiShare2, FiUserCheck, FiUserMinus, FiUserPlus } from "react-icons/fi"
import { z } from "zod"

import {
  FriendsService,
  type ItemPublic,
  ItemsService,
  type LoanPublic,
  UsersService,
} from "@/client"
import ConfirmationModal from "@/components/Common/ConfirmationModal"
import ReviewModal from "@/components/Common/ReviewModal"
import { ExtensionRequestModal } from "@/components/Items/ExtensionRequestModal"
import { ItemDetailModal } from "@/components/Items/ItemDetailModal"
import { ItemsBrowser } from "@/components/Items/ItemsBrowser"
import { LoanRequestModal } from "@/components/Items/LoanRequestModal"
import UserInformation from "@/components/UserSettings/UserInformation"
import UserProfilePicture from "@/components/UserSettings/UserProfilePicture"
import { useColorModeValue } from "@/components/ui/color-mode"
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu"
import type { UserPublicExtended } from "@/customTypes"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { formatPublicId, groupItems, handleError } from "@/utils"

const userSearchSchema = z.object({
  page: z.number().catch(1),
  sort_by: z
    .string()
    .catch(() => localStorage.getItem("sort_by") || "created_at"),
  sort_order: z
    .string()
    .catch(() => localStorage.getItem("sort_order") || "desc"),
  limit: z.number().catch(() => {
    const stored = localStorage.getItem("limit")
    return stored && stored !== "undefined" ? Number(stored) : 8
  }),
  category: z.string().optional(),
  genre: z.string().optional(),
  view_mode: z
    .enum(["card", "list"])
    .catch(() => (localStorage.getItem("view_mode") as any) || "card"),
  display_type: z
    .enum(["items", "collections"])
    .catch(() => (localStorage.getItem("display_type") as any) || "items"),
  subject: z.string().optional(),
  author: z.string().optional(),
  organize_by: z
    .enum(["subject", "genre", "category", "author"])
    .catch(() => (localStorage.getItem("organize_by") as any) || "subject"),
  item_type: z.string().optional(),
  q: z.string().optional(),
})

const COLLECTIONS_LIMIT = 12

export const Route = createFileRoute("/_layout/users/$userId")({
  component: UserProfilePage,
  validateSearch: (search) => userSearchSchema.parse(search),
})

function UserProfilePage() {
  const { userId } = Route.useParams()
  const {
    sort_by,
    sort_order,
    limit,
    category,
    genre,
    view_mode,
    display_type,
    subject,
    author,
    organize_by,
    item_type,
    q,
  } = Route.useSearch()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [isRemoveFriendModalOpen, setIsRemoveFriendModalOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<ItemPublic | null>(null)
  const [selectedLoanForReview, setSelectedLoanForReview] =
    useState<LoanPublic | null>(null)
  const [selectedItemForLoan, setSelectedItemForLoan] =
    useState<ItemPublic | null>(null)
  const [selectedLoanForExtension, setSelectedLoanForExtension] =
    useState<LoanPublic | null>(null)

  useEffect(() => {
    localStorage.setItem("view_mode", view_mode)
    localStorage.setItem("display_type", display_type)
    localStorage.setItem("organize_by", organize_by)
    localStorage.setItem("sort_by", sort_by)
    localStorage.setItem("sort_order", sort_order)
    localStorage.setItem("limit", String(limit))
  }, [view_mode, display_type, organize_by, sort_by, sort_order, limit])

  const updateSearch = useCallback(
    (newParams: any) => {
      navigate({
        search: (prev: any) => ({ ...prev, ...newParams, page: 1 }),
      })
    },
    [navigate],
  )

  const handleOpenCollection = (name: string, iType?: string) => {
    const params: any = {
      subject: undefined,
      author: undefined,
      genre: undefined,
      category: undefined,
      item_type: iType,
    }
    if (organize_by === "subject") params.subject = name
    else if (organize_by === "author") params.author = name
    else if (organize_by === "genre") params.genre = name
    else if (organize_by === "category") params.category = name
    updateSearch(params)
  }

  const borderColor = useColorModeValue("accent.200", "gray.600")

  useEffect(() => {
    if (currentUser && currentUser.id === userId) {
      navigate({ to: "/profile", replace: true })
    }
  }, [currentUser, userId, navigate])

  const { data: user, isLoading: isLoadingUser } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => UsersService.readUserById({ userId }),
  })

  const isFriend = user?.friendship_status === "ACCEPTED"
  const canSeeAll = isFriend || currentUser?.is_superuser

  const {
    data: infiniteItems,
    isLoading: isLoadingItems,
    fetchNextPage: fetchNextItems,
    hasNextPage: hasNextItems,
    isFetchingNextPage: isFetchingNextItems,
  } = useInfiniteQuery({
    queryKey: [
      "userItemsInfinite",
      userId,
      {
        sort_by,
        sort_order,
        limit,
        category,
        genre,
        subject,
        author,
        item_type,
        q,
      },
    ],
    queryFn: ({ pageParam = 0 }) =>
      ItemsService.readItems({
        ownerId: userId,
        skip: pageParam as number,
        limit,
        sortBy: sort_by,
        sortOrder: sort_order,
        category,
        genre,
        subject,
        author,
        itemType: item_type as any,
        q,
        minimal: true,
      }),
    getNextPageParam: (last, all) => {
      const loaded = all.length * limit
      return loaded < last.count ? loaded : undefined
    },
    initialPageParam: 0,
    enabled:
      canSeeAll &&
      (!!subject ||
        !!author ||
        !!category ||
        !!genre ||
        display_type === "items"),
  })

  const {
    data: infiniteFacets,
    isLoading: isLoadingFacets,
    fetchNextPage: fetchNextFacets,
    hasNextPage: hasNextFacets,
    isFetchingNextPage: isFetchingNextFacets,
  } = useInfiniteQuery({
    queryKey: ["itemFacetsInfinite", userId, organize_by, q],
    queryFn: ({ pageParam = 0 }) =>
      ItemsService.readItemFacets({
        ownerId: userId,
        groupBy: organize_by,
        q,
        skip: pageParam as number,
        limit: COLLECTIONS_LIMIT,
      }),
    getNextPageParam: (last: any, all) => {
      const loaded = all.length * COLLECTIONS_LIMIT
      return loaded < (last.count || 0) ? loaded : undefined
    },
    initialPageParam: 0,
    enabled:
      canSeeAll &&
      display_type === "collections" &&
      !subject &&
      !author,
  })

  const friendMutation = useMutation({
    mutationFn: (userId: string) =>
      FriendsService.createFriendRequest({ friendId: userId }),
    onSuccess: () => {
      showSuccessToast("Friend request sent!")
      queryClient.invalidateQueries({ queryKey: ["user", userId] })
    },
    onError: () => showErrorToast("Failed to send friend request"),
  })

  const removeFriendMutation = useMutation({
    mutationFn: (userId: string) =>
      FriendsService.removeFriend({ friendId: userId }),
    onSuccess: () => {
      showSuccessToast("Friend removed")
      setIsRemoveFriendModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ["user", userId] })
      queryClient.invalidateQueries({ queryKey: ["friends"] })
    },
    onError: () => showErrorToast("Failed to remove friend"),
  })

  const handleCopyId = async () => {
    const formattedId = formatPublicId(user?.public_id)
    try {
      await navigator.clipboard.writeText(formattedId)
      showSuccessToast("User ID copied to clipboard!")
    } catch (err) {
      handleError({ message: "Failed to copy to clipboard" } as any)
    }
  }

  const allItems = useMemo(
    () => (infiniteItems?.pages.flatMap((p) => p.data as any[]) || []) as any[],
    [infiniteItems],
  )
  const allFacets = useMemo(
    () => infiniteFacets?.pages.flatMap((p) => (p as any).data) || [],
    [infiniteFacets],
  )
  const totalItemCount = (infiniteItems?.pages[0] as any)?.count || 0
  const totalFacetCount = (infiniteFacets?.pages[0] as any)?.count || 0

  if (isLoadingUser) return <Text p={4}>Loading profile...</Text>
  if (!user) return <Text p={4}>User not found</Text>

  return (
    <Container maxW="full" pb={20}>
      <Flex align="center" justify="space-between" py={12}>
        <Heading size="lg">User Profile</Heading>
        <HStack gap={4}>
          <Button
            size="sm"
            onClick={() => {
              if (!user.friendship_status) {
                friendMutation.mutate(user.id)
              }
            }}
            colorPalette={
              user.friendship_status === "PENDING"
                ? "accent"
                : user.friendship_status === "ACCEPTED"
                  ? "green"
                  : "main"
            }
            variant={user.friendship_status ? "outline" : "solid"}
            disabled={!!user.friendship_status}
            loading={friendMutation.isPending}
          >
            {user.friendship_status === "PENDING" ? (
              <>
                <FiUserPlus /> Request Pending
              </>
            ) : user.friendship_status === "ACCEPTED" ? (
              <>
                <FiUserCheck /> Friends
              </>
            ) : (
              <>
                <FiUserPlus /> Add Friend
              </>
            )}
          </Button>

          <MenuRoot>
            <MenuTrigger asChild>
              <IconButton variant="ghost" aria-label="Profile Options">
                <BsThreeDotsVertical />
              </IconButton>
            </MenuTrigger>
            <MenuContent>
              <MenuItem value="copy-id" onClick={handleCopyId}>
                <FiShare2 style={{ marginRight: "8px" }} /> Copy User ID
              </MenuItem>
              {isFriend && (
                <MenuItem
                  value="remove-friend"
                  color="red.500"
                  onClick={() => setIsRemoveFriendModalOpen(true)}
                >
                  <FiUserMinus style={{ marginRight: "8px" }} /> Remove Friend
                </MenuItem>
              )}
            </MenuContent>
          </MenuRoot>
        </HStack>
      </Flex>

      <VStack align="stretch" gap={8} maxW="3xl" mb={12}>
        <UserProfilePicture user={user as UserPublicExtended} isReadOnly />
        <Separator borderColor={borderColor} />
        <UserInformation user={user as UserPublicExtended} />
      </VStack>

      {canSeeAll ? (
        <ItemsBrowser
          displayType={display_type}
          viewMode={view_mode}
          organizeBy={organize_by}
          sortBy={sort_by}
          sortOrder={sort_order}
          limit={limit}
          q={q}
          category={category}
          genre={genre}
          subject={subject}
          author={author}
          itemType={item_type}
          typeBreakdown={(user?.collection_index as any)?.item_type ?? {}}
          onChangeItemType={(type) =>
            updateSearch({
              item_type: type,
              subject: undefined,
              category: undefined,
              genre: undefined,
              author: undefined,
              ...(type && type !== "book" ? { display_type: "items" } : {}),
            })
          }
          items={groupItems(allItems as any)}
          facets={allFacets}
          totalItemCount={user?.collection_index?.total ?? totalItemCount}
          totalFacetCount={totalFacetCount}
          isLoading={
            (isLoadingItems && !allItems.length) ||
            (isLoadingFacets && !allFacets.length)
          }
          hasNextItems={hasNextItems}
          hasNextFacets={hasNextFacets}
          isFetchingNextItems={isFetchingNextItems}
          isFetchingNextFacets={isFetchingNextFacets}
          onChangeDisplayType={(t) => updateSearch({ display_type: t })}
          onChangeViewMode={(m) => updateSearch({ view_mode: m })}
          onChangeOrganizeBy={(v) =>
            updateSearch({ organize_by: v, subject: undefined, author: undefined })
          }
          onChangeSortBy={(v) => updateSearch({ sort_by: v })}
          onChangeSortOrder={(v) => updateSearch({ sort_order: v })}
          onChangeLimit={(v) => updateSearch({ limit: v })}
          onChangeQ={(v) => updateSearch({ q: v })}
          onChangeCategory={(v) => updateSearch({ category: v, genre: undefined })}
          onChangeGenre={(v) => updateSearch({ genre: v })}
          onOpenCollection={handleOpenCollection}
          onClearDrilldown={() =>
            updateSearch({
              subject: undefined,
              author: undefined,
              genre: undefined,
              category: undefined,
            })
          }
          onFetchNextItems={fetchNextItems}
          onFetchNextFacets={fetchNextFacets}
          displayOwnerId={userId}
          onShowDetails={setSelectedItem}
          onReview={setSelectedLoanForReview}
          onLoanRequest={setSelectedItemForLoan}
          onExtensionRequest={setSelectedLoanForExtension}
        />
      ) : (
        <Box
          p={10}
          textAlign="center"
          borderWidth="1px"
          borderStyle="dashed"
          borderRadius="lg"
          borderColor={borderColor}
        >
          <Text color="gray.500">
            Items are hidden. Send a friend request to see them!
          </Text>
        </Box>
      )}

      <ItemDetailModal
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {selectedLoanForReview && (
        <ReviewModal
          loan={selectedLoanForReview}
          isOpen={!!selectedLoanForReview}
          onClose={() => setSelectedLoanForReview(null)}
        />
      )}

      {selectedItemForLoan && (
        <LoanRequestModal
          item={selectedItemForLoan}
          isOpen={!!selectedItemForLoan}
          onClose={() => setSelectedItemForLoan(null)}
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

      <ConfirmationModal
        isOpen={isRemoveFriendModalOpen}
        onClose={() => setIsRemoveFriendModalOpen(false)}
        onConfirm={() => removeFriendMutation.mutate(user.id)}
        title="Remove Friend"
        message={`Are you sure you want to remove ${
          user.full_name || user.email
        } from your friends list?`}
        isLoading={removeFriendMutation.isPending}
      />
    </Container>
  )
}

export default UserProfilePage
