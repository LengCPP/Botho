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
  Table,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { FiRefreshCw, FiTrash2 } from "react-icons/fi"
import { z } from "zod"

import { ItemsService } from "@/client"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"
import useCustomToast from "@/hooks/useCustomToast"

const archiveSearchSchema = z.object({
  page: z.number().catch(1),
})

const PER_PAGE = 10

function getBooksQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      ItemsService.listBookRegistry({
        skip: (page - 1) * PER_PAGE,
        limit: PER_PAGE,
      }),
    queryKey: ["book-archive", { page }],
  }
}

export const Route = createFileRoute("/_layout/book-archive")({
  component: BookArchive,
  validateSearch: (search) => archiveSearchSchema.parse(search),
})

function BooksTable() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const navigate = useNavigate({ from: Route.fullPath })
  const { page } = Route.useSearch()

  const {
    data,
    isLoading,
    isPlaceholderData,
  } = useQuery({
    ...getBooksQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

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

  if (isLoading) {
    return <Text p={8}>Loading archive...</Text>
  }

  return (
    <>
      <Table.Root size="sm" variant="outline">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w="80px">Cover</Table.ColumnHeader>
            <Table.ColumnHeader>Title</Table.ColumnHeader>
            <Table.ColumnHeader>Author</Table.ColumnHeader>
            <Table.ColumnHeader>Category</Table.ColumnHeader>
            <Table.ColumnHeader>ISBN</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="right">Actions</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {books?.map((book) => (
            <Table.Row
              key={`${book.author}-${book.title}`}
              opacity={isPlaceholderData ? 0.5 : 1}
            >
              <Table.Cell>
                {book.image_url ? (
                  <Image
                    src={book.image_url}
                    alt={book.title}
                    h="60px"
                    objectFit="contain"
                    fallback={<Box h="60px" w="40px" bg="bg.muted" />}
                  />
                ) : (
                  <Box h="60px" w="40px" bg="bg.muted" />
                )}
              </Table.Cell>
              <Table.Cell fontWeight="medium">{book.title}</Table.Cell>
              <Table.Cell>{book.author}</Table.Cell>
              <Table.Cell>
                <Badge variant="subtle" colorPalette="accent">
                  {book.category || "N/A"}
                </Badge>
              </Table.Cell>
              <Table.Cell>{book.isbn || "N/A"}</Table.Cell>
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
          ))}
        </Table.Body>
      </Table.Root>

      {totalCount > PER_PAGE && (
        <Flex justifyContent="flex-end" mt={4}>
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
    </>
  )
}

function BookArchive() {
  const queryClient = useQueryClient()
  const { page } = Route.useSearch()
  const { data } = useQuery(getBooksQueryOptions({ page }))
  const totalCount = data?.count || 0

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
    queryKey: ["sync-registry"],
    mutationFn: () => (ItemsService as any).syncItemsToRegistry(),
    onSuccess: () => {
      showSuccessToast("Registry sync started")
      queryClient.invalidateQueries({ queryKey: ["book-archive"] })
    },
    onError: () => {
      showErrorToast("Failed to start registry sync")
    },
  })

  return (
    <Container maxW="full">
      <Flex justify="space-between" align="baseline" pt={12} pb={6} wrap="wrap" gap={4}>
        <HStack align="baseline" gap={4}>
          <Heading size="lg">
            Book Archive Management
          </Heading>
          <Badge variant="subtle" colorPalette="blue" size="md">
            {totalCount} Total Books
          </Badge>
        </HStack>
        <Box border="1px solid" borderColor="border.subtle" p={4} rounded="md" bg="bg.muted">
          <VStack align="start" gap={2}>
            <Text fontSize="xs" fontWeight="bold" color="fg.muted">Maintenance Actions</Text>
            <HStack gap={2}>
              <Button 
                size="xs" 
                colorPalette="orange" 
                variant="solid" 
                onClick={() => maintenanceMutation.mutate()}
                loading={maintenanceMutation.isPending}
              >
                <FiRefreshCw /> Trigger AI Bulk Classification
              </Button>
              <Button 
                size="xs" 
                colorPalette="blue" 
                variant="solid" 
                onClick={() => syncRegistryMutation.mutate()}
                loading={syncRegistryMutation.isPending}
              >
                <FiRefreshCw /> Sync Registry from Items
              </Button>
            </HStack>
          </VStack>
        </Box>
      </Flex>
      <BooksTable />
    </Container>
  )
}
