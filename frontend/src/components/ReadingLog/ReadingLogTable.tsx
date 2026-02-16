import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Image,
  Spinner,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react"
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { format } from "date-fns"
import { useMemo, useState } from "react"
import { FaEllipsisV, FaRegTrashAlt } from "react-icons/fa"
import {
  FiBookOpen,
  FiCheckCircle,
  FiInfo,
  FiMaximize2,
  FiXCircle,
} from "react-icons/fi"

import {
  type ReadingLogPublic,
  ReadingLogService,
  type ReadingLogStatus,
} from "@/client"
import { ItemDetailModal } from "@/components/Items/ItemDetailModal"
import { useColorModeValue } from "@/components/ui/color-mode"
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu"
import { Tooltip } from "@/components/ui/tooltip"
import useCustomToast from "@/hooks/useCustomToast"
import { getImageUrl } from "@/utils"

interface ReadingLogTableProps {
  status: ReadingLogStatus
}

const LOGS_PER_PAGE = 10

const ReadingLogTable = ({ status }: ReadingLogTableProps) => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [selectedLog, setSelectedLog] = useState<ReadingLogPublic | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  const bgColor = useColorModeValue("main.50", "gray.900")
  const borderColor = useColorModeValue("main.200", "gray.700")
  const headerBg = useColorModeValue("main.100", "gray.800")
  const headerTextColor = useColorModeValue("gray.800", "gray.100")
  const rowHoverBg = useColorModeValue("main.100/50", "gray.800/50")
  const fallbackBg = useColorModeValue("main.100", "gray.800")
  const titleColor = useColorModeValue("gray.800", "gray.100")
  const dateTextColor = useColorModeValue("gray.700", "gray.200")
  const mutedTextColor = useColorModeValue("gray.600", "gray.400")

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["reading-log-infinite", status],
      queryFn: ({ pageParam = 0 }) =>
        ReadingLogService.readReadingLog({
          status,
          skip: pageParam as number,
          limit: LOGS_PER_PAGE,
        }),
      getNextPageParam: (last, all) => {
        const loaded = all.length * LOGS_PER_PAGE
        return loaded < last.count ? loaded : undefined
      },
      initialPageParam: 0,
    })

  const updateStatusMutation = useMutation({
    mutationFn: ({
      id,
      newStatus,
    }: { id: string; newStatus: ReadingLogStatus }) =>
      ReadingLogService.updateReadingLogEntry({
        id,
        requestBody: { status: newStatus },
      }),
    onSuccess: () => {
      showSuccessToast("Status updated")
      queryClient.invalidateQueries({ queryKey: ["reading-log-infinite"] })
    },
    onError: () => showErrorToast("Failed to update status"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ReadingLogService.deleteReadingLogEntry({ id }),
    onSuccess: () => {
      showSuccessToast("Entry removed")
      queryClient.invalidateQueries({ queryKey: ["reading-log-infinite"] })
    },
    onError: () => showErrorToast("Failed to remove entry"),
  })

  const handleOpenDetail = (log: ReadingLogPublic) => {
    setSelectedLog(log)
    setIsDetailOpen(true)
  }

  const allLogs = useMemo(
    () => data?.pages.flatMap((p) => p.data) || [],
    [data],
  )
  const totalCount = data?.pages[0]?.count || 0

  if (isLoading && !allLogs.length) {
    return (
      <Flex justify="center" py={10}>
        <Spinner color="ui.primary" />
      </Flex>
    )
  }

  if (!allLogs.length) {
    return (
      <Box textAlign="center" py={10} color="gray.500">
        No books in this section.
      </Box>
    )
  }

  const selectedItem = useMemo(() => {
    if (!selectedLog) return null
    return {
      ...selectedLog,
      item_type: "book",
      description: selectedLog.work_metadata?.description || "",
      isbn: selectedLog.work_metadata?.isbn,
      category: selectedLog.work_metadata?.category,
      genre: selectedLog.work_metadata?.genre,
      extra_data: {},
      info: {},
      id: selectedLog.id,
      owner_id: selectedLog.user_id,
      count: 1,
      created_at: selectedLog.created_at.toString(),
    } as any
  }, [selectedLog])

  return (
    <>
      <VStack align="stretch" gap={4}>
        <Box
          overflowX="auto"
          borderRadius="lg"
          borderWidth="1px"
          borderColor={borderColor}
          bg={bgColor}
          boxShadow="sm"
        >
          <Table.Root variant="line" interactive size="sm" width="full">
            <Table.Header>
              <Table.Row bg={headerBg}>
                <Table.ColumnHeader py={2} color={headerTextColor}>
                  Book
                </Table.ColumnHeader>
                <Table.ColumnHeader py={2} color={headerTextColor}>
                  Date
                </Table.ColumnHeader>
                <Table.ColumnHeader
                  py={2}
                  textAlign="left"
                  color={headerTextColor}
                >
                  Actions
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {allLogs.map((log) => (
                <Table.Row key={log.id} _hover={{ bg: rowHoverBg }}>
                  <Table.Cell py={2}>
                    <HStack gap={3} width="full">
                      {log.work_metadata?.image_url ? (
                        <Image
                          src={getImageUrl(log.work_metadata.image_url)}
                          w="35px"
                          h="50px"
                          objectFit="cover"
                          borderRadius="sm"
                          boxShadow="xs"
                        />
                      ) : (
                        <Flex
                          w="35px"
                          h="50px"
                          bg={fallbackBg}
                          borderRadius="sm"
                          align="center"
                          justify="center"
                          borderWidth="1px"
                          borderColor={borderColor}
                        >
                          <FiBookOpen size="12px" color="gray.400" />
                        </Flex>
                      )}
                      <VStack align="start" gap={0} minW="0">
                        <Text
                          fontWeight="bold"
                          fontSize="sm"
                          lineClamp={1}
                          color={titleColor}
                        >
                          {log.title}
                        </Text>
                        <Text
                          fontSize="2xs"
                          color={mutedTextColor}
                          lineClamp={1}
                        >
                          {log.author}
                        </Text>
                      </VStack>
                      <HStack gap={0} ml="auto">
                        <Tooltip content="Quick Info">
                          <IconButton
                            variant="ghost"
                            size="xs"
                            aria-label="View Info"
                            onClick={() => handleOpenDetail(log)}
                            colorPalette="main"
                          >
                            <FiInfo size="14px" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip content="Full Details">
                          <IconButton
                            variant="ghost"
                            size="xs"
                            aria-label="View Details"
                            onClick={() => handleOpenDetail(log)}
                            colorPalette="main"
                          >
                            <FiMaximize2 size="14px" />
                          </IconButton>
                        </Tooltip>
                      </HStack>
                    </HStack>
                  </Table.Cell>
                  <Table.Cell py={2}>
                    <VStack align="start" gap={0}>
                      <HStack gap={1}>
                        <Text
                          fontSize="3xs"
                          fontWeight="bold"
                          color="ui.primary"
                          textTransform="uppercase"
                        >
                          Start:
                        </Text>
                        <Text fontSize="2xs" color={dateTextColor}>
                          {format(new Date(log.created_at), "MMM d, yy")}
                        </Text>
                      </HStack>
                      {(status === "COMPLETED" || status === "DROPPED") && (
                        <HStack gap={1}>
                          <Text
                            fontSize="3xs"
                            fontWeight="bold"
                            color="ui.primary"
                            textTransform="uppercase"
                          >
                            {status === "COMPLETED" ? "End:" : "Drop:"}
                          </Text>
                          <Text fontSize="2xs" color={dateTextColor}>
                            {format(new Date(log.updated_at), "MMM d, yy")}
                          </Text>
                        </HStack>
                      )}
                    </VStack>
                  </Table.Cell>
                  <Table.Cell py={3} textAlign="left">
                    <MenuRoot>
                      <MenuTrigger asChild>
                        <IconButton
                          variant="ghost"
                          size="sm"
                          aria-label="Actions"
                        >
                          <FaEllipsisV />
                        </IconButton>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem
                          onClick={() => handleOpenDetail(log)}
                          value="info"
                        >
                          <FiBookOpen style={{ marginRight: "8px" }} /> Review /
                          Info
                        </MenuItem>
                        {status !== "READING" && (
                          <MenuItem
                            onClick={() =>
                              updateStatusMutation.mutate({
                                id: log.id,
                                newStatus: "READING",
                              })
                            }
                            value="move-reading"
                          >
                            <FiBookOpen style={{ marginRight: "8px" }} /> Move
                            to Reading
                          </MenuItem>
                        )}
                        {status !== "COMPLETED" && (
                          <MenuItem
                            onClick={() =>
                              updateStatusMutation.mutate({
                                id: log.id,
                                newStatus: "COMPLETED",
                              })
                            }
                            value="move-completed"
                          >
                            <FiCheckCircle style={{ marginRight: "8px" }} />{" "}
                            Mark Completed
                          </MenuItem>
                        )}
                        {status !== "DROPPED" && (
                          <MenuItem
                            onClick={() =>
                              updateStatusMutation.mutate({
                                id: log.id,
                                newStatus: "DROPPED",
                              })
                            }
                            value="move-dropped"
                          >
                            <FiXCircle style={{ marginRight: "8px" }} /> Move to
                            Dropped
                          </MenuItem>
                        )}
                        <MenuItem
                          color="red.500"
                          onClick={() => deleteMutation.mutate(log.id)}
                          value="delete"
                        >
                          <FaRegTrashAlt style={{ marginRight: "8px" }} />{" "}
                          Remove
                        </MenuItem>
                      </MenuContent>
                    </MenuRoot>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>

        {hasNextPage && (
          <Flex justify="center" mt={4} mb={8}>
            <Button
              variant="outline"
              size="sm"
              colorPalette="accent"
              onClick={() => fetchNextPage()}
              loading={isFetchingNextPage}
            >
              Load More (Showing {allLogs.length} of {totalCount})
            </Button>
          </Flex>
        )}
      </VStack>

      <ItemDetailModal
        item={selectedItem}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
      />
    </>
  )
}

export default ReadingLogTable
