import {
  Badge,
  Box,
  Button,
  Container,
  EmptyState,
  Flex,
  HStack,
  Heading,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { FaChevronLeft } from "react-icons/fa"
import { FiSearch, FiSettings } from "react-icons/fi"
import { z } from "zod"

import {
  type ItemPublic,
  ItemsService,
  type LoanPublic,
  LoansService,
} from "@/client"
import ReviewModal from "@/components/Common/ReviewModal"
import AddItem from "@/components/Items/AddItem"
import {
  CollectionGrid,
  type CollectionItem,
} from "@/components/Items/CollectionGrid"
import { CompactItemCard } from "@/components/Items/CompactItemCard"
import { ExtensionRequestModal } from "@/components/Items/ExtensionRequestModal"
import ItemCard from "@/components/Items/ItemCard"
import { ItemDetailModal } from "@/components/Items/ItemDetailModal"
import { ItemsViewOptions } from "@/components/Items/ItemsViewOptions"
import { LoanRequestModal } from "@/components/Items/LoanRequestModal"
import { ManageItems } from "@/components/Items/ManageItems"
import PendingItems from "@/components/Pending/PendingItems"
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
  limit: z.number().catch(() => Number(localStorage.getItem("limit")) || 12),
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
    .enum(["subject", "genre", "category", "author"])
    .catch(() => (localStorage.getItem("organize_by") as any) || "subject"),
  q: z.string().optional(),
  tab: z.enum(["items", "manage"]).catch("items"),
})

const COLLECTIONS_LIMIT = 12

export const Route = createFileRoute("/_layout/items")({
  component: Items,
  validateSearch: (search) => itemsSearchSchema.parse(search),
})

