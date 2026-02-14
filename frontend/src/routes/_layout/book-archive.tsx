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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
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
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"
import { Radio, RadioGroup } from "@/components/ui/radio"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"

const archiveSearchSchema = z.object({
  page: z.number().catch(1),
  tab: z.string().catch("browse"),
  filter_missing: z.string().optional(),
})

const PER_PAGE = 10

function getBooksQueryOptions({
  page,
  filter_missing,
}: { page: number; filter_missing?: string }) {
  return {
    queryFn: () =>
      ItemsService.listBookRegistry({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
        filterMissing: filter_missing === "all" ? undefined : filter_missing,
      }),
    queryKey: ["book-archive", { page, filter_missing }],
  }
}

export const Route = createFileRoute("/_layout/book-archive")({
  component: BookArchive,
  validateSearch: (search) => archiveSearchSchema.parse(search),
})

type SelectedBook = { author: string; title: string; isbn?: string | null }

function BooksTable({
  selectedBooks,
  onSelectionChange,
}: {
  selectedBooks: SelectedBook[]
  onSelectionChange: (books: SelectedBook[]) => void
}) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const navigate = useNavigate({ from: Route.fullPath })
  const { page, filter_missing } = Route.useSearch()

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getBooksQueryOptions({ page, filter_missing }),
    placeholderData: (prevData) => prevData,
  })

  // Listen for WebSocket updates
  useEffect(() => {
    const handleMessage = (event: CustomEvent) => {
      const message = event.detail
      if (message.type === "BOOK_ARCHIVE_UPDATED") {
        const action = message.action || "enriched"
        showSuccessToast(`Archive updated: ${message.count} books ${action}`)
        queryClient.invalidateQueries({ queryKey: ["book-archive"] })
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

  const books = data?.data
  const totalCount = data?.count || 0

  const deleteMutation = useMutation({
    mutationFn: ({ author, title }: { author: string; title: string }) =>
      ItemsService.deleteWorkMetadata({ author, title }),
    onSuccess: () => {
      showSuccessToast("Book deleted from registry")
      queryClient.invalidateQueries({ queryKey: ["book-archive"] })
    },
    onError: () => {
      showErrorToast("Failed to delete book")
    },
  })

  const setPage = (page: number) =>
    navigate({
      search: (prev: any) => ({ ...prev, page }),
    })

  const handleDelete = (author: string, title: string) => {
    if (
      window.confirm(`Are you sure you want to delete "${title}" by ${author}?`)
    ) {
      deleteMutation.mutate({ author, title })
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked && books) {
      const newSelection = [...selectedBooks]
      for (const book of books) {
        if (
          !newSelection.some(
            (b) => b.author === book.author && b.title === book.title,
          )
        ) {
          newSelection.push({ author: book.author, title: book.title, isbn: book.isbn })
        }
      }
      onSelectionChange(newSelection)
    } else if (books) {
      const newSelection = selectedBooks.filter(
        (b) =>
          !books.some(
            (book) => book.author === b.author && book.title === b.title,
          ),
      )
      onSelectionChange(newSelection)
    }
  }

  const handleSelectRow = (
    book: SelectedBook,
    checked: boolean,
  ) => {
    if (checked) {
      onSelectionChange([...selectedBooks, book])
    } else {
      onSelectionChange(
        selectedBooks.filter(
          (b) => b.author !== book.author || b.title !== book.title,
        ),
      )
    }
  }

  if (isLoading) {
    return <Text p={8}>Loading archive...</Text>
  }

  const allSelected = books?.length
    ? books.every((book) =>
        selectedBooks.some(
          (b) => b.author === book.author && b.title === book.title,
        ),
      )
    : false

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
          {books?.map((book) => {
            const isSelected = selectedBooks.some(
              (b) => b.author === book.author && b.title === book.title,
            )
            return (
              <Table.Row
                key={`${book.author}-${book.title}`}
                opacity={isPlaceholderData ? 0.5 : 1}
                bg={isSelected ? "bg.subtle" : undefined}
                verticalAlign="top"
              >
                <Table.Cell>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(e) =>
                      handleSelectRow(
                        { author: book.author, title: book.title, isbn: book.isbn },
                        !!e.checked,
                      )
                    }
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
                  <Text
                    fontSize="xs"
                    lineClamp={4}
                    title={book.description || ""}
                  >
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
                        {book.tags.slice(0, 5).map((tag) => (
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
                <Table.Cell whiteSpace="nowrap">
                  {book.isbn || "N/A"}
                </Table.Cell>
                <Table.Cell textAlign="right">
                  <IconButton
                    aria-label="Delete book"
                    variant="ghost"
                    colorPalette="red"
                    size="sm"
                    onClick={() => handleDelete(book.author, book.title)}
                    loading={deleteMutation.isPending}
                  >
                    <FiTrash2 />
                  </IconButton>
                </Table.Cell>
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table.Root>

      {totalCount > PER_PAGE && (
        <Flex justifyContent="flex-end">
          <PaginationRoot
            count={totalCount}
            pageSize={PER_PAGE}
            onPageChange={({ page }) => setPage(page)}
          >
            <Flex>
              <PaginationPrevTrigger />
              <PaginationItems />
              <PaginationNextTrigger />
            </Flex>
          </PaginationRoot>
        </Flex>
      )}
    </VStack>
  )
}

function BookArchive() {
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: Route.fullPath })
  const { page, tab, filter_missing } = Route.useSearch()
  const { data } = useQuery(getBooksQueryOptions({ page, filter_missing }))
  const totalCount = data?.count || 0
  const { user } = useAuth()
  const [selectedBooks, setSelectedBooks] = useState<
    { author: string; title: string }[]
  >([])

  // Enrichment Options State
  const [enrichFields, setEnrichFields] = useState<string[]>([
    "description",
    "isbn",
    "image_url",
    "category",
    "genre",
    "tags",
  ])
  const [enrichSource, setEnrichSource] = useState("auto")
  const [overwriteExisting, setOverwriteExisting] = useState(false)
  const [isEnrichDialogOpen, setIsEnrichDialogOpen] = useState(false)

  const { showSuccessToast, showErrorToast } = useCustomToast()
  const maintenanceMutation = useMutation({
    mutationFn: () => ItemsService.triggerBulkClassify(),
    onSuccess: () => {
      showSuccessToast("Maintenance task started in background")
    },
    onError: () => {
      showErrorToast("Failed to start maintenance task")
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

  const enrichMutation = useMutation({
    mutationFn: (data: {
      books: { author: string; title: string }[]
      fields_to_update: string[]
      source_api: string
      overwrite: boolean
    }) => ItemsService.triggerEnrichBooks({ requestBody: data as any }),
    onSuccess: () => {
      showSuccessToast(`Enrichment started for ${selectedBooks.length} books`)
      setSelectedBooks([])
      setIsEnrichDialogOpen(false)
    },
    onError: () => {
      showErrorToast("Failed to start enrichment task")
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
    setEnrichFields((prev) => {
      if (isChecked) {
        return prev.includes(field) ? prev : [...prev, field]
      }
      return prev.filter((f) => f !== field)
    })
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
              {selectedBooks.length > 0 && (
                <DialogRoot
                  open={isEnrichDialogOpen}
                  onOpenChange={(e) => setIsEnrichDialogOpen(e.open)}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" variant="solid" colorPalette="purple">
                      <FiZap /> Enrich Selected ({selectedBooks.length})
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        Enrich {selectedBooks.length} Books
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
                            Fields to Fetch
                          </Text>
                          <Stack gap={2}>
                            {ENRICH_OPTIONS.map((opt) => (
                              <Checkbox
                                key={opt.value}
                                inputProps={{ id: `enrich-field-${opt.value}` }}
                                checked={enrichFields.includes(opt.value)}
                                onCheckedChange={(e) =>
                                  handleFieldChange(opt.value, !!e.checked)
                                }
                              >
                                {opt.label}
                              </Checkbox>
                            ))}
                          </Stack>
                        </VStack>

                        <VStack align="start" gap={2} width="full">
                          <Text fontWeight="medium" fontSize="sm">
                            Overwrite Options
                          </Text>
                          <Checkbox
                            inputProps={{ id: "enrich-overwrite" }}
                            checked={overwriteExisting}
                            onCheckedChange={(e) =>
                              setOverwriteExisting(!!e.checked)
                            }
                          >
                            Overwrite existing data if found
                          </Checkbox>
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
                        onClick={() =>
                          enrichMutation.mutate({
                            books: selectedBooks,
                            fields_to_update: enrichFields,
                            source_api: enrichSource,
                            overwrite: overwriteExisting,
                          })
                        }
                      >
                        Start Enrichment
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </DialogRoot>
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
                variant="outline"
                colorPalette="orange"
                onClick={() => maintenanceMutation.mutate()}
                loading={maintenanceMutation.isPending}
              >
                <FiRefreshCw /> Auto-Classify
              </Button>
              <Button
                size="sm"
                variant="outline"
                colorPalette="blue"
                onClick={() => syncRegistryMutation.mutate()}
                loading={syncRegistryMutation.isPending}
              >
                <FiRefreshCw /> Sync Registry
              </Button>
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
                selectedBooks={selectedBooks}
                onSelectionChange={setSelectedBooks}
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
