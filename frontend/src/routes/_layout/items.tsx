import {
  Box,
  Button,
  Container,
  EmptyState,
  Flex,
  Grid,
  HStack,
  Heading,
  SimpleGrid,
  Text,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { FaChevronLeft, FaFileImport } from "react-icons/fa"
import { FiSearch } from "react-icons/fi"
import { z } from "zod"

import { type ItemPublic, ItemsService, LoansService } from "@/client"
import { ImportItems } from "@/components/Common/ImportItems"
import AddItem from "@/components/Items/AddItem"
import { CompactItemCard } from "@/components/Items/CompactItemCard"
import { GroupCard } from "@/components/Items/GroupCard"
import ItemCard from "@/components/Items/ItemCard"
import { ItemDetailModal } from "@/components/Items/ItemDetailModal"
import { ItemsViewOptions } from "@/components/Items/ItemsViewOptions"
import PendingItems from "@/components/Pending/PendingItems"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination"
import useAuth from "@/hooks/useAuth"
import { groupItems } from "@/utils"

const itemsSearchSchema = z.object({
  page: z.number().catch(1),
  sort_by: z
    .string()
    .catch(() => localStorage.getItem("sort_by") || "created_at"),
  sort_order: z
    .string()
    .catch(() => localStorage.getItem("sort_order") || "desc"),
  limit: z.number().catch(() => Number(localStorage.getItem("limit")) || 8),
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
  organize_by: z
    .enum(["subject", "genre", "category", "author"])
    .catch(() => (localStorage.getItem("organize_by") as any) || "subject"),
  q: z.string().optional(),
  tab: z.enum(["items", "import"]).catch("items"),
})

const COLLECTIONS_LIMIT = 12

function getItemsQueryOptions({
  page,
  sort_by,
  sort_order,
  limit,
  ownerId,
  category,
  genre,
  subject,
  q,
}: {
  page: number
  sort_by: string
  sort_order: string
  limit: number
  ownerId?: string
  category?: string
  genre?: string
  subject?: string
  q?: string
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
        subject: subject,
        q: q,
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
        subject,
        q,
      },
    ],
  }
}

export const Route = createFileRoute("/_layout/items")({
  component: Items,
  validateSearch: (search) => itemsSearchSchema.parse(search),
})

