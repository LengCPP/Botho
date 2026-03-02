import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  NativeSelect,
  Popover,
  Portal,
  Separator,
  Text,
  VStack,
  IconButton,
} from "@chakra-ui/react"
import { useEffect, useRef, useState } from "react"
import {
  FaBook,
  FaFilter,
  FaFolder,
  FaList,
  FaSortAmountDown,
  FaThLarge,
} from "react-icons/fa"
import { FiSearch, FiX } from "react-icons/fi"

import { InputGroup } from "@/components/ui/input-group"

import {
  MenuContent,
  MenuItemGroup,
  MenuRadioItem,
  MenuRadioItemGroup,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu"
import { BOOK_CLASSIFICATION } from "@/constants"

interface ItemsViewOptionsProps {
  viewMode?: "card" | "list"
  onChangeViewMode?: (mode: "card" | "list") => void

  displayType?: "items" | "collections"
  onChangeDisplayType?: (type: "items" | "collections") => void

  sortBy?: string
  onChangeSortBy?: (val: string) => void

  sortOrder?: string
  onChangeSortOrder?: (val: string) => void

  limit?: number
  onChangeLimit?: (val: number) => void

  category?: string
  onChangeCategory?: (val: string | undefined) => void

  genre?: string
  onChangeGenre?: (val: string | undefined) => void

  organizeBy?: string
  onChangeOrganizeBy?: (val: string) => void

  q?: string
  onChangeQ?: (val: string) => void

  // Feature flags to enable/disable specific controls
  showDisplayToggle?: boolean
  showViewToggle?: boolean
  showFilter?: boolean
  showSort?: boolean
  showLimit?: boolean
  showSearch?: boolean

  // Customization
  organizeOptions?: readonly string[]
  filterLabel?: string
}

export function ItemsViewOptions({
  viewMode,
  onChangeViewMode,
  displayType,
  onChangeDisplayType,
  sortBy,
  onChangeSortBy,
  sortOrder,
  onChangeSortOrder,
  limit,
  onChangeLimit,
  category,
  onChangeCategory,
  genre,
  onChangeGenre,
  organizeBy,
  onChangeOrganizeBy,
  q,
  onChangeQ,
  showDisplayToggle = false,
  showViewToggle = true,
  showFilter = false,
  showSort = true,
  showLimit = true,
  showSearch = true,
  organizeOptions = ["subject", "genre", "category", "author"],
  filterLabel = "Filter",
}: ItemsViewOptionsProps) {
  const [localQ, setLocalQ] = useState(q || "")
  const [filterOpen, setFilterOpen] = useState(false)
  // Track the external 'q' to avoid resetting local state on internal changes
  const lastExternalQ = useRef(q || "")
  // Track the last value we sent to the parent to avoid infinite loops
  const lastPropagatedQ = useRef(q || "")
  const isInitialMount = useRef(true)

  // Update local state if the external 'q' prop changes from something other than what we last sent
  useEffect(() => {
    if (q !== lastExternalQ.current) {
      setLocalQ(q || "")
      lastExternalQ.current = q || ""
      lastPropagatedQ.current = q || ""
    }
  }, [q])

  // Debounce logic for internal state changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    const timer = setTimeout(() => {
      const normalizedLocalQ = localQ.trim()
      const normalizedPropagatedQ = lastPropagatedQ.current.trim()

      if (onChangeQ && normalizedLocalQ !== normalizedPropagatedQ) {
        lastPropagatedQ.current = localQ
        lastExternalQ.current = localQ // Prevent the sync effect from firing back
        onChangeQ(localQ)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [localQ, onChangeQ])

  // Labels for display
  const sortLabels: Record<string, string> = {
    created_at: "Date",
    title: "Title",
    author: "Author",
  }

  return (
    <Flex gap={2} align="center" wrap="wrap">
      {/* Search Input */}
      {showSearch && onChangeQ && (
        <Box width={{ base: "full", sm: "200px", md: "250px" }}>
          <InputGroup
            flex="1"
            startElement={<FiSearch />}
            endElement={
              localQ && (
                <IconButton
                  size="xs"
                  variant="ghost"
                  aria-label="Clear search"
                  onClick={() => {
                    setLocalQ("")
                    onChangeQ("")
                  }}
                >
                  <FiX />
                </IconButton>
              )
            }
          >
            <Input
              id="catalogue-search-input"
              name="q"
              placeholder="Find in catalogue..."
              size="sm"
              variant="subtle"
              value={localQ}
              onChange={(e) => setLocalQ(e.target.value)}
            />
          </InputGroup>
        </Box>
      )}

      {/* Display Type Toggle (Items vs Collections) */}
      {showDisplayToggle && onChangeDisplayType && (
        <HStack
          border="1px solid"
          borderColor="border.subtle"
          p={1}
          rounded="md"
          gap={0}
        >
          <Button
            size="xs"
            variant={displayType === "items" ? "solid" : "ghost"}
            onClick={() => onChangeDisplayType("items")}
            title="Item View"
          >
            <FaBook />
          </Button>
          <Button
            size="xs"
            variant={displayType === "collections" ? "solid" : "ghost"}
            onClick={() => onChangeDisplayType("collections")}
            title="Collection View"
          >
            <FaFolder />
          </Button>
        </HStack>
      )}

      {showDisplayToggle && showViewToggle && (
        <Separator orientation="vertical" height="20px" mx={1} />
      )}

      {/* View Mode Toggle (Card vs List) */}
      {showViewToggle && onChangeViewMode && (
        <HStack
          border="1px solid"
          borderColor="border.subtle"
          p={1}
          rounded="md"
          gap={0}
        >
          <Button
            size="xs"
            variant={viewMode === "card" ? "solid" : "ghost"}
            onClick={() => onChangeViewMode("card")}
            title="Card View"
          >
            <FaThLarge />
          </Button>
          <Button
            size="xs"
            variant={viewMode === "list" ? "solid" : "ghost"}
            onClick={() => onChangeViewMode("list")}
            title="List View"
          >
            <FaList />
          </Button>
        </HStack>
      )}

      {/* Organize By / Filter Button */}
      {showFilter && (
        <Popover.Root open={filterOpen} onOpenChange={({ open }) => setFilterOpen(open)}>
          <Popover.Trigger asChild>
            <Button
              variant="outline"
              size="sm"
              colorPalette={organizeBy || category || genre ? "accent" : "gray"}
            >
              <FaFilter /> {filterLabel}
            </Button>
          </Popover.Trigger>
          <Portal>
            <Popover.Positioner>
              <Popover.Content width="300px">
                <Popover.Arrow />
                <Popover.Body>
                  <VStack gap={4} align="stretch">
                    {onChangeOrganizeBy && (
                      <Box>
                        <Text fontSize="sm" fontWeight="bold" mb={2}>
                          Group By
                        </Text>
                        <VStack gap={2} align="stretch">
                          {organizeOptions.map((opt) => (
                            <Button
                              key={opt}
                              size="sm"
                              variant={organizeBy === opt ? "solid" : "ghost"}
                              justifyContent="flex-start"
                              onClick={() => {
                                onChangeOrganizeBy(opt)
                                setFilterOpen(false)
                              }}
                            >
                              {opt.charAt(0).toUpperCase() + opt.slice(1)}
                            </Button>
                          ))}
                        </VStack>
                      </Box>
                    )}

                    {onChangeOrganizeBy && onChangeCategory && (
                      <Separator />
                    )}

                    {onChangeCategory && (
                      <Box>
                        <Text fontSize="sm" fontWeight="bold" mb={1}>
                          Category
                        </Text>
                        <NativeSelect.Root size="sm">
                          <NativeSelect.Field
                            id="category-filter"
                            name="category"
                            value={category || ""}
                            onChange={(e) => {
                              onChangeCategory(e.target.value || undefined)
                              if (onChangeGenre) onChangeGenre(undefined)
                            }}
                          >
                            <option value="">All Categories</option>
                            {Object.keys(BOOK_CLASSIFICATION).map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </NativeSelect.Field>
                          <NativeSelect.Indicator />
                        </NativeSelect.Root>
                      </Box>
                    )}

                    {onChangeGenre && (
                      <Box>
                        <Text fontSize="sm" fontWeight="bold" mb={1}>
                          Genre
                        </Text>
                        <NativeSelect.Root size="sm" disabled={!category}>
                          <NativeSelect.Field
                            id="genre-filter"
                            name="genre"
                            value={genre || ""}
                            onChange={(e) =>
                              onChangeGenre(e.target.value || undefined)
                            }
                          >
                            <option value="">All Genres</option>
                            {category &&
                              BOOK_CLASSIFICATION[category]?.map((gen) => (
                                <option key={gen} value={gen}>{gen}</option>
                              ))}
                          </NativeSelect.Field>
                          <NativeSelect.Indicator />
                        </NativeSelect.Root>
                      </Box>
                    )}

                    {(category || genre) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (onChangeCategory) onChangeCategory(undefined)
                          if (onChangeGenre) onChangeGenre(undefined)
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
      )}

      {/* Sort Button */}
      {showSort && (
        <MenuRoot>
          <MenuTrigger asChild>
            <Button variant="outline" size="sm">
              <FaSortAmountDown /> {sortBy ? sortLabels[sortBy] : "Sort"}
            </Button>
          </MenuTrigger>
          <MenuContent>
            {onChangeSortBy && (
              <MenuItemGroup title="Sort By">
                <MenuRadioItemGroup
                  value={sortBy}
                  onValueChange={(e) => onChangeSortBy(e.value)}
                >
                  <MenuRadioItem value="created_at">Date Created</MenuRadioItem>
                  <MenuRadioItem value="title">Title</MenuRadioItem>
                  <MenuRadioItem value="author">Author</MenuRadioItem>
                </MenuRadioItemGroup>
              </MenuItemGroup>
            )}

            {onChangeSortOrder && (
              <MenuItemGroup title="Order">
                <MenuRadioItemGroup
                  value={sortOrder}
                  onValueChange={(e) => onChangeSortOrder(e.value)}
                >
                  <MenuRadioItem value="desc">Descending</MenuRadioItem>
                  <MenuRadioItem value="asc">Ascending</MenuRadioItem>
                </MenuRadioItemGroup>
              </MenuItemGroup>
            )}

            {showLimit && onChangeLimit && limit && (
              <MenuItemGroup title="Items per page">
                <MenuRadioItemGroup
                  value={String(limit)}
                  onValueChange={(e) => onChangeLimit(Number(e.value))}
                >
                  <MenuRadioItem value="4">4</MenuRadioItem>
                  <MenuRadioItem value="8">8</MenuRadioItem>
                  <MenuRadioItem value="16">16</MenuRadioItem>
                  <MenuRadioItem value="32">32</MenuRadioItem>
                </MenuRadioItemGroup>
              </MenuItemGroup>
            )}
          </MenuContent>
        </MenuRoot>
      )}
    </Flex>
  )
}
