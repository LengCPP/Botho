import {
  Badge,
  Box,
  Container,
  Flex,
  HStack,
  Heading,
  IconButton,
  Image,
  Table,
  Text,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { FiTrash2 } from "react-icons/fi"
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
    data: books,
    isLoading,
    isPlaceholderData,
  } = useQuery({
    ...getBooksQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

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

      <Flex justifyContent="flex-end" mt={4}>
        <PaginationRoot
          count={1000} // We don't have total count yet, but let's assume many
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
    </>
  )
}

function BookArchive() {
  return (
    <Container maxW="full">
      <Heading size="lg" pt={12} pb={6}>
        Book Archive Management
      </Heading>
      <BooksTable />
    </Container>
  )
}
