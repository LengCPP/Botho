import {
  Badge,
  Button,
  Container,
  EmptyState,
  HStack,
  Heading,
  Skeleton,
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
  Items,
  type LoanPublic,
  Loans,
  Users,
} from "@/client"
import ReviewModal from "@/components/Common/ReviewModal"
import AddItem from "@/components/Items/AddItem"
import { ExtensionRequestModal } from "@/components/Items/ExtensionRequestModal"
import { ItemDetailModal } from "@/components/Items/ItemDetailModal"
import { ItemsBrowser } from "@/components/Items/ItemsBrowser"
import { LoanRequestModal } from "@/components/Items/LoanRequestModal"
import { ManageItems } from "@/components/Items/ManageItems"
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
  item_type: z.string().optional(),
  organize_by: z
    .enum(["subject", "genre", "category", "author"])
    .catch(() => (localStorage.getItem("organize_by") as any) || "subject"),
  q: z.string().optional(),
  tab: z.enum(["items", "manage"]).catch("items"),
})

const COLLECTIONS_LIMIT = 12

function ItemsLoadingSkeleton() {
  return (
    <Container maxW="full" pt={12}>
      <VStack align="stretch" gap={4}>
        <Skeleton height="40px" width="180px" />
        <Skeleton height="48px" />
        <Skeleton height="350px" />
      </VStack>
    </Container>
  )
}

export const Route = createFileRoute("/_layout/items")({
  component: ItemsPage,
  validateSearch: (search) => itemsSearchSchema.parse(search),
  pendingComponent: ItemsLoadingSkeleton,
  loader: async ({ context: { queryClient } }) => {
    // Ensure the current user is warm in cache before the component renders
    await queryClient.ensureQueryData({
      queryKey: ["currentUser"],
      queryFn: () => Users.readUserMe(),
      staleTime: 30_000,
    })
    // Kick off outgoing loans in the background (used by every item card)
    void queryClient.prefetchQuery({
      queryKey: ["loans", "outgoing"],
      queryFn: () => Loans.readOutgoingLoanRequests({}),
      staleTime: 30_000,
    })
  },
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
    item_type,
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
        item_type,
        q,
      },
    ],
    queryFn: ({ pageParam = 0 }) =>
      Items.readItems({
        skip: pageParam as number,
        limit: limit,
        sort_by: sort_by,
        sort_order: sort_order,
        owner_id: user?.id,
        category: category,
        genre: genre,
        subject: subject,
        author: author,
        item_type: item_type as any,
        q: q,
        minimal: true,
        exclude_lost: true,
        exclude_private: true,
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
    queryKey: ["itemFacetsInfinite", user?.id, organize_by, q, item_type],
    queryFn: ({ pageParam = 0 }) =>
      Items.readItemFacets({
        owner_id: user?.id,
        group_by: organize_by,
        q: q,
        item_type: item_type,
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
    queryFn: () => Loans.readOutgoingLoanRequests({}),
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

  const handleOpenCollection = (name: string, iType?: string) => {
    updateSearch({
      item_type: iType,
      author: organize_by === "author" ? name : undefined,
      genre: organize_by === "genre" ? name : undefined,
      category: organize_by === "category" ? name : undefined,
      subject: organize_by === "subject" ? name : undefined,
    })
  }

  const allFacets = useMemo(
    () => infiniteFacets?.pages.flatMap((p) => (p as any).data) || [],
    [infiniteFacets],
  )
  const totalFacetCount = (infiniteFacets?.pages[0] as any)?.count || 0

  const allItems = useMemo(
    () => infiniteData?.pages.flatMap((p) => p.data as any[]) ?? [],
    [infiniteData],
  )
  const totalItemCount = (infiniteData?.pages[0] as any)?.count || 0
  const totalCount = (user?.collection_index as any)?.total ?? 0

  const typeBreakdown: Record<string, { count: number; name: string }> =
    (user?.collection_index as any)?.item_type ?? {}

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

  const hasNoData =
    !isLoadingInfinite &&
    !isLoadingFacets &&
    allItems.length === 0 &&
    allFacets.length === 0 &&
    !q &&
    !subject &&
    !author &&
    !category &&
    !genre

  if (hasNoData) {
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
          <AddItem />
        </EmptyState.Content>
      </EmptyState.Root>
    )
  }

  return (
    <VStack align="stretch" gap={6} width="full" pt={12}>
      <HStack align="baseline" gap={4}>
        <Heading size="lg">My Items</Heading>
        <Badge variant="subtle" colorPalette="blue" size="md">
          {totalCount} items
        </Badge>
      </HStack>

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
        typeBreakdown={typeBreakdown}
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
        totalItemCount={totalItemCount}
        totalFacetCount={totalFacetCount}
        isLoading={
          (isLoadingInfinite && !allItems.length) ||
          (isLoadingFacets && !allFacets.length)
        }
        hasNextItems={hasNextPage}
        hasNextFacets={hasNextFacets}
        isFetchingNextItems={isFetchingNextPage}
        isFetchingNextFacets={isFetchingNextFacets}
        onChangeDisplayType={(t) =>
          updateSearch({
            display_type: t,
            subject: undefined,
            author: undefined,
            genre: undefined,
            category: undefined,
            item_type: undefined,
          })
        }
        onChangeViewMode={(m) => updateSearch({ view_mode: m })}
        onChangeOrganizeBy={(v) =>
          updateSearch({
            organize_by: v,
            subject: undefined,
            author: undefined,
            genre: undefined,
            category: undefined,
            item_type: undefined,
          })
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
            item_type: undefined,
          })
        }
        onFetchNextItems={fetchNextPage}
        onFetchNextFacets={fetchNextFacets}
        onShowDetails={setSelectedItem}
        onReview={setSelectedLoanForReview}
        onLoanRequest={setSelectedItemForLoan}
        onExtensionRequest={setSelectedLoanForExtension}
        leftSlot={
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
        }
        emptyMessage="No items match your filters."
      />

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

function ItemsPage() {
  return (
    <Container maxW="full">
      <ItemsTable />
    </Container>
  )
}

export default Items
