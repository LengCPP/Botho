import {
  Box,
  Button,
  Flex,
  HStack,
  Heading,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react"
import React from "react"
import { FaChevronLeft } from "react-icons/fa"

import {
  CollectionGrid,
  type CollectionItem,
} from "@/components/Items/CollectionGrid"
import { CompactItemCard } from "@/components/Items/CompactItemCard"
import ItemCard from "@/components/Items/ItemCard"
import { ItemsViewOptions } from "@/components/Items/ItemsViewOptions"
import PendingItems from "@/components/Pending/PendingItems"
import { useColorModeValue } from "@/components/ui/color-mode"

interface ItemsBrowserProps {
  // URL/view state
  displayType: "items" | "collections"
  viewMode: "card" | "list"
  organizeBy: string
  sortBy: string
  sortOrder: string
  limit: number
  q?: string
  category?: string
  genre?: string
  subject?: string
  author?: string
  itemType?: string

  // Data (parent fetches, passes down)
  items: any[][]
  facets: CollectionItem[]
  totalItemCount: number
  totalFacetCount: number
  isLoading: boolean
  hasNextItems: boolean
  hasNextFacets: boolean
  isFetchingNextItems: boolean
  isFetchingNextFacets: boolean

  // Handlers – view state
  onChangeDisplayType: (t: "items" | "collections") => void
  onChangeViewMode: (m: "card" | "list") => void
  onChangeOrganizeBy: (v: string) => void
  onChangeSortBy: (v: string) => void
  onChangeSortOrder: (v: string) => void
  onChangeLimit: (v: number) => void
  onChangeQ: (v: string) => void
  onChangeCategory: (v: string | undefined) => void
  onChangeGenre: (v: string | undefined) => void
  onOpenCollection: (name: string, itemType?: string, ownerId?: string) => void
  ownerFilter?: string
  onClearDrilldown: () => void
  onFetchNextItems: () => void
  onFetchNextFacets: () => void

  // Item card handlers
  communityId?: string
  isAdmin?: boolean
  displayOwnerId?: string
  onShowDetails: (item: any) => void
  onReview: (loan: any) => void
  onLoanRequest: (item: any) => void
  onExtensionRequest: (loan: any) => void

  // Customisation
  organizeOptions?: string[]
  leftSlot?: React.ReactNode
  emptyMessage?: string
  showDisplayToggle?: boolean
}

export function ItemsBrowser({
  displayType,
  viewMode,
  organizeBy,
  sortBy,
  sortOrder,
  limit,
  q,
  category,
  genre,
  subject,
  author,
  itemType,
  items,
  facets,
  totalItemCount,
  totalFacetCount,
  isLoading,
  hasNextItems,
  hasNextFacets,
  isFetchingNextItems,
  isFetchingNextFacets,
  onChangeDisplayType,
  onChangeViewMode,
  onChangeOrganizeBy,
  onChangeSortBy,
  onChangeSortOrder,
  onChangeLimit,
  onChangeQ,
  onChangeCategory,
  onChangeGenre,
  onOpenCollection,
  onClearDrilldown,
  onFetchNextItems,
  onFetchNextFacets,
  ownerFilter,
  communityId,
  isAdmin,
  displayOwnerId,
  onShowDetails,
  onReview,
  onLoanRequest,
  onExtensionRequest,
  organizeOptions = ["subject", "genre", "category", "author"],
  leftSlot,
  emptyMessage = "No items found.",
  showDisplayToggle = true,
}: ItemsBrowserProps) {
  const headingColor = useColorModeValue("main.600", "main.300")

  const isDrillDown =
    displayType === "collections"
      ? !!(subject || author || genre || category || ownerFilter)
      : !!(subject || author)

  const isItemsMode = displayType === "items" || isDrillDown

  const itemTypeLabel = itemType === "book" ? "Books" : "Items"
  const currentFilterValue = subject || author || genre || category || ""

  const getDrilldownHeading = () => {
    if (organizeBy === "ownership") return `Contributor's ${itemTypeLabel}`
    const isOthers = currentFilterValue?.toLowerCase() === "others"
    if (isOthers) {
      if (organizeBy === "author") return `${itemTypeLabel} by unknown authors`
      if (organizeBy === "category") return `Uncategorized ${itemTypeLabel}`
      return `${itemTypeLabel} with no ${organizeBy}`
    }
    return organizeBy === "author"
      ? `${itemTypeLabel} by ${currentFilterValue}`
      : `${itemTypeLabel} in ${currentFilterValue}`
  }

  const computedHeading =
    displayType === "collections"
      ? isDrillDown
        ? getDrilldownHeading()
        : "Collections"
      : itemTypeLabel

  const flatItemCount = items.reduce((acc, g) => acc + g.length, 0)

  return (
    <Box>
      <Flex
        justify="space-between"
        align="center"
        mb={6}
        wrap="wrap"
        gap={4}
      >
        <HStack gap={4} align="center">
          {leftSlot}
          <Heading size="md" color={headingColor}>
            {computedHeading}
          </Heading>
        </HStack>

        <ItemsViewOptions
          q={q}
          onChangeQ={onChangeQ}
          viewMode={viewMode}
          onChangeViewMode={onChangeViewMode}
          displayType={displayType}
          onChangeDisplayType={onChangeDisplayType}
          sortBy={sortBy}
          onChangeSortBy={onChangeSortBy}
          sortOrder={sortOrder}
          onChangeSortOrder={onChangeSortOrder}
          limit={limit}
          onChangeLimit={onChangeLimit}
          category={isItemsMode ? category : undefined}
          onChangeCategory={isItemsMode ? onChangeCategory : undefined}
          genre={isItemsMode ? genre : undefined}
          onChangeGenre={isItemsMode ? onChangeGenre : undefined}
          organizeBy={isItemsMode ? undefined : organizeBy}
          onChangeOrganizeBy={isItemsMode ? undefined : onChangeOrganizeBy}
          filterLabel={isItemsMode ? "Filter" : "Group By"}
          showDisplayToggle={showDisplayToggle}
          showFilter
          showSort
          showLimit
          showViewToggle={isItemsMode}
          organizeOptions={organizeOptions}
        />
      </Flex>

      {isLoading && !items.length && !facets.length ? (
        <PendingItems />
      ) : (
        <>
          {isDrillDown && (
            <Button
              variant="ghost"
              size="sm"
              mb={4}
              onClick={onClearDrilldown}
            >
              <FaChevronLeft style={{ marginRight: "8px" }} /> Back to
              Collections
            </Button>
          )}

          {!items.length && !facets.length ? (
            <Text color="gray.500">{emptyMessage}</Text>
          ) : !isItemsMode ? (
            <VStack align="stretch" gap={8}>
              <CollectionGrid
                items={facets}
                type={organizeBy}
                onOpen={onOpenCollection}
              />
              {hasNextFacets && (
                <Flex justify="center" mt={8}>
                  <Button
                    variant="ghost"
                    colorPalette="accent"
                    onClick={onFetchNextFacets}
                    loading={isFetchingNextFacets}
                  >
                    Load More Collections (Showing {facets.length} of{" "}
                    {totalFacetCount})
                  </Button>
                </Flex>
              )}
            </VStack>
          ) : (
            <VStack align="stretch" gap={8}>
              <SimpleGrid
                columns={viewMode === "list" ? 1 : { base: 2, sm: 3, md: 4 }}
                gap={viewMode === "list" ? 2 : { base: 2, md: 6 }}
              >
                {items.map((group) => {
                  const firstItem = group[0]
                  return viewMode === "list" ? (
                    <CompactItemCard
                      key={firstItem.id}
                      item={group}
                      communityId={communityId}
                      isAdmin={isAdmin}
                      onShowDetails={() => onShowDetails(firstItem)}
                      onReview={onReview}
                      onLoanRequest={onLoanRequest}
                      onExtensionRequest={onExtensionRequest}
                    />
                  ) : (
                    <ItemCard
                      key={firstItem.id}
                      item={group}
                      communityId={communityId}
                      isAdmin={isAdmin}
                      displayOwnerId={displayOwnerId}
                      onShowDetails={() => onShowDetails(firstItem)}
                      onReview={onReview}
                      onLoanRequest={onLoanRequest}
                      onExtensionRequest={onExtensionRequest}
                    />
                  )
                })}
              </SimpleGrid>

              {hasNextItems && (
                <Flex justify="center" mt={8}>
                  <Button
                    variant="ghost"
                    colorPalette="accent"
                    onClick={onFetchNextItems}
                    loading={isFetchingNextItems}
                  >
                    Load More Items (Showing {flatItemCount} of{" "}
                    {totalItemCount})
                  </Button>
                </Flex>
              )}
            </VStack>
          )}
        </>
      )}
    </Box>
  )
}
