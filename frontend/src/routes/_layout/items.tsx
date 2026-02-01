import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  EmptyState,
  Flex,
  Grid,
  HStack,
  Heading,
  Image,
  Popover,
  Portal,
  Separator,
  SimpleGrid,
  Text,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import type React from "react"
import { useMemo, useState } from "react"
import {
  FaBook,
  FaChevronLeft,
  FaFilter,
  FaFolder,
  FaList,
  FaSortAmountDown,
  FaThLarge,
} from "react-icons/fa"
import { FiSearch } from "react-icons/fi"
import { z } from "zod"

import { type ItemPublic, ItemsService } from "@/client"
import AddItem from "@/components/Items/AddItem"
import { CompactItemCard } from "@/components/Items/CompactItemCard"
import ItemCard from "@/components/Items/ItemCard"
import { ItemDetailModal } from "@/components/Items/ItemDetailModal"
import PendingItems from "@/components/Pending/PendingItems"
import { useColorModeValue } from "@/components/ui/color-mode"
import {
  MenuContent,
  MenuItemGroup,
  MenuRadioItem,
  MenuRadioItemGroup,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination"
import { BOOK_CLASSIFICATION } from "@/constants"
import useAuth from "@/hooks/useAuth"
import { getImageUrl, groupItems } from "@/utils"

const itemsSearchSchema = z.object({
  page: z.number().catch(1),
  sort_by: z.string().catch("created_at"),
  sort_order: z.string().catch("desc"),
  limit: z.number().catch(12),
  category: z.string().optional(),
  genre: z.string().optional(),
  view_mode: z.enum(["card", "list"]).catch("card"),
  display_type: z.enum(["items", "collections"]).catch("collections"),
  subject: z.string().optional(),
  organize_by: z
    .enum(["subject", "genre", "category", "author"])
    .catch("subject"),
})

function getItemsQueryOptions({
  page,
  sort_by,
  sort_order,
  limit,
  ownerId,
  category,
  genre,
}: {
  page: number
  sort_by: string
  sort_order: string
  limit: number
  ownerId?: string
  category?: string
  genre?: string
}) {
  return {
    queryFn: () =>
      ItemsService.readItems({
        skip: (page - 1) * limit,
        limit: limit,
        sortBy: sort_by,
        sortOrder: sort_order,
        ownerId: ownerId,
        category: category,
        genre: genre,
      }),
    queryKey: [
      "items",
      {
        page,
        sort_by,
        sort_order,
        limit,
        ownerId,
        category,
        genre,
      },
    ],
  }
}

export const Route = createFileRoute("/_layout/items")({
  component: Items,
  validateSearch: (search) => itemsSearchSchema.parse(search),
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
            {groups.length} Sets
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

function SortingControls() {
  const navigate = useNavigate({ from: Route.fullPath })
  const {
    sort_by,
    sort_order,
    limit,
    category,
    genre,
    view_mode,
    display_type,
    organize_by,
  } = Route.useSearch()

  const updateSearch = (newParams: any) => {
    navigate({
      search: (prev: any) => ({ ...prev, ...newParams, page: 1 }),
    })
  }

  const selectBg = useColorModeValue("white", "gray.800")
  const selectColor = useColorModeValue("black", "white")
  const selectBorder = useColorModeValue("gray.300", "gray.600")

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
    <Flex gap={2} align="center" wrap="wrap">
      {/* Display Type Toggle (Items vs Collections) */}
      <HStack
        border="1px solid"
        borderColor="border.subtle"
        p={1}
        rounded="md"
        gap={0}
      >
        <Button
          size="xs"
          variant={display_type === "items" ? "solid" : "ghost"}
          onClick={() =>
            updateSearch({ display_type: "items", subject: undefined })
          }
          title="Item View"
        >
          <FaBook />
        </Button>
        <Button
          size="xs"
          variant={display_type === "collections" ? "solid" : "ghost"}
          onClick={() => updateSearch({ display_type: "collections" })}
          title="Collection View"
        >
          <FaFolder />
        </Button>
      </HStack>

      <Separator orientation="vertical" height="20px" mx={1} />

      {/* View Mode Toggle (Card vs List) */}
      <HStack
        border="1px solid"
        borderColor="border.subtle"
        p={1}
        rounded="md"
        gap={0}
      >
        <Button
          size="xs"
          variant={view_mode === "card" ? "solid" : "ghost"}
          onClick={() => updateSearch({ view_mode: "card" })}
          title="Card View"
        >
          <FaThLarge />
        </Button>
        <Button
          size="xs"
          variant={view_mode === "list" ? "solid" : "ghost"}
          onClick={() => updateSearch({ view_mode: "list" })}
          title="List View"
        >
          <FaList />
        </Button>
      </HStack>

      {/* Organize By / Filter Button */}
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button
            variant="outline"
            size="sm"
            colorPalette={
              display_type === "collections" || category || genre
                ? "accent"
                : "gray"
            }
          >
            <FaFilter />{" "}
            {display_type === "collections" ? "Organize" : "Filter"}
          </Button>
        </Popover.Trigger>
        <Portal>
          <Popover.Positioner>
            <Popover.Content width="300px">
              <Popover.Arrow />
              <Popover.Body>
                <VStack gap={4} align="stretch">
                  {display_type === "collections" ? (
                    <Box>
                      <Text fontSize="sm" fontWeight="bold" mb={2}>
                        Organize Collections By
                      </Text>
                      <VStack gap={2} align="stretch">
                        {(
                          ["subject", "genre", "category", "author"] as const
                        ).map((opt) => (
                          <Button
                            key={opt}
                            size="sm"
                            variant={organize_by === opt ? "solid" : "ghost"}
                            justifyContent="flex-start"
                            onClick={() =>
                              updateSearch({
                                organize_by: opt,
                                subject: undefined,
                              })
                            }
                          >
                            {opt.charAt(0).toUpperCase() + opt.slice(1)}
                          </Button>
                        ))}
                      </VStack>
                    </Box>
                  ) : (
                    <>
                      <Box>
                        <Text fontSize="sm" fontWeight="bold" mb={1}>
                          Category
                        </Text>
                        <select
                          value={category || ""}
                          onChange={(e) =>
                            updateSearch({
                              category: e.target.value || undefined,
                              genre: undefined,
                            })
                          }
                          style={selectStyle}
                        >
                          <option
                            value=""
                            style={{ backgroundColor: selectBg }}
                          >
                            All Categories
                          </option>
                          {Object.keys(BOOK_CLASSIFICATION).map((cat) => (
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
                          value={genre || ""}
                          onChange={(e) =>
                            updateSearch({ genre: e.target.value || undefined })
                          }
                          style={selectStyle}
                          disabled={!category}
                        >
                          <option
                            value=""
                            style={{ backgroundColor: selectBg }}
                          >
                            All Genres
                          </option>
                          {category &&
                            BOOK_CLASSIFICATION[category]?.map((gen) => (
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
                      {(category || genre) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            updateSearch({
                              category: undefined,
                              genre: undefined,
                            })
                          }
                        >
                          Clear Filters
                        </Button>
                      )}
                    </>
                  )}
                </VStack>
              </Popover.Body>
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>

      {/* Sort Button */}
      <MenuRoot>
        <MenuTrigger asChild>
          <Button variant="outline" size="sm">
            <FaSortAmountDown /> Sort
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItemGroup title="Sort By">
            <MenuRadioItemGroup
              value={sort_by}
              onValueChange={(e) => updateSearch({ sort_by: e.value })}
            >
              <MenuRadioItem value="created_at">Date Created</MenuRadioItem>
              <MenuRadioItem value="title">Name</MenuRadioItem>
            </MenuRadioItemGroup>
          </MenuItemGroup>
          <MenuItemGroup title="Order">
            <MenuRadioItemGroup
              value={sort_order}
              onValueChange={(e) => updateSearch({ sort_order: e.value })}
            >
              <MenuRadioItem value="desc">Descending</MenuRadioItem>
              <MenuRadioItem value="asc">Ascending</MenuRadioItem>
            </MenuRadioItemGroup>
          </MenuItemGroup>
          <MenuItemGroup title="Items per page">
            <MenuRadioItemGroup
              value={String(limit)}
              onValueChange={(e) => updateSearch({ limit: Number(e.value) })}
            >
              <MenuRadioItem value="12">12</MenuRadioItem>
              <MenuRadioItem value="24">24</MenuRadioItem>
              <MenuRadioItem value="10000">All</MenuRadioItem>
            </MenuRadioItemGroup>
          </MenuItemGroup>
        </MenuContent>
      </MenuRoot>
    </Flex>
  )
}

function ItemsTable() {
  const navigate = useNavigate({ from: Route.fullPath })
  const {
    page,
    sort_by,
    sort_order,
    limit,
    category,
    genre,
    view_mode,
    display_type,
    subject,
    organize_by,
  } = Route.useSearch()
  const { user } = useAuth()
  const [selectedItem, setSelectedItem] = useState<ItemPublic | null>(null)
  const isMobile = useBreakpointValue({ base: true, md: false })

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getItemsQueryOptions({
      page,
      sort_by,
      sort_order,
      limit,
      ownerId: user?.id,
      category,
      genre,
    }),
    placeholderData: (prevData) => prevData,
    enabled: !!user,
  })

  const { data: allItemsCheck } = useQuery({
    queryKey: ["hasAnyItems", user?.id],
    queryFn: () => ItemsService.readItems({ limit: 1, ownerId: user?.id }),
    enabled: !!user,
  })

  const setPage = (page: number) =>
    navigate({
      search: (prev: any) => ({ ...prev, page }),
    })

  const updateSearch = (newParams: any) => {
    navigate({
      search: (prev: any) => ({ ...prev, ...newParams, page: 1 }),
    })
  }

  const items = data?.data ?? []
  const count = data?.count ?? 0
  const hasAnyItems = (allItemsCheck?.count ?? 0) > 0

  const organizedItems = useMemo(() => {
    const groupedPhysical = groupItems(items)
    const sections: Record<string, ItemPublic[][]> = {}

    for (const group of groupedPhysical) {
      const first = group[0]
      let keys: string[] = []

      if (organize_by === "subject") {
        keys = first.work_metadata?.tags || []
      } else if (organize_by === "genre") {
        const g = (first.extra_data as any)?.genre
        if (g) keys = [g]
      } else if (organize_by === "category") {
        const c = (first.extra_data as any)?.category
        if (c) keys = [c]
      } else if (organize_by === "author") {
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
  }, [items, organize_by])

  if (isLoading) {
    return <PendingItems />
  }

  if (items.length === 0 && page === 1) {
    if (hasAnyItems) {
      return (
        <Box mt={8}>
          <Text color="gray.500">No items match your filters.</Text>
        </Box>
      )
    }

    return (
      <EmptyState.Root>
        <EmptyState.Content>
          <EmptyState.Indicator>
            <FiSearch />
          </EmptyState.Indicator>
          <VStack textAlign="center">
            <EmptyState.Title>You don't have any items yet</EmptyState.Title>
            <EmptyState.Description>
              Add a new item to get started
            </EmptyState.Description>
          </VStack>
        </EmptyState.Content>
      </EmptyState.Root>
    )
  }

  const renderGroup = (groups: ItemPublic[][]) => (
    <SimpleGrid
      columns={view_mode === "list" ? 1 : { base: 2, md: 3, lg: 4, xl: 5 }}
      gap={view_mode === "list" ? 2 : { base: 3, md: 6 }}
      opacity={isPlaceholderData ? 0.5 : 1}
    >
      {groups.map((group) => {
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
            displayOwnerId={user?.id}
            onShowDetails={() => setSelectedItem(firstItem)}
          />
        )
      })}
    </SimpleGrid>
  )

  // Collection View Rendering
  if (display_type === "collections" && !subject) {
    return (
      <Box mt={8}>
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
          {Object.entries(organizedItems).map(([name, groups]) => (
            <GroupCard
              key={name}
              name={name}
              type={organize_by}
              groups={groups}
              onOpen={() => updateSearch({ subject: name })}
            />
          ))}
        </Grid>
      </Box>
    )
  }

  // Drilled-down Group View OR Item View
  const activeGroups = subject
    ? organizedItems[subject] || []
    : groupItems(items)

  return (
    <Box mt={8}>
      {subject && (
        <VStack align="start" mb={6} gap={2}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateSearch({ subject: undefined })}
          >
            <FaChevronLeft style={{ marginRight: "8px" }} /> Collections
          </Button>
          <Heading
            size="lg"
            color="ui.hover"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Books{" "}
            {organize_by === "author"
              ? "by"
              : organize_by === "genre"
                ? "in"
                : "on"}{" "}
            {subject} {activeGroups.length > 1 && `(${activeGroups.length})`}
          </Heading>
        </VStack>
      )}

      {renderGroup(activeGroups)}

      <ItemDetailModal
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      <Flex justifyContent="center" mt={8}>
        <PaginationRoot
          count={subject ? activeGroups.length : count}
          pageSize={limit}
          onPageChange={({ page }) => setPage(page)}
        >
          <Flex>
            <PaginationPrevTrigger />
            <PaginationItems />
            <PaginationNextTrigger />
          </Flex>
        </PaginationRoot>
      </Flex>
    </Box>
  )
}

function Items() {
  return (
    <Container maxW="full">
      <VStack pt={12} align="start" gap={6}>
        <Flex
          justify="space-between"
          align="center"
          width="full"
          wrap="wrap"
          gap={4}
        >
          <Heading size="lg">My Items</Heading>
          <SortingControls />
        </Flex>
        <AddItem />
      </VStack>
      <ItemsTable />
    </Container>
  )
}
