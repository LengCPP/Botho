import { Checkbox } from "@/components/ui/checkbox"
import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Heading,
  IconButton,
  Image,
  NativeSelect,
  Stack,
  Table,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import React, { useEffect, useState, useMemo, useCallback } from "react"
import {
  FiArchive,
  FiFilePlus,
  FiFilter,
  FiRefreshCw,
  FiTrash2,
  FiZap,
} from "react-icons/fi"
import { z } from "zod"

import { ItemsService } from "@/client"
import { ImportItems } from "@/components/Common/ImportItems"
import {
  DialogActionTrigger,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Radio, RadioGroup } from "@/components/ui/radio"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"

const archiveSearchSchema = z.object({
  page: z.number().catch(1),
  tab: z.string().catch("browse"),
  filter_missing: z.string().optional(),
})

const PER_PAGE = 100

export const Route = createFileRoute("/_layout/book-archive")({
  component: BookArchive,
  validateSearch: (search) => archiveSearchSchema.parse(search),
})

const BookRow = React.memo(
  ({
    book,
    isSelected,
    onSelect,
    onDelete,
    isDeleting,
  }: {
    book: any
    isSelected: boolean
    onSelect: (checked: boolean) => void
    onDelete: (author: string, title: string) => void
    isDeleting: boolean
  }) => {
    return (
      <Table.Row bg={isSelected ? "bg.subtle" : undefined} verticalAlign="top">
        <Table.Cell>
          <Checkbox
            checked={isSelected}
            onCheckedChange={(e) => onSelect(!!e.checked)}
          />
        </Table.Cell>
        <Table.Cell>
          {book.image_url?.startsWith("/") ? (
            <Image
              src={book.image_url}
              alt={book.title}
              h="80px"
              objectFit="contain"
            />
          ) : (
            <Box
              h="80px"
              w="50px"
              bg="bg.muted"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Text fontSize="xs" color="fg.muted">
                No Img
              </Text>
            </Box>
          )}
        </Table.Cell>
        <Table.Cell whiteSpace="normal">
          <VStack align="start" gap={1}>
            <Text fontWeight="bold">{book.title}</Text>
            <Text fontSize="sm" color="fg.muted">
              {book.author}
            </Text>
          </VStack>
        </Table.Cell>
        <Table.Cell whiteSpace="normal">
          <Text fontSize="xs" lineClamp={4} title={book.description || ""}>
            {book.description || "No description"}
          </Text>
        </Table.Cell>
        <Table.Cell whiteSpace="normal">
          <VStack align="start" gap={1}>
            {book.category && (
              <Badge variant="solid" colorPalette="blue" size="sm">
                {book.category}
              </Badge>
            )}
            {book.genre && (
              <Badge variant="outline" colorPalette="teal" size="xs">
                {book.genre}
              </Badge>
            )}
            {book.tags && book.tags.length > 0 && (
              <Flex wrap="wrap" gap={1}>
                {book.tags.slice(0, 5).map((tag: string) => (
                  <Badge
                    key={tag}
                    variant="subtle"
                    colorPalette="gray"
                    size="xs"
                  >
                    {tag}
                  </Badge>
                ))}
                {book.tags.length > 5 && (
                  <Text fontSize="xs" color="fg.muted">
                    +{book.tags.length - 5}
                  </Text>
                )}
              </Flex>
            )}
          </VStack>
        </Table.Cell>
        <Table.Cell whiteSpace="nowrap">{book.isbn || "N/A"}</Table.Cell>
        <Table.Cell textAlign="right">
          <IconButton
            aria-label="Delete book"
            variant="ghost"
            colorPalette="red"
            size="sm"
            onClick={() => onDelete(book.author, book.title)}
            loading={isDeleting}
          >
            <FiTrash2 />
          </IconButton>
        </Table.Cell>
      </Table.Row>
    )
  },
)

