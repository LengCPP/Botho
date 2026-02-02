import {
  Badge,
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
  useBreakpointValue,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { BsThreeDotsVertical } from "react-icons/bs"
import { FiShare2, FiUserCheck, FiUserMinus, FiUserPlus } from "react-icons/fi"

import {
  CollectionsService,
  FriendsService,
  type ItemPublic,
  ItemsService,
  UsersService,
} from "@/client"
import CollectionCard from "@/components/Collections/CollectionCard"
import { CompactItemCard } from "@/components/Items/CompactItemCard"
import ItemCard from "@/components/Items/ItemCard"
import { ItemDetailModal } from "@/components/Items/ItemDetailModal"
import { ItemsViewOptions } from "@/components/Items/ItemsViewOptions"
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

export const Route = createFileRoute("/_layout/users/$userId")({
  component: UserProfilePage,
})

function UserProfilePage() {
  const { userId } = Route.useParams()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [viewMode, setViewMode] = useState<"card" | "list">("card")
  const [sortBy, setSortBy] = useState("created_at")
  const [sortOrder, setSortOrder] = useState("desc")
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [genre, setGenre] = useState<string | undefined>(undefined)

  const [selectedItem, setSelectedItem] = useState<ItemPublic | null>(null)
  const isMobile = useBreakpointValue({ base: true, md: false })

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

  const { data: collections } = useQuery({
    queryKey: ["user-collections", userId],
    queryFn: () => CollectionsService.readCollections({ ownerId: userId }),
    enabled: canSeeAll,
  })

  const { data: items, isLoading: isLoadingItems } = useQuery({
    queryKey: [
      "items",
      userId,
      { excludeCollections: true, sortBy, sortOrder, category, genre },
    ],
    queryFn: () =>
      ItemsService.readItems({
        ownerId: userId,
        excludeCollections: true,
        sortBy,
        sortOrder,
        category,
        genre,
      }),
    enabled: canSeeAll,
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

  const userItems = items?.data || []
  const groupedItems = groupItems(userItems)

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
                  onClick={() => {
                    if (
                      window.confirm(
                        "Are you sure you want to remove this friend?",
                      )
                    ) {
                      removeFriendMutation.mutate(user.id)
                    }
                  }}
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

      {canSeeAll && collections?.data && collections.data.length > 0 && (
        <Box mb={12}>
          <Heading size="lg" mb={6}>
            Collections & Libraries
          </Heading>
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} gap={6}>
            {collections.data.map((c) => (
              <CollectionCard key={c.id} collection={c} />
            ))}
          </SimpleGrid>
        </Box>
      )}

      <Flex justify="space-between" align="center" mb={6} wrap="wrap" gap={4}>
        <Heading size="lg">Other Items</Heading>

        {canSeeAll && (
          <ItemsViewOptions
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
            sortBy={sortBy}
            onChangeSortBy={setSortBy}
            sortOrder={sortOrder}
            onChangeSortOrder={setSortOrder}
            category={category}
            onChangeCategory={setCategory}
            genre={genre}
            onChangeGenre={setGenre}
            showDisplayToggle={false}
            showLimit={false}
            showFilter={true}
          />
        )}
      </Flex>

      {!canSeeAll ? (
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
      ) : isLoadingItems ? (
        <Text>Loading items...</Text>
      ) : userItems.length === 0 ? (
        <Text color="gray.500">No other items found.</Text>
      ) : (
        <>
          <SimpleGrid
            columns={viewMode === "list" ? 1 : { base: 2, md: 3, xl: 4 }}
            gap={viewMode === "list" ? 2 : { base: 3, md: 6 }}
          >
            {groupedItems.map((group) => {
              const firstItem = group[0]
              return viewMode === "list" ? (
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

          <ItemDetailModal
            item={selectedItem}
            isOpen={!!selectedItem}
            onClose={() => setSelectedItem(null)}
          />
        </>
      )}
    </Container>
  )
}
