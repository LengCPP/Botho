import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Heading,
  IconButton,
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
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { BsThreeDotsVertical } from "react-icons/bs"
import { FaChevronLeft } from "react-icons/fa"
import { FiShare2, FiUserCheck, FiUserMinus, FiUserPlus } from "react-icons/fi"
import { z } from "zod"

import {
  FriendsService,
  type ItemPublic,
  ItemsService,
  UsersService,
} from "@/client"
import ConfirmationModal from "@/components/Common/ConfirmationModal"
import { CollectionGrid } from "@/components/Items/CollectionGrid"
import { CompactItemCard } from "@/components/Items/CompactItemCard"
import ItemCard from "@/components/Items/ItemCard"
import { ItemDetailModal } from "@/components/Items/ItemDetailModal"
import { ItemsViewOptions } from "@/components/Items/ItemsViewOptions"
import PendingItems from "@/components/Pending/PendingItems"
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
    q,
  } = Route.useSearch()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [isRemoveFriendModalOpen, setIsRemoveFriendModalOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem("view_mode", view_mode)
    localStorage.setItem("display_type", display_type)
    localStorage.setItem("organize_by", organize_by)
    localStorage.setItem("sort_by", sort_by)
    localStorage.setItem("sort_order", sort_order)
    localStorage.setItem("limit", String(limit))
  }, [view_mode, display_type, organize_by, sort_by, sort_order, limit])

  const updateSearch = (newParams: any) => {
    navigate({
      search: (prev: any) => ({ ...prev, ...newParams, page: 1 }),
    })
  }

  const handleOpenCollection = (name: string) => {
    const params: any = {
      subject: undefined,
      author: undefined,
      genre: undefined,
      category: undefined,
    }
    if (organize_by === "subject") params.subject = name
    else if (organize_by === "author") params.author = name
    else if (organize_by === "genre") params.genre = name
    else if (organize_by === "category") params.category = name
    updateSearch(params)
  }

  const [selectedItem, setSelectedItem] = useState<ItemPublic | null>(null)
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
      { sort_by, sort_order, limit, category, genre, subject, author, q },
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
      !author &&
      !category &&
      !genre,
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

  const activeGroups = groupItems(allItems as any)

  const currentFilterValue = subject || author || genre || category
  const isDrillDown = !!currentFilterValue

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
        <Box>
          <Flex
            justify="space-between"
            align="center"
            mb={6}
            wrap="wrap"
            gap={4}
          >
            <Heading size="md">
              {display_type === "collections"
                ? isDrillDown
                  ? currentFilterValue.toLowerCase() === "others"
                    ? `Items with unspecified ${organize_by}`
                    : `Items in ${currentFilterValue}`
                  : "Item Collections"
                : `Items (${user?.collection_index?.total ?? totalItemCount})`}
            </Heading>

            <ItemsViewOptions
              q={q}
              onChangeQ={(val) => updateSearch({ q: val })}
              viewMode={view_mode}
              onChangeViewMode={(mode) => updateSearch({ view_mode: mode })}
              displayType={display_type}
              onChangeDisplayType={(type) =>
                updateSearch({
                  display_type: type,
                  subject: undefined,
                  author: undefined,
                  genre: undefined,
                  category: undefined,
                })
              }
              sortBy={sort_by}
              onChangeSortBy={(val) => updateSearch({ sort_by: val })}
              sortOrder={sort_order}
              onChangeSortOrder={(val) => updateSearch({ sort_order: val })}
              limit={limit}
              onChangeLimit={(val) => updateSearch({ limit: val })}
              category={category}
              onChangeCategory={(val) =>
                updateSearch({ category: val, genre: undefined })
              }
              genre={genre}
              onChangeGenre={(val) => updateSearch({ genre: val })}
              organizeBy={organize_by}
              onChangeOrganizeBy={(val) =>
                updateSearch({
                  organize_by: val,
                  subject: undefined,
                  author: undefined,
                  genre: undefined,
                  category: undefined,
                })
              }
              showDisplayToggle={true}
              showViewToggle={display_type === "items" || isDrillDown}
              showLimit={true}
              showFilter={display_type === "items"}
              showSort={display_type === "items"}
            />
          </Flex>

          {(isLoadingItems && !allItems.length) ||
          (isLoadingFacets && !allFacets.length) ? (
            <PendingItems />
          ) : allItems.length === 0 && !allFacets.length ? (
            <Text color="gray.500">No items found.</Text>
          ) : (
            <>
              {/* Back Button for Drilldown */}
              {isDrillDown && (
                <Button
                  variant="ghost"
                  size="sm"
                  mb={4}
                  onClick={() =>
                    updateSearch({
                      subject: undefined,
                      author: undefined,
                      genre: undefined,
                      category: undefined,
                    })
                  }
                >
                  <FaChevronLeft style={{ marginRight: "8px" }} /> Back to
                  Collections
                </Button>
              )}

              {/* Render Collections Grid */}
              {display_type === "collections" && !isDrillDown ? (
                <VStack align="stretch" gap={8}>
                  <CollectionGrid
                    items={allFacets}
                    type={organize_by}
                    onOpen={handleOpenCollection}
                  />
                  {hasNextFacets && (
                    <Flex justify="center" mt={8}>
                      <Button
                        variant="ghost"
                        colorPalette="accent"
                        onClick={() => fetchNextFacets()}
                        loading={isFetchingNextFacets}
                      >
                        Load More Collections (Showing {allFacets.length} of{" "}
                        {totalFacetCount})
                      </Button>
                    </Flex>
                  )}
                </VStack>
              ) : (
                /* Render Items Grid */
                <VStack align="stretch" gap={8}>
                  <SimpleGrid
                    columns={
                      view_mode === "list" ? 1 : { base: 2, sm: 3, md: 4 }
                    }
                    gap={view_mode === "list" ? 2 : { base: 2, md: 6 }}
                  >
                    {activeGroups.map((group) => {
                      const firstItem = group[0]
                      return view_mode === "list" ? (
                        <CompactItemCard
                          key={firstItem.id}
                          item={group}
                          onShowDetails={() => setSelectedItem(firstItem)}
                        />
                      ) : (
                        <ItemCard
                          key={firstItem.id}
                          item={group}
                          displayOwnerId={userId}
                          onShowDetails={() => setSelectedItem(firstItem)}
                        />
                      )
                    })}
                  </SimpleGrid>

                  {hasNextItems && (
                    <Flex justify="center" mt={8}>
                      <Button
                        variant="ghost"
                        colorPalette="accent"
                        onClick={() => fetchNextItems()}
                        loading={isFetchingNextItems}
                      >
                        Load More Items (Showing {allItems.length} of{" "}
                        {totalItemCount})
                      </Button>
                    </Flex>
                  )}
                </VStack>
              )}
            </>
          )}
        </Box>
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