function BooksTable({
  selectedKeys,
  onSelectionChange,
}: {
  selectedKeys: Set<string>
  onSelectionChange: (update: (prev: Set<string>) => Set<string>) => void
}) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { filter_missing } = Route.useSearch()

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteQuery({
      queryKey: ["book-archive-infinite", { filter_missing }],
      queryFn: ({ pageParam = 0 }) =>
        ItemsService.listBookRegistry({
          skip: pageParam as number,
          limit: PER_PAGE,
          filterMissing: filter_missing === "all" ? undefined : filter_missing,
        }),
      getNextPageParam: (lastPage, allPages) => {
        const loadedCount = (allPages?.length || 0) * PER_PAGE
        return loadedCount < lastPage.count ? loadedCount : undefined
      },
      initialPageParam: 0,
    })

  // Listen for WebSocket updates
  useEffect(() => {
    const handleMessage = (event: CustomEvent) => {
      const message = event.detail
      if (message.type === "BOOK_ARCHIVE_UPDATED") {
        const action = message.action || "enriched"
        showSuccessToast(`Archive updated: ${message.count} books ${action}`)
        queryClient.invalidateQueries({ queryKey: ["book-archive-infinite"] })
        queryClient.invalidateQueries({ queryKey: ["book-archive-count"] })
      }
    }

    window.addEventListener("websocket-message" as any, handleMessage as any)
    return () => {
      window.removeEventListener(
        "websocket-message" as any,
        handleMessage as any,
      )
    }
  }, [queryClient, showSuccessToast])

  const allBooks = useMemo(
    () => data?.pages?.flatMap((p) => p.data || []) || [],
    [data],
  )
  const totalCount = data?.pages?.[0]?.count || 0

  const deleteMutation = useMutation({
    mutationFn: ({ author, title }: { author: string; title: string }) =>
      ItemsService.deleteWorkMetadata({ author, title }),
    onSuccess: () => {
      showSuccessToast("Book deleted from registry")
      queryClient.invalidateQueries({ queryKey: ["book-archive-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["book-archive-count"] })
    },
    onError: () => {
      showErrorToast("Failed to delete book")
    },
  })

  const handleDelete = useCallback(
    (author: string, title: string) => {
      if (
        window.confirm(
          `Are you sure you want to delete "${title}" by ${author}?`,
        )
      ) {
        deleteMutation.mutate({ author, title })
      }
    },
    [deleteMutation],
  )

  const handleSelectAll = (checked: boolean) => {
    if (checked && allBooks) {
      const newSelection = new Set<string>()
      for (const book of allBooks) {
        newSelection.add(`${book.author}|${book.title}`)
      }
      onSelectionChange(() => newSelection)
    } else {
      onSelectionChange(() => new Set())
    }
  }

  const handleSelectRow = useCallback(
    (key: string, checked: boolean) => {
      onSelectionChange((prev) => {
        const next = new Set(prev)
        if (checked) {
          next.add(key)
        } else {
          next.delete(key)
        }
        return next
      })
    },
    [onSelectionChange],
  )

  if (isLoading) {
    return <Text p={8}>Loading archive...</Text>
  }

  const allSelected =
    allBooks.length > 0 &&
    allBooks.every((book) => selectedKeys.has(`${book.author}|${book.title}`))

  return (
    <VStack align="stretch" gap={4}>
      <Table.Root size="sm" variant="outline">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w="40px">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(e) => handleSelectAll(!!e.checked)}
              />
            </Table.ColumnHeader>
            <Table.ColumnHeader w="80px">Cover</Table.ColumnHeader>
            <Table.ColumnHeader width="20%">Title & Author</Table.ColumnHeader>
            <Table.ColumnHeader width="30%">Description</Table.ColumnHeader>
            <Table.ColumnHeader width="20%">Classification</Table.ColumnHeader>
            <Table.ColumnHeader>ISBN</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="right">Actions</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {allBooks.map((book) => {
            const key = `${book.author}|${book.title}`
            return (
              <BookRow
                key={key}
                book={book}
                isSelected={selectedKeys.has(key)}
                onSelect={(checked) => handleSelectRow(key, checked)}
                onDelete={handleDelete}
                isDeleting={
                  deleteMutation.isPending &&
                  deleteMutation.variables?.author === book.author &&
                  deleteMutation.variables?.title === book.title
                }
              />
            )
          })}
        </Table.Body>
      </Table.Root>

      {hasNextPage && (
        <Flex justify="center" mt={4} mb={8}>
          <Button
            variant="outline"
            colorPalette="accent"
            onClick={() => fetchNextPage()}
            loading={isFetchingNextPage}
          >
            Load More (Showing {allBooks.length} of {totalCount})
          </Button>
        </Flex>
      )}

      {!hasNextPage && allBooks.length > 0 && (
        <Text textAlign="center" color="gray.500" py={4}>
          You've reached the end of the archive.
        </Text>
      )}
    </VStack>
  )
}

function BookArchive() {
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: Route.fullPath })
  const { tab, filter_missing } = Route.useSearch()
  const { user } = useAuth()
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  const { data: firstPage } = useQuery({
    queryKey: ["book-archive-count", { filter_missing }],
    queryFn: () =>
      ItemsService.listBookRegistry({
        skip: 0,
        limit: 1,
        filterMissing: filter_missing === "all" ? undefined : filter_missing,
      }),
  })
  const totalCount = firstPage?.count || 0

  // Enrichment Options State
  const [fieldsToOverwrite, setFieldsToOverwrite] = useState<string[]>([
    "description",
    "image_url",
    "category",
    "genre",
    "tags",
  ])
  const [enrichSource, setEnrichSource] = useState("auto")
  const [isEnrichDialogOpen, setIsEnrichDialogOpen] = useState(false)

  const { showSuccessToast, showErrorToast } = useCustomToast()

  const enrichMutation = useMutation({
    mutationFn: (data: {
      books: { author: string; title: string }[]
      fields_to_overwrite: string[]
      source_api: string
    }) => ItemsService.triggerEnrichBooks({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast(`Enrichment started for ${selectedKeys.size} books`)
      setSelectedKeys(new Set())
      setIsEnrichDialogOpen(false)
    },
    onError: () => {
      showErrorToast("Failed to start enrichment task")
    },
  })

  const maintenanceMutation = useMutation({
    mutationFn: () => ItemsService.triggerBulkClassify(),
    onSuccess: () => {
      showSuccessToast("Maintenance task started in background")
    },
    onError: () => {
      showErrorToast("Failed to start maintenance task")
    },
  })

  const aiClassifyMutation = useMutation({
    mutationFn: (data: { books: { author: string; title: string }[] }) =>
      ItemsService.triggerAiClassifyBooks({ requestBody: data as any }),
    onSuccess: () => {
      showSuccessToast(
        `AI Classification started for ${selectedKeys.size} books`,
      )
      setSelectedKeys(new Set())
    },
    onError: () => {
      showErrorToast("Failed to start AI classification task")
    },
  })

  const syncRegistryMutation = useMutation({
    mutationKey: ["sync-registry"],
    mutationFn: () => ItemsService.syncItemsToRegistry(),
    onSuccess: () => {
      showSuccessToast("Registry sync started")
      queryClient.invalidateQueries({ queryKey: ["book-archive"] })
    },
    onError: () => {
      showErrorToast("Failed to start registry sync")
    },
  })

  const handleTabChange = (value: string) => {
    navigate({
      search: (prev: any) => ({ ...prev, tab: value, page: 1 }),
    })
  }

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    navigate({
      search: (prev: any) => ({
        ...prev,
        filter_missing: e.target.value,
        page: 1,
      }),
    })
  }

  const ENRICH_OPTIONS = [
    { value: "description", label: "Description" },
    { value: "isbn", label: "ISBN" },
    { value: "image_url", label: "Cover Image" },
    { value: "category", label: "Category" },
    { value: "genre", label: "Genre" },
    { value: "tags", label: "Tags/Subjects" },
  ]

  const handleFieldChange = (field: string, isChecked: boolean) => {
    setFieldsToOverwrite((prev) => {
      if (isChecked) {
        return prev.includes(field) ? prev : [...prev, field]
      }
      return prev.filter((f) => f !== field)
    })
  }

  const handleStartEnrichment = () => {
    const books = Array.from(selectedKeys).map((key) => {
      const [author, title] = key.split("|")
      return { author, title }
    })
    enrichMutation.mutate({
      books,
      fields_to_overwrite: fieldsToOverwrite,
      source_api: enrichSource,
    })
  }

  const handleStartAiClassification = () => {
    const books = Array.from(selectedKeys).map((key) => {
      const [author, title] = key.split("|")
      return { author, title }
    })
    aiClassifyMutation.mutate({ books })
  }

  return (
    <Container maxW="full">
      <VStack align="start" pt={12} pb={6} gap={6} width="full">
        <Flex
          width="full"
          justify="space-between"
          align="center"
          wrap="wrap"
          gap={4}
        >
          <HStack align="baseline" gap={4}>
            <Heading size="lg">Book Archive Management</Heading>
            <Badge variant="subtle" colorPalette="blue" size="md">
              {totalCount} Total Books
            </Badge>
          </HStack>

          {tab === "browse" && user?.is_superuser && (
            <HStack gap={2}>
              {selectedKeys.size > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="solid"
                    colorPalette="orange"
                    onClick={handleStartAiClassification}
                    loading={aiClassifyMutation.isPending}
                  >
                    <FiZap /> AI Classify Selected ({selectedKeys.size})
                  </Button>
                  <DialogRoot
                    open={isEnrichDialogOpen}
                    onOpenChange={(e) => setIsEnrichDialogOpen(e.open)}
                  >
                    <DialogTrigger asChild>
                      <Button size="sm" variant="solid" colorPalette="purple">
                        <FiZap /> Enrich Selected ({selectedKeys.size})
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          Enrich {selectedKeys.size} Books
                        </DialogTitle>
                      </DialogHeader>
                      <DialogBody>
                        <Stack gap={6}>
                          <Field label="Source API">
                            <RadioGroup
                              value={enrichSource}
                              onValueChange={(e) => setEnrichSource(e.value)}
                            >
                              <Stack direction="row" gap={4}>
                                <Radio value="auto">
                                  Auto (Google → OpenLib)
                                </Radio>
                                <Radio value="google_books">
                                  Google Books Only
                                </Radio>
                                <Radio value="open_library">
                                  Open Library Only
                                </Radio>
                              </Stack>
                            </RadioGroup>
                          </Field>

                          <VStack align="start" gap={2} width="full">
                            <Text fontWeight="medium" fontSize="sm">
                              Fields to Overwrite
                            </Text>
                            <Text fontSize="xs" color="fg.muted">
                              Selected fields will be updated even if they
                              already have data. Unselected fields will only be
                              filled if current data is missing.
                            </Text>
                            <Stack gap={2}>
                              {ENRICH_OPTIONS.map((opt) => (
                                <Checkbox
                                  key={opt.value}
                                  checked={fieldsToOverwrite.includes(
                                    opt.value,
                                  )}
                                  onCheckedChange={(e) =>
                                    handleFieldChange(opt.value, !!e.checked)
                                  }
                                >
                                  {opt.label}
                                </Checkbox>
                              ))}
                            </Stack>
                          </VStack>
                        </Stack>
                      </DialogBody>
                      <DialogFooter>
                        <DialogActionTrigger asChild>
                          <Button variant="outline">Cancel</Button>
                        </DialogActionTrigger>
                        <Button
                          colorPalette="purple"
                          loading={enrichMutation.isPending}
                          onClick={handleStartEnrichment}
                        >
                          Start Enrichment
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </DialogRoot>
                </>
              )}

              <NativeSelect.Root size="sm" width="200px">
                <NativeSelect.Field
                  placeholder="Smart Filter (All)"
                  value={filter_missing || "all"}
                  onChange={handleFilterChange}
                >
                  <option value="all">All Books</option>
                  <option value="image">Missing Image</option>
                  <option value="description">Missing Description</option>
                  <option value="isbn">Missing ISBN</option>
                  <option value="category">Missing Category</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator>
                  <FiFilter />
                </NativeSelect.Indicator>
              </NativeSelect.Root>

              <Button
                size="sm"
                variant="solid"
                colorPalette="orange"
                onClick={() => maintenanceMutation.mutate()}
                loading={maintenanceMutation.isPending}
                title="Consolidate duplicates and fix common archive data issues using AI"
              >
                <FiZap /> AI Classify Archive
              </Button>
              <Button
                size="sm"
                variant="outline"
                colorPalette="blue"
                onClick={() => syncRegistryMutation.mutate()}
                loading={syncRegistryMutation.isPending}
                title="Scan all user items and ensure they are recorded in the archive"
              >
                <FiRefreshCw /> Sync from Items
              </Button>
              <IconButton
                variant="ghost"
                onClick={() => {
                  queryClient.invalidateQueries({
                    queryKey: ["book-archive-infinite"],
                  })
                  queryClient.invalidateQueries({
                    queryKey: ["book-archive-count"],
                  })
                }}
                loading={
                  queryClient.isFetching({
                    queryKey: ["book-archive-infinite"],
                  }) > 0
                }
                title="Refresh Archive"
              >
                <FiRefreshCw />
              </IconButton>
            </HStack>
          )}
        </Flex>

        <Tabs.Root
          value={tab}
          onValueChange={(details) => handleTabChange(details.value)}
          width="full"
          variant="enclosed"
        >
          <Tabs.List gap={4}>
            <Tabs.Trigger value="browse">
              <FiArchive /> Browse Archive
            </Tabs.Trigger>
            {user?.is_superuser && (
              <Tabs.Trigger value="import">
                <FiFilePlus /> Import & Add
              </Tabs.Trigger>
            )}
          </Tabs.List>

          <Box mt={6}>
            <Tabs.Content value="browse">
              <BooksTable
                selectedKeys={selectedKeys}
                onSelectionChange={setSelectedKeys}
              />
            </Tabs.Content>

            <Tabs.Content value="import">
              <Box
                p={6}
                border="1px solid"
                borderColor="border.subtle"
                borderRadius="lg"
                bg="bg.panel"
              >
                <ImportItems isArchiveImport />
              </Box>
            </Tabs.Content>
          </Box>
        </Tabs.Root>
      </VStack>
    </Container>
  )
}
