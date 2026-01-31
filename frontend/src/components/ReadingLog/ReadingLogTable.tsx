import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Menu,
  Spinner,
  Table,
  Text,
  useDisclosure,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { useState } from "react"
import { FaEllipsisV, FaRegTrashAlt, FaTag } from "react-icons/fa"
import { FiBookOpen, FiCheckCircle, FiXCircle } from "react-icons/fi"

import {
  type ReadingLogPublic,
  type ReadingLogStatus,
  ReadingLogService,
} from "@/client"
import { Rating } from "@/components/Common/Rating"
import ItemExtendedInfo from "@/components/Items/ItemExtendedInfo"
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
import useCustomToast from "@/hooks/useCustomToast"

interface ReadingLogTableProps {
  status: ReadingLogStatus
}

const ReadingLogTable = ({ status }: ReadingLogTableProps) => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [selectedLog, setSelectedLog] = useState<ReadingLogPublic | null>(null)
  const [isInfoOpen, setIsInfoOpen] = useState(false)

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
        <Spinner />
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
      <Table.Root variant="outline">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Title / Author</Table.ColumnHeader>
            <Table.ColumnHeader>Tags</Table.ColumnHeader>
            <Table.ColumnHeader>Date</Table.ColumnHeader>
            <Table.ColumnHeader>Actions</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {logs.data.map((log) => (
            <Table.Row key={log.id}>
              <Table.Cell>
                <Box>
                  <Text
                    fontWeight="bold"
                    cursor="pointer"
                    onClick={() => handleOpenInfo(log)}
                    _hover={{ color: "blue.500" }}
                  >
                    {log.title}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    {log.author}
                  </Text>
                </Box>
              </Table.Cell>
              <Table.Cell>
                <Flex wrap="wrap" gap={1}>
                  {log.work_metadata?.tags?.map((tag) => (
                    <Badge key={tag} size="sm" variant="subtle">
                      {tag}
                    </Badge>
                  ))}
                </Flex>
              </Table.Cell>
              <Table.Cell>
                <Text fontSize="sm">
                  {status === "COMPLETED"
                    ? `Finished: ${format(
                        new Date(log.updated_at),
                        "MMM d, yyyy",
                      )}`
                    : `Added: ${format(
                        new Date(log.created_at),
                        "MMM d, yyyy",
                      )}`}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <MenuRoot>
                  <MenuTrigger asChild>
                    <IconButton variant="ghost" size="sm" aria-label="Actions">
                      <FaEllipsisV />
                    </IconButton>
                  </MenuTrigger>
                  <MenuContent>
                    <MenuItem onClick={() => handleOpenInfo(log)} value="info">
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
                    // Map reading log to partial ItemPublic for the component
                    // We don't have all Item fields, but ItemExtendedInfo uses:
                    // title, author, info (for copy specifics - N/A here), work_metadata
                    info: {},
                    id: selectedLog.id, // fake item id
                    owner_id: selectedLog.user_id,
                    count: 1,
                    created_at: selectedLog.created_at.toString(),
                    // ... other fields as undefined/null
                  } as any
                }
                isOwner={false} // Reading log is not "owning" a physical item
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