function ItemsTable() {
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()
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
    q,
  } = Route.useSearch()
  const { user } = useAuth()
  const [selectedItem, setSelectedItem] = useState<ItemPublic | null>(null)

  useEffect(() => {
    localStorage.setItem("view_mode", view_mode)
    localStorage.setItem("display_type", display_type)
    localStorage.setItem("organize_by", organize_by)
    localStorage.setItem("sort_by", sort_by)
    localStorage.setItem("sort_order", sort_order)
    localStorage.setItem("limit", String(limit))
  }, [view_mode, display_type, organize_by, sort_by, sort_order, limit])

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getItemsQueryOptions({
      page,
      sort_by,
      sort_order,
      limit,
      ownerId: user?.id,
      category,
      genre,
      subject,
      q,
    }),
    placeholderData: (prevData) => prevData,
    enabled: !!user && (!!subject || display_type === "items"),
  })

  const { data: facets, isLoading: isLoadingFacets } = useQuery({
    queryKey: ["itemFacets", user?.id, organize_by, q, page],
    queryFn: () =>
      ItemsService.readItemFacets({
        ownerId: user?.id,
        groupBy: organize_by,
        q: q,
        skip: (page - 1) * COLLECTIONS_LIMIT,
        limit: COLLECTIONS_LIMIT,
      }),
    enabled: !!user && display_type === "collections" && !subject,
  })

  // Prefetch next page
  useEffect(() => {
    if (display_type === "items" && data?.data.length === limit) {
      const nextPage = page + 1
      queryClient.prefetchQuery(
        getItemsQueryOptions({
          page: nextPage,
          sort_by,
          sort_order,
          limit,
          ownerId: user?.id,
          category,
          genre,
          subject,
          q,
        }),
      )
    }
  }, [
    data,
    page,
    limit,
    queryClient,
    sort_by,
    sort_order,
    user?.id,
    category,
    genre,
    subject,
    q,
    display_type,
  ])

  // Fetch outgoing loans once for all cards
  useQuery({
    queryKey: ["loans", "outgoing"],
    queryFn: () => LoansService.readOutgoingLoanRequests({}),
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

  if (isLoading || isLoadingFacets) {
    return <PendingItems />
  }

  if (items.length === 0 && page === 1 && !facets?.data?.length) {
    if (hasAnyItems || q) {
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
      columns={view_mode === "list" ? 1 : { base: 2, sm: 3, md: 4 }}
      gap={view_mode === "list" ? 2 : { base: 2, md: 6 }}
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
            md: "repeat(2, 1fr)",
            lg: "repeat(3, 1fr)",
            xl: "repeat(4, 1fr)",
          }}
          gap={6}
        >
          {facets?.data?.map((facet: any) => (
            <GroupCard
              key={facet.name}
              name={facet.name}
              type={organize_by}
              count={facet.count}
              sample_image={facet.sample_image}
              onOpen={() => updateSearch({ subject: facet.name })}
            />
          ))}
        </Grid>

        <Flex justifyContent="center" mt={8}>
          <PaginationRoot
            count={facets?.count ?? 0}
            pageSize={COLLECTIONS_LIMIT}
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

  // Drilled-down Group View OR Item View
  const activeGroups = groupItems(items)

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
            {activeGroups[0]?.[0]?.item_type === "book" ? "Books" : "Items"}{" "}
            {subject?.toLowerCase() === "others"
              ? `with unspecified ${organize_by}`
              : `${
                  organize_by === "author"
                    ? "by"
                    : organize_by === "genre"
                      ? "in"
                      : "on"
                } ${subject}`}{" "}
            {activeGroups.length > 1 && `(${activeGroups.length})`}
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
          count={count}
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
  const navigate = useNavigate({ from: Route.fullPath })
  const { user } = useAuth()
  const {
    page,
    sort_by,
    sort_order,
    limit,
    category,
    genre,
    view_mode,
    display_type,
    organize_by,
    subject,
    q,
    tab,
  } = Route.useSearch()

  const { data } = useQuery({
    ...getItemsQueryOptions({
      page,
      sort_by,
      sort_order,
      limit,
      ownerId: user?.id,
      category,
      genre,
      subject,
      q,
    }),
    enabled: !!user && tab !== "import",
  })

  const updateSearch = (newParams: any) => {
    navigate({
      search: (prev: any) => ({ ...prev, ...newParams, page: 1 }),
    })
  }

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
          <HStack gap={4} align="baseline">
            <VStack align="start" gap={0}>
              <Heading size="lg">My Items</Heading>
              {data && (
                <Text fontSize="sm" color="gray.500" fontWeight="medium">
                  Total: {data.count} items
                </Text>
              )}
            </VStack>
            <AddItem />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateSearch({ tab: tab === "import" ? "items" : "import" })
              }
            >
              <FaFileImport />{" "}
              {tab === "import" ? "View Collection" : "Bulk Import"}
            </Button>
          </HStack>

          {tab !== "import" && (
            <ItemsViewOptions
              q={q}
              onChangeQ={(val) => updateSearch({ q: val })}
              viewMode={view_mode}
              onChangeViewMode={(mode) => updateSearch({ view_mode: mode })}
              displayType={display_type}
              onChangeDisplayType={(type) =>
                updateSearch({ display_type: type, subject: undefined })
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
                updateSearch({ organize_by: val, subject: undefined })
              }
              showDisplayToggle={true}
              showViewToggle={true}
              showFilter={true}
              showSort={true}
              showLimit={true}
            />
          )}
        </Flex>
      </VStack>

      {tab === "import" ? <ImportItems /> : <ItemsTable />}
    </Container>
  )
}
