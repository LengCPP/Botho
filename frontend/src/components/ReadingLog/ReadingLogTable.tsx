import {
  Badge,
  Box,
  Flex,
  HStack,
  IconButton,
  Image,
  Spinner,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { useState } from "react"
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
import ItemExtendedInfo from "@/components/Items/ItemExtendedInfo"
import { useColorModeValue } from "@/components/ui/color-mode"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog"
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

const ReadingLogTable = ({ status }: ReadingLogTableProps) => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [selectedLog, setSelectedLog] = useState<ReadingLogPublic | null>(null)
  const [isInfoOpen, setIsInfoOpen] = useState(false)

  const bgColor = useColorModeValue("main.50", "gray.900")
  const borderColor = useColorModeValue("main.200", "gray.700")
  const mutedTextColor = useColorModeValue("gray.600", "gray.400")

  const { data: logs, isLoading } = useQuery({
    queryKey: ["reading-log", status],
    queryFn: () => ReadingLogService.readReadingLog({ status }),
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
      queryClient.invalidateQueries({ queryKey: ["reading-log"] })
    },
    onError: () => showErrorToast("Failed to update status"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ReadingLogService.deleteReadingLogEntry({ id }),
    onSuccess: () => {
      showSuccessToast("Entry removed")
      queryClient.invalidateQueries({ queryKey: ["reading-log"] })
    },
    onError: () => showErrorToast("Failed to remove entry"),
  })

  const handleOpenInfo = (log: ReadingLogPublic) => {
    setSelectedLog(log)
    setIsInfoOpen(true)
  }

  if (isLoading) {
    return (
      <Flex justify="center" py={10}>
        <Spinner color="ui.primary" />
      </Flex>
    )
  }

  if (!logs?.data.length) {
    return (
      <Box textAlign="center" py={10} color="gray.500">
        No books in this section.
      </Box>
    )
  }

  return (
    <>
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
            <Table.Row bg={useColorModeValue("main.100", "gray.800")}>
              <Table.ColumnHeader
                py={2}
                color={useColorModeValue("gray.800", "gray.100")}
              >
                Book
              </Table.ColumnHeader>
              <Table.ColumnHeader
                py={2}
                color={useColorModeValue("gray.800", "gray.100")}
              >
                Date
              </Table.ColumnHeader>
              <Table.ColumnHeader
                py={2}
                textAlign="left"
                color={useColorModeValue("gray.800", "gray.100")}
              >
                Actions
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {logs.data.map((log) => (
              <Table.Row
                key={log.id}
                _hover={{ bg: useColorModeValue("main.100/50", "gray.800/50") }}
              >
                <Table.Cell py={2}>
                  <HStack gap={3} width="full">
                    <Image
                      src={
                        log.work_metadata?.image_url
                          ? getImageUrl(log.work_metadata.image_url)
                          : undefined
                      }
                      fallback={
                        <Flex
                          w="35px"
                          h="50px"
                          bg={useColorModeValue("main.100", "gray.800")}
                          borderRadius="sm"
                          align="center"
                          justify="center"
                          borderWidth="1px"
                          borderColor={borderColor}
                        >
                          <FiBookOpen size="12px" color="gray.400" />
                        </Flex>
                      }
                      w="35px"
                      h="50px"
                      objectFit="cover"
                      borderRadius="sm"
                      boxShadow="xs"
                    />
                    <VStack align="start" gap={0} minW="0">
                      <Text
                        fontWeight="bold"
                        fontSize="sm"
                        lineClamp={1}
                        color={useColorModeValue("gray.800", "gray.100")}
                      >
                        {log.title}
                      </Text>
                      <Text fontSize="2xs" color={mutedTextColor} lineClamp={1}>
                        {log.author}
                      </Text>
                    </VStack>
                    <HStack gap={0} ml="auto">
                      <Tooltip content="Quick Info">
                        <IconButton
                          variant="ghost"
                          size="xs"
                          aria-label="View Info"
                          onClick={() => handleOpenInfo(log)}
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
                          onClick={() => handleOpenInfo(log)}
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
                      <Text
                        fontSize="2xs"
                        color={useColorModeValue("gray.700", "gray.200")}
                      >
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
                        <Text
                          fontSize="2xs"
                          color={useColorModeValue("gray.700", "gray.200")}
                        >
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
                        onClick={() => handleOpenInfo(log)}
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
                          <FiBookOpen style={{ marginRight: "8px" }} /> Move to
                          Reading
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
                          <FiCheckCircle style={{ marginRight: "8px" }} /> Mark
                          Completed
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
                        <FaRegTrashAlt style={{ marginRight: "8px" }} /> Remove
                      </MenuItem>
                    </MenuContent>
                  </MenuRoot>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      <DialogRoot
        open={isInfoOpen}
        onOpenChange={(e) => setIsInfoOpen(e.open)}
        placement="center"
        size="lg"
        scrollBehavior="inside"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedLog?.title}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {selectedLog && (
              <ItemExtendedInfo
                item={
                  {
                    ...selectedLog,
                    info: {},
                    id: selectedLog.id,
                    owner_id: selectedLog.user_id,
                    count: 1,
                    created_at: selectedLog.created_at.toString(),
                  } as any
                }
                isOwner={false}
                showAddReview={true}
              />
            )}
          </DialogBody>
          <DialogCloseTrigger />
        </DialogContent>
      </DialogRoot>
    </>
  )
}

export default ReadingLogTable