function ItemsTable() {
  const navigate = useNavigate({ from: Route.fullPath })
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
    tab,
  } = Route.useSearch()
  const { user } = useAuth()
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

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingInfinite,
  } = useInfiniteQuery({
    queryKey: [
      "itemsInfinite",
      {
        sort_by,
        sort_order,
        limit,
        ownerId: user?.id,
        category,
        genre,
        subject,
        author,
        q,
      },
    ],
    queryFn: ({ pageParam = 0 }) =>
      ItemsService.readItems({
        skip: pageParam as number,
        limit: limit,
        sortBy: sort_by,
        sortOrder: sort_order,
        ownerId: user?.id,
        category: category,
        genre: genre,
        subject: subject,
        author: author,
        q: q,
        minimal: true,
        excludeLost: true,
        excludePrivate: true,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.length * limit
      return loadedCount < lastPage.count ? loadedCount : undefined
    },
    initialPageParam: 0,
    enabled:
      !!user &&
      tab === "items" &&
      (display_type === "items" ||
        !!subject ||
        !!author ||
        !!category ||
        !!genre),
  })

  const {
    data: infiniteFacets,
    fetchNextPage: fetchNextFacets,
    hasNextPage: hasNextFacets,
    isFetchingNextPage: isFetchingNextFacets,
    isLoading: isLoadingFacets,
  } = useInfiniteQuery({
    queryKey: ["itemFacetsInfinite", user?.id, organize_by, q],
    queryFn: ({ pageParam = 0 }) =>
      ItemsService.readItemFacets({
        ownerId: user?.id,
        groupBy: organize_by,
        q: q,
        skip: pageParam as number,
        limit: COLLECTIONS_LIMIT,
      }),
    getNextPageParam: (last: any, all) => {
      const loaded = all.length * COLLECTIONS_LIMIT
      return loaded < (last.count || 0) ? loaded : undefined
    },
    initialPageParam: 0,
    enabled:
      !!user &&
      tab === "items" &&
      display_type === "collections" &&
      !subject &&
      !author &&
      !category &&
      !genre,
  })

  // Fetch outgoing loans once for all cards
  useQuery({
    queryKey: ["loans", "outgoing"],
    queryFn: () => LoansService.readOutgoingLoanRequests({}),
    enabled: !!user,
  })

  const updateSearch = useCallback(
    (newParams: any) => {
      navigate({
        search: (prev: any) => ({ ...prev, ...newParams, page: 1 }),
      })
    },
    [navigate],
  )

  const handleOpenCollection = (name: string) => {
    if (organize_by === "author") {
      updateSearch({
        author: name,
        subject: undefined,
        genre: undefined,
        category: undefined,
      })
    } else if (organize_by === "genre") {
      updateSearch({
        genre: name,
        subject: undefined,
        author: undefined,
        category: undefined,
      })
    } else if (organize_by === "category") {
      updateSearch({
        category: name,
        subject: undefined,
        author: undefined,
        genre: undefined,
      })
    } else {
      updateSearch({
        subject: name,
        author: undefined,
        genre: undefined,
        category: undefined,
      })
    }
  }

  const allFacets = useMemo(() => {
    if (!q && user?.collection_index?.[organize_by]) {
      const raw = user.collection_index[organize_by]
      return Object.entries(raw as any)
        .map(([name, data]: any) => ({
          name,
          count: data.count,
          sample_images: data.sample_images,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)) as CollectionItem[]
    }
    return (infiniteFacets?.pages.flatMap((p) => (p as any).data) || []).map(
      (f: any) => ({
        name: f.name,
        count: f.count,
        sample_image: f.sample_image,
        sample_images: f.sample_images,
      }),
    ) as CollectionItem[]
  }, [user, organize_by, infiniteFacets, q])

  const totalFacetCount = useMemo(() => {
    if (!q && user?.collection_index?.[organize_by]) return allFacets.length
    return (infiniteFacets?.pages[0] as any)?.count || 0
  }, [user, organize_by, allFacets, infiniteFacets, q])

  const allItems = useMemo(
    () => infiniteData?.pages.flatMap((p) => p.data as any[]) ?? [],
    [infiniteData],
  )
  const totalItemCount = (infiniteData?.pages[0] as any)?.count || 0
  const totalCount = (user?.collection_index as any)?.total ?? 0

  if (tab === "manage") {
    return (
      <VStack align="stretch" gap={6} width="full" pt={12}>
        <HStack justify="space-between">
          <Heading size="lg">Manage Items</Heading>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateSearch({ tab: "items" })}
          >
            <FaChevronLeft /> Back to Items
          </Button>
        </HStack>
        <ManageItems ownerId={user?.id!} />
      </VStack>
    )
  }

  if (isLoadingInfinite || isLoadingFacets) {
    return <PendingItems />
  }

  const isDrillDown = !!subject || !!author || !!category || !!genre
  const hasCollections = allFacets.length > 0

  if (
    allItems.length === 0 &&
    !isLoadingInfinite &&
    !hasCollections &&
    !isLoadingFacets
  ) {
    if (q || isDrillDown) {
      return (
        <Box mt={8}>
          {isDrillDown && (
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
              mb={4}
            >
              <FaChevronLeft style={{ marginRight: "8px" }} /> Back to
              Collections
            </Button>
          )}
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

  const renderGroup = (groups: any[][]) => (
    <SimpleGrid
      columns={view_mode === "list" ? 1 : { base: 2, sm: 3, md: 4 }}
      gap={view_mode === "list" ? 2 : { base: 2, md: 6 }}
    >
      {groups.map((group) => {
        const firstItem = group[0]
        return view_mode === "list" ? (
          <CompactItemCard
            key={firstItem.id}
            item={group}
            onShowDetails={() => setSelectedItem(firstItem)}
            onReview={(l) => setSelectedLoanForReview(l)}
            onLoanRequest={(i) => setSelectedItemForLoan(i)}
            onExtensionRequest={(l) => setSelectedLoanForExtension(l)}
          />
        ) : (
          <ItemCard
            key={firstItem.id}
            item={group}
            onShowDetails={() => setSelectedItem(firstItem)}
            onReview={(l) => setSelectedLoanForReview(l)}
            onLoanRequest={(i) => setSelectedItemForLoan(i)}
            onExtensionRequest={(l) => setSelectedLoanForExtension(l)}
          />
        )
      })}
    </SimpleGrid>
  )

  return (
    <VStack align="stretch" gap={6} width="full" pt={12}>
      <HStack align="baseline" gap={4}>
        <Heading size="lg">My Items</Heading>
        <Badge variant="subtle" colorPalette="blue" size="md">
          {totalCount} items
        </Badge>
      </HStack>

      <Flex
        justify="space-between"
        align="center"
        width="full"
        wrap="wrap"
        gap={4}
      >
        <HStack gap={4}>
          <AddItem />
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateSearch({ tab: "manage" })}
          >
            <FiSettings /> Manage Items
          </Button>
        </HStack>

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
            updateSearch({
              category: val,
              genre: undefined,
              subject: undefined,
              author: undefined,
            })
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
          showViewToggle={true}
          showFilter={true}
          showSort={true}
          showLimit={true}
        />
      </Flex>

      {display_type === "collections" && !isDrillDown ? (
        <Box>
          <CollectionGrid
            items={allFacets}
            type={organize_by}
            onOpen={handleOpenCollection}
          />
          {hasNextFacets && (
            <Flex justify="center" mt={10} mb={10}>
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
        </Box>
      ) : (
        <Box>
          {isDrillDown && (
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
                <FaChevronLeft style={{ marginRight: "8px" }} /> Collections
              </Button>
              <Heading
                size="lg"
                color="ui.hover"
                textTransform="uppercase"
                letterSpacing="wider"
              >
                Items {organize_by} {subject || author || genre || category}
              </Heading>
            </VStack>
          )}

          {renderGroup(groupItems(allItems as any))}

          {hasNextPage && (
            <Flex justify="center" mt={10} mb={10}>
              <Button
                variant="ghost"
                colorPalette="accent"
                onClick={() => fetchNextPage()}
                loading={isFetchingNextPage}
              >
                Load More Items (Showing {allItems.length} of {totalItemCount})
              </Button>
            </Flex>
          )}
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
    </VStack>
  )
}

function Items() {
  return (
    <Container maxW="full">
      <ItemsTable />
    </Container>
  )
}

export default Items
