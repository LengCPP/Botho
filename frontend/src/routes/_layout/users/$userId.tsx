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
  IconButton,
  Image,
  Separator,
  SimpleGrid,
  Tabs,
  Text,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMemo, useEffect, useState } from "react"
import { BsThreeDotsVertical } from "react-icons/bs"
import { FaChevronLeft } from "react-icons/fa"
import {
  FiBook,
  FiLayers,
  FiShare2,
  FiUserCheck,
  FiUserMinus,
  FiUserPlus,
} from "react-icons/fi"

import {
  FriendsService,
  type ItemPublic,
  ItemsService,
  UsersService,
} from "@/client"
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
import { formatPublicId, getImageUrl, groupItems, handleError } from "@/utils"

export const Route = createFileRoute("/_layout/users/$userId")({
  component: UserProfilePage,
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

function UserProfilePage() {
  const { userId } = Route.useParams()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // View State
  const [viewMode, setViewMode] = useState<"card" | "list">("card")
  const [displayType, setDisplayType] = useState<"items" | "collections">(
    "items",
  )
  const [organizeBy, setOrganizeBy] = useState("subject")
  const [subject, setSubject] = useState<string | undefined>(undefined)

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
  
  // Calculate Organized Items for "Collections" view
  const organizedItems = useMemo(() => {
    const groupedPhysical = groupItems(userItems)
    const sections: Record<string, ItemPublic[][]> = {}

    for (const group of groupedPhysical) {
      const first = group[0]
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
      }

      if (keys.length === 0) {
        if (!sections.Others) sections.Others = []
        sections.Others.push(group)
      } else {
        for (const key of keys) {
          if (!sections[key]) sections[key] = []
          sections[key].push(group)
        }
      }
    }
    return sections
  }, [userItems, organizeBy])

  // Determine what to display in the main content area
  const activeGroups = subject
    ? organizedItems[subject] || []
    : groupItems(userItems)

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
              {displayType === "collections"
                ? subject
                  ? `Items in ${subject}`
                  : "Item Collections"
                : `Items (${userItems.length})`}
            </Heading>
            
            <ItemsViewOptions
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              displayType={displayType}
              onChangeDisplayType={(type) => {
                setDisplayType(type)
                setSubject(undefined)
              }}
              organizeBy={organizeBy}
              onChangeOrganizeBy={(val) => {
                setOrganizeBy(val)
                setSubject(undefined)
              }}
              sortBy={sortBy}
              onChangeSortBy={setSortBy}
              sortOrder={sortOrder}
              onChangeSortOrder={setSortOrder}
              category={category}
              onChangeCategory={setCategory}
              genre={genre}
              onChangeGenre={setGenre}
              showDisplayToggle={true}
              showViewToggle={displayType === "items" || !!subject}
              showLimit={false}
              showFilter={displayType === "items"}
              showSort={displayType === "items"}
            />
          </Flex>

          {isLoadingItems ? (
            <Text>Loading items...</Text>
          ) : userItems.length === 0 ? (
            <Text color="gray.500">No items found.</Text>
          ) : (
            <>
              {/* Back Button for Drilldown */}
              {subject && (
                <Button
                  variant="ghost"
                  size="sm"
                  mb={4}
                  onClick={() => setSubject(undefined)}
                >
                  <FaChevronLeft style={{ marginRight: "8px" }} /> Back to Collections
                </Button>
              )}

              {/* Render Collections Grid (GroupCards) */}
              {displayType === "collections" && !subject ? (
                <SimpleGrid
                  columns={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5 }}
                  gap={6}
                >
                  {Object.entries(organizedItems).map(([name, groups]) => (
                    <GroupCard
                      key={name}
                      name={name}
                      type={organizeBy}
                      groups={groups}
                      onOpen={() => setSubject(name)}
                    />
                  ))}
                </SimpleGrid>
              ) : (
                /* Render Items Grid */
                <SimpleGrid
                  columns={
                    viewMode === "list"
                      ? 1
                      : { base: 3, sm: 3, md: 4, lg: 5, xl: 6 }
                  }
                  gap={viewMode === "list" ? 2 : { base: 2, md: 6 }}
                >
                  {activeGroups.map((group) => {
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
    </Container>
  )
}
