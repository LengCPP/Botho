import {
  Box,
  Button,
  Flex,
  HStack,
  Popover,
  Portal,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react"
import type React from "react"
import {
  FaBook,
  FaFilter,
  FaFolder,
  FaList,
  FaSortAmountDown,
  FaThLarge,
} from "react-icons/fa"

import { useColorModeValue } from "@/components/ui/color-mode"
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

  // Feature flags to enable/disable specific controls
  showDisplayToggle?: boolean
  showViewToggle?: boolean
  showFilter?: boolean
  showSort?: boolean
  showLimit?: boolean

  // Customization
  organizeOptions?: readonly string[]
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
  showDisplayToggle = false,
  showViewToggle = true,
  showFilter = false,
  showSort = true,
  showLimit = true,
  organizeOptions = ["subject", "genre", "category", "author"],
}: ItemsViewOptionsProps) {
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
        <Popover.Root>
          <Popover.Trigger asChild>
            <Button
              variant="outline"
              size="sm"
              colorPalette={
                displayType === "collections" || category || genre
                  ? "accent"
                  : "gray"
              }
            >
              <FaFilter />{" "}
              {displayType === "collections" ? "Organize" : "Filter"}
            </Button>
          </Popover.Trigger>
          <Portal>
            <Popover.Positioner>
              <Popover.Content width="300px">
                <Popover.Arrow />
                <Popover.Body>
                  <VStack gap={4} align="stretch">
                    {displayType === "collections" && onChangeOrganizeBy ? (
                      <Box>
                        <Text fontSize="sm" fontWeight="bold" mb={2}>
                          Organize Collections By
                        </Text>
                        <VStack gap={2} align="stretch">
                          {organizeOptions.map((opt) => (
                            <Button
                              key={opt}
                              size="sm"
                              variant={organizeBy === opt ? "solid" : "ghost"}
                              justifyContent="flex-start"
                              onClick={() => onChangeOrganizeBy(opt)}
                            >
                              {opt.charAt(0).toUpperCase() + opt.slice(1)}
                            </Button>
                          ))}
                        </VStack>
                      </Box>
                    ) : (
                      <>
                        {onChangeCategory && (
                          <Box>
                            <Text fontSize="sm" fontWeight="bold" mb={1}>
                              Category
                            </Text>
                            <select
                              value={category || ""}
                              onChange={(e) => {
                                onChangeCategory(e.target.value || undefined)
                                if (onChangeGenre) onChangeGenre(undefined)
                              }}
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
                        )}

                        {onChangeGenre && (
                          <Box>
                            <Text fontSize="sm" fontWeight="bold" mb={1}>
                              Genre
                            </Text>
                            <select
                              value={genre || ""}
                              onChange={(e) =>
                                onChangeGenre(e.target.value || undefined)
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
                      </>
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
              <FaSortAmountDown /> Sort
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
                  <MenuRadioItem value="title">Name</MenuRadioItem>
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
                  <MenuRadioItem value="12">12</MenuRadioItem>
                  <MenuRadioItem value="24">24</MenuRadioItem>
                  <MenuRadioItem value="10000">All</MenuRadioItem>
                </MenuRadioItemGroup>
              </MenuItemGroup>
            )}
          </MenuContent>
        </MenuRoot>
      )}
    </Flex>
  )
}
