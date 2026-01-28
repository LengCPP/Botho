import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Grid,
  HStack,
  Heading,
  IconButton,
  Popover,
  Portal,
  Select,
  Separator,
  Skeleton,
  Text,
  VStack,
  useBreakpointValue,
  SimpleGrid,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { FaFilter } from "react-icons/fa"
import { FiPlus, FiTrash2, FiMoreVertical, FiEdit } from "react-icons/fi"

import { CollectionsService, ItemsService, CommunitiesService, type ItemPublic } from "@/client"
import AddItem from "@/components/Items/AddItem"
import ItemCard from "@/components/Items/ItemCard"
import { CompactItemCard } from "@/components/Items/CompactItemCard"
import { ItemDetailModal } from "@/components/Items/ItemDetailModal"
import EditCollection from "@/components/Collections/EditCollection"
import ConfirmationModal from "@/components/Common/ConfirmationModal"
import { useColorModeValue } from "@/components/ui/color-mode"
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

export const Route = createFileRoute("/_layout/collections/$collectionId")({
  component: CollectionDetail,
})

function CollectionDetail() {
  const { collectionId } = Route.useParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { showSuccessToast } = useCustomToast()

  const [categoryFilter, setCategoryFilter] = useState("")
  const [genreFilter, setGenreFilter] = useState("")
  const [selectedItem, setSelectedItem] = useState<ItemPublic | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const isMobile = useBreakpointValue({ base: true, md: false })

  const bgColor = useColorModeValue("orange.50", "gray.800")
  const borderColor = useColorModeValue("orange.200", "gray.600")
  const selectBg = useColorModeValue("white", "gray.800")
  const selectColor = useColorModeValue("black", "white")
  const selectBorder = useColorModeValue("gray.300", "gray.600")

  const { data: collection, isLoading } = useQuery({
    queryKey: ["collections", collectionId],
    queryFn: () => CollectionsService.readCollection({ id: collectionId }),
  })

  // Get community info if it's a community collection
  const { data: community } = useQuery({
    queryKey: ["community", collection?.community_id],
    queryFn: () => CommunitiesService.readCommunity({ id: collection!.community_id! }),
    enabled: !!collection?.community_id,
  })

  const isOwner = user?.id === collection?.owner_id
  const isCommunityAdmin = community?.current_user_role === "admin" || community?.created_by === user?.id
  const canManage = isOwner || isCommunityAdmin || !!user?.is_superuser

  // Get items to allow adding them
  const { data: availableItemsData } = useQuery({
    queryKey: collection?.community_id 
      ? ["communityItems", collection.community_id]
      : ["items", "me", { excludeCollections: true }],
    queryFn: () => collection?.community_id
      ? CommunitiesService.readCommunityItems({ id: collection.community_id })
      : ItemsService.readItems({ limit: 100, excludeCollections: true }),
    enabled: !!user && !!collection && canManage,
  })

  const addMutation = useMutation({
    mutationFn: (itemId: string) =>
      CollectionsService.addItemToCollection({ id: collectionId, itemId }),
    onSuccess: () => {
      showSuccessToast("Item added to collection")
      queryClient.invalidateQueries({ queryKey: ["collections", collectionId] })
    },
    onError: handleError,
  })

  const removeMutation = useMutation({
    mutationFn: (itemId: string) =>
      CollectionsService.removeItemFromCollection({ id: collectionId, itemId }),
    onSuccess: () => {
      showSuccessToast("Item removed from collection")
      queryClient.invalidateQueries({ queryKey: ["collections", collectionId] })
    },
    onError: handleError,
  })

  const deleteMutation = useMutation({
    mutationFn: () => CollectionsService.deleteCollection({ id: collectionId }),
    onSuccess: () => {
      showSuccessToast("Collection deleted")
      queryClient.invalidateQueries({ queryKey: ["collections"] })
      if (collection?.community_id) {
        queryClient.invalidateQueries({ queryKey: ["communityCollections", collection.community_id] })
        navigate({ to: "/communities/$communityId", params: { communityId: collection.community_id } })
      } else {
        navigate({ to: "/items" })
      }
    },
    onError: handleError,
  })

  // Derive filters and filtered items
  const { filteredItems, categories, genres } = useMemo(() => {
    if (!collection?.items) {
      return { filteredItems: [], categories: [], genres: [] }
    }

    const cats = new Set<string>()
    const gens = new Set<string>()

    const filtered = collection.items.filter((item) => {
      let itemCategory = ""
      let itemGenre = ""

      if (item.extra_data) {
        try {
          // extra_data might be a string or object depending on how it's returned
          const extra =
            typeof item.extra_data === "string"
              ? JSON.parse(item.extra_data)
              : item.extra_data
          itemCategory = extra.category || ""
          itemGenre = extra.genre || ""
        } catch (e) {
          // ignore parsing error
        }
      }

      if (itemCategory) cats.add(itemCategory)
      if (itemGenre) gens.add(itemGenre)

      const matchCategory = categoryFilter
        ? itemCategory === categoryFilter
        : true
      const matchGenre = genreFilter ? itemGenre === genreFilter : true

      return matchCategory && matchGenre
    })

    return {
      filteredItems: filtered,
      categories: Array.from(cats).sort(),
      genres: Array.from(gens).sort(),
    }
  }, [collection?.items, categoryFilter, genreFilter])

  if (isLoading) {
    return (
      <Container maxW="full" pt={12}>
        <Skeleton height="40px" width="300px" mb={4} />
        <Skeleton height="20px" width="500px" mb={8} />
        <Grid templateColumns="repeat(auto-fill, minmax(200px, 1fr))" gap={6}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height="300px" />
          ))}
        </Grid>
      </Container>
    )
  }

  if (!collection) {
    return <Text>Collection not found</Text>
  }

  // Filter out items already in ANY collection (backend constraint)
  // For community collections, we only show items from the community pool
  const availableItems =
    availableItemsData?.data.filter(
      (item) => !item.collection_id && !collection.items?.some((ci) => ci.id === item.id),
    ) || []

  const selectStyle = {
    padding: "8px",
    borderRadius: "4px",
    border: `1px solid ${selectBorder}`,
    backgroundColor: selectBg,
    color: selectColor,
    fontSize: "14px",
    width: "100%",
  }

  return (
    <Container maxW="full" pt={12} pb={20}>
      <VStack align="start" gap={6} width="full">
        <HStack width="full" justify="space-between" wrap="wrap" gap={4}>
          <HStack gap={4}>
            <VStack align="start" gap={0}>
              <Heading size="2xl">{collection.title}</Heading>
              <Text color="gray.500">
                {collection.description || "No description provided."}
              </Text>
              {collection.community_id && community && (
                <HStack mt={1}>
                  <Text fontSize="sm" fontWeight="bold">Owned by Community:</Text>
                  <Link to={`/communities/${community.id}`}>
                    <Text fontSize="sm" color="ui.hover" _hover={{ textDecoration: "underline" }}>
                      {community.name}
                    </Text>
                  </Link>
                </HStack>
              )}
            </VStack>
          </HStack>

          <HStack gap={4}>
            {canManage && (
              <>
                <Badge colorPalette="orange" size="lg" variant="solid">
                  {isOwner ? "Owner View" : "Admin View"}
                </Badge>
                
                <MenuRoot>
                  <MenuTrigger asChild>
                    <IconButton
                      aria-label="Collection Actions"
                      variant="ghost"
                      colorPalette="gray"
                    >
                      <FiMoreVertical />
                    </IconButton>
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem value="edit" onClick={() => setIsEditOpen(true)}>
                      <FiEdit /> Edit Details
                    </MenuItem>
                    <MenuItem
                      value="delete"
                      color="red.500"
                      onClick={() => setIsDeleteOpen(true)}
                    >
                      <FiTrash2 /> Delete Collection
                    </MenuItem>
                  </MenuContent>
                </MenuRoot>
              </>
            )}
          </HStack>
        </HStack>

        <Flex
          width="full"
          justify="space-between"
          align="center"
          wrap="wrap"
          gap={4}
        >
          <HStack gap={2}>
            {/* Filter Button */}
            <Popover.Root>
              <Popover.Trigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  colorPalette={
                    categoryFilter || genreFilter ? "orange" : "gray"
                  }
                >
                  <FaFilter /> Filter
                </Button>
              </Popover.Trigger>
              <Portal>
                <Popover.Positioner>
                  <Popover.Content width="300px">
                    <Popover.Arrow />
                    <Popover.Body>
                      <VStack gap={4} align="stretch">
                        <Box>
                          <Text fontSize="sm" fontWeight="bold" mb={1}>
                            Category
                          </Text>
                          <select
                            value={categoryFilter}
                            onChange={(e) => {
                              setCategoryFilter(e.target.value)
                              setGenreFilter("") // Reset genre
                            }}
                            style={selectStyle}
                          >
                            <option
                              value=""
                              style={{ backgroundColor: selectBg }}
                            >
                              All Categories
                            </option>
                            {categories.map((cat) => (
                              <option
                                key={cat}
                                value={cat}
                                style={{ backgroundColor: selectBg }}
                              >
                                {cat}
                              </option>
                            ))}
                          </select>
                        </Box>
                        <Box>
                          <Text fontSize="sm" fontWeight="bold" mb={1}>
                            Genre
                          </Text>
                          <select
                            value={genreFilter}
                            onChange={(e) => setGenreFilter(e.target.value)}
                            style={selectStyle}
                            disabled={!categoryFilter}
                          >
                            <option
                              value=""
                              style={{ backgroundColor: selectBg }}
                            >
                              All Genres
                            </option>
                            {genres.map((gen) => (
                              <option
                                key={gen}
                                value={gen}
                                style={{ backgroundColor: selectBg }}
                              >
                                {gen}
                              </option>
                            ))}
                          </select>
                        </Box>
                        {(categoryFilter || genreFilter) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setCategoryFilter("")
                              setGenreFilter("")
                            }}
                          >
                            Clear Filters
                          </Button>
                        )}
                      </VStack>
                    </Popover.Body>
                  </Popover.Content>
                </Popover.Positioner>
              </Portal>
            </Popover.Root>
          </HStack>

          {canManage && (
            <AddItem 
              collectionId={collection.id} 
              communityId={collection.community_id || undefined}
              isAdmin={isCommunityAdmin}
            />
          )}
        </Flex>

        {canManage && (
          <Box
            width="full"
            p={4}
            bg={bgColor}
            borderRadius="lg"
            border="1px solid"
            borderColor={borderColor}
          >
            <Heading size="sm" mb={4}>
              Add Items to this Collection
            </Heading>
            <Flex wrap="wrap" gap={2}>
              {availableItems.length === 0 ? (
                <Text fontSize="sm" color="gray.500">
                  {collection.community_id 
                    ? "No available items in the community pool. Pooled items that aren't in any collection will appear here."
                    : "All your existing items are already in this collection. Use 'Add Item' to create new ones."}
                </Text>
              ) : (
                availableItems.map((item) => (
                  <Flex
                    key={item.id}
                    align="center"
                    p={2}
                    bg="whiteAlpha.500"
                    borderRadius="md"
                    border="1px solid"
                    borderColor={borderColor}
                    _dark={{ bg: "whiteAlpha.100" }}
                  >
                    <Text fontSize="xs" fontWeight="bold" mr={2}>
                      {item.title}
                    </Text>
                    <IconButton
                      aria-label="Add to collection"
                      size="xs"
                      colorPalette="orange"
                      onClick={() => addMutation.mutate(item.id)}
                      loading={
                        addMutation.isPending &&
                        addMutation.variables === item.id
                      }
                    >
                      <FiPlus />
                    </IconButton>
                  </Flex>
                ))
              )}
            </Flex>
          </Box>
        )}

        <Separator borderColor={borderColor} />

        <Box width="full">
          <Heading size="md" mb={4}>
            Items in this{" "}
            {collection.collection_type === "library"
              ? "Library"
              : "Collection"}
          </Heading>
          {!filteredItems || filteredItems.length === 0 ? (
            <Flex
              direction="column"
              align="center"
              justify="center"
              p={10}
              bg={bgColor}
              borderRadius="lg"
              border="2px dashed"
              borderColor={borderColor}
            >
              <Text color="gray.500">
                {collection.items?.length === 0
                  ? "No items in this collection yet."
                  : "No items match your filters."}
              </Text>
            </Flex>
          ) : (
            <>
              <SimpleGrid
                columns={{ base: 2, md: 3, xl: 4 }}
                gap={6}
              >
                {filteredItems.map((item) => (
                  isMobile ? (
                    <CompactItemCard
                      key={item.id}
                      item={item as any}
                      onShowDetails={() => setSelectedItem(item as any)}
                      onRemoveFromCollection={
                        canManage
                          ? () => removeMutation.mutate(item.id)
                          : undefined
                      }
                    />
                  ) : (
                    <ItemCard
                      key={item.id}
                      item={item as any}
                      onRemoveFromCollection={
                        canManage
                          ? () => removeMutation.mutate(item.id)
                          : undefined
                      }
                    />
                  )
                ))}
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

      <EditCollection
        collection={collection}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
      />

      <ConfirmationModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Collection"
        message={`Are you sure you want to delete "${collection.title}"? This will not delete the items themselves.`}
        isLoading={deleteMutation.isPending}
      />
    </Container>
  )
}