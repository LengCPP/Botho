import { ImportsService, type StagedItemPublic } from "@/client"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DialogActionTrigger,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog"
import useCustomToast from "@/hooks/useCustomToast"
import {
  Box,
  Button,
  Flex,
  HStack,
  Heading,
  Icon,
  Progress,
  Stack,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Papa from "papaparse"
import { useState } from "react"
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaFileImport,
  FaSpinner,
  FaTrash,
} from "react-icons/fa"
import * as XLSX from "xlsx"

interface ImportItemsProps {
  communityId?: string
}

export const ImportItems = ({ communityId }: ImportItemsProps) => {
  const [parsedData, setParsedData] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({
    title: "",
    author: "",
    isbn: "",
    description: "",
  })
  const [isMappingOpen, setIsMappingOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const queryClient = useQueryClient()

  const { data: stagedItems, isLoading: isStagedLoading } = useQuery({
    queryKey: ["stagedItems", communityId],
    queryFn: () => ImportsService.readStagedItems({ communityId }),
    refetchInterval: (query) => {
      const items = query.state.data?.data || []
      return items.some((item) => item.status === "PROCESSING") ? 2000 : false
    },
  })

  // Listen for real-time processing updates via WebSocket event bus
  useState(() => {
    const handleWsMessage = (event: any) => {
      const message = event.detail
      if (message.type === "IMPORT_ITEM_PROCESSED") {
        queryClient.invalidateQueries({ queryKey: ["stagedItems"] })
      }
    }
    window.addEventListener("websocket-message", handleWsMessage)
    return () =>
      window.removeEventListener("websocket-message", handleWsMessage)
  })

  const items = stagedItems?.data || []
  const totalStaged = stagedItems?.count || 0
  const processingCount = stagedItems?.processing_count || 0
  const completedCount = stagedItems?.completed_count || 0
  const failedCount = stagedItems?.failed_count || 0

  const completedItems = items.filter((i) => i.status === "COMPLETED")
  const failedItems = items.filter((i) => i.status === "FAILED")

  const isProcessingBatch = processingCount > 0
  const activeItemsCount = processingCount + completedCount + failedCount
  const progressValue =
    activeItemsCount > 0
      ? ((completedCount + failedCount) / activeItemsCount) * 100
      : 0

  const stageMutation = useMutation({
    mutationFn: (data: {
      data: any[]
      mapping: string
      communityId?: string
    }) =>
      ImportsService.stageItems({
        requestBody: data.data,
        mapping: data.mapping,
        communityId: data.communityId,
      }),
    onSuccess: () => {
      showSuccessToast(
        "Items staged. Review and process them in the list below.",
      )
      setIsMappingOpen(false)
      setParsedData([])
      queryClient.invalidateQueries({ queryKey: ["stagedItems"] })
    },
    onError: (error: any) => {
      showErrorToast(error.message || "Failed to stage items")
    },
  })

  const processMutation = useMutation({
    mutationFn: (ids: string[]) =>
      ImportsService.processStagedItems({ requestBody: ids, communityId }),
    onSuccess: () => {
      showSuccessToast(
        "Processing started. Items are being enriched and added to your collection.",
      )
      setSelectedIds([])
      queryClient.invalidateQueries({ queryKey: ["stagedItems"] })
    },
  })

  const cleanMutation = useMutation({
    mutationFn: (all: boolean) => {
      if (all) return ImportsService.cleanStagedItems({ communityId })
      const finishedIds = [...completedItems, ...failedItems].map((i) => i.id)
      return Promise.all(
        finishedIds.map((id) => ImportsService.deleteStagedItem({ id })),
      )
    },
    onSuccess: () => {
      showSuccessToast("Cleaned up items.")
      queryClient.invalidateQueries({ queryKey: ["stagedItems"] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ImportsService.deleteStagedItem({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stagedItems"] })
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0]
      const reader = new FileReader()

      if (file.name.endsWith(".csv")) {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            if (results.data.length > 0) {
              setHeaders(Object.keys(results.data[0] as object))
              setParsedData(results.data)
              setIsMappingOpen(true)
            }
          },
          error: (error) => {
            showErrorToast(`CSV Parse Error: ${error.message}`)
          },
        })
      } else {
        reader.onload = (evt) => {
          try {
            const bstr = evt.target?.result
            const wb = XLSX.read(bstr, { type: "binary" })
            const wsname = wb.SheetNames[0]
            const ws = wb.Sheets[wsname]
            const data = XLSX.utils.sheet_to_json(ws)
            if (data.length > 0) {
              setHeaders(Object.keys(data[0] as object))
              setParsedData(data)
              setIsMappingOpen(true)
            }
          } catch (error: any) {
            showErrorToast(`Excel Parse Error: ${error.message}`)
          }
        }
        reader.readAsBinaryString(file)
      }
    }
  }

  const handleStage = () => {
    if (parsedData.length === 0) return
    stageMutation.mutate({
      data: parsedData,
      mapping: JSON.stringify(mapping),
      communityId,
    })
  }

  return (
    <Box width="full" mt={4}>
      <VStack align="start" gap={6} width="full">
        <HStack justify="space-between" width="full">
          <VStack align="start" gap={1}>
            <Heading size="md">Import Items</Heading>
            <Text fontSize="sm" color="gray.500">
              Upload Excel/CSV to bulk add books. We'll find covers and details
              for you.
            </Text>
          </VStack>
          <HStack>
            {items.length > 0 && (
              <HStack gap={2}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cleanMutation.mutate(false)}
                  disabled={
                    completedItems.length === 0 && failedItems.length === 0
                  }
                >
                  <Icon as={FaTrash} mr={2} /> Clear Finished
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cleanMutation.mutate(true)}
                >
                  <Icon as={FaTrash} mr={2} /> Clear All
                </Button>
              </HStack>
            )}
            <Button
              as="label"
              htmlFor="import-upload"
              variant="solid"
              bg="ui.hover"
              _hover={{ bg: "accent.600" }}
              cursor="pointer"
            >
              <Icon as={FaFileImport} mr={2} /> Upload File
              <input
                id="import-upload"
                type="file"
                hidden
                accept=".csv, .xlsx, .xls"
                onChange={handleFileChange}
              />
            </Button>
          </HStack>
        </HStack>

        {isProcessingBatch && (
          <VStack width="full" align="stretch" gap={2}>
            <HStack justify="space-between" fontSize="sm">
              <Text fontWeight="bold">Processing Items...</Text>
              <Text>{Math.round(progressValue)}%</Text>
            </HStack>
            <Progress.Root
              value={progressValue}
              colorPalette="main"
              size="sm"
              animated
            >
              <Progress.Track>
                <Progress.Range />
              </Progress.Track>
            </Progress.Root>
          </VStack>
        )}

        <DialogRoot
          open={isMappingOpen}
          onOpenChange={(e) => setIsMappingOpen(e.open)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Map Your Columns</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Stack gap={4}>
                <Text fontSize="sm">
                  Select which columns in your file match the required book
                  fields.
                </Text>
                {Object.keys(mapping).map((key) => (
                  <HStack key={key} justify="space-between">
                    <Text fontWeight="bold" textTransform="capitalize">
                      {key}
                    </Text>
                    <Box width="60%">
                      <select
                        value={mapping[key]}
                        onChange={(e) =>
                          setMapping({ ...mapping, [key]: e.target.value })
                        }
                        style={{
                          width: "100%",
                          padding: "8px",
                          borderRadius: "4px",
                          border: "1px solid #ccc",
                        }}
                      >
                        <option value="">-- Select Column --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </Box>
                  </HStack>
                ))}
              </Stack>
            </DialogBody>
            <DialogFooter>
              <DialogActionTrigger asChild>
                <Button variant="outline">Cancel</Button>
              </DialogActionTrigger>
              <Button
                bg="ui.hover"
                onClick={handleStage}
                loading={stageMutation.isPending}
              >
                Start Staging
              </Button>
            </DialogFooter>
          </DialogContent>
        </DialogRoot>

        {items.length > 0 ? (
          <VStack width="full" align="start" gap={4}>
            <HStack justify="space-between" width="full">
              <Text fontWeight="bold">
                {stagedItems?.count || 0} Items Staged
              </Text>
              <Button
                bg="ui.hover"
                size="sm"
                disabled={selectedIds.length === 0}
                onClick={() => processMutation.mutate(selectedIds)}
                loading={processMutation.isPending}
              >
                Add {selectedIds.length} Selected to Collection
              </Button>
            </HStack>
            <Box
              overflowX="auto"
              width="full"
              border="1px solid"
              borderColor="border.subtle"
              borderRadius="md"
            >
              <Table.Root size="sm">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader width="40px">
                      <Checkbox
                        checked={
                          items.length > 0 &&
                          selectedIds.length === items.length
                        }
                        onCheckedChange={(details) =>
                          setSelectedIds(
                            details.checked ? items.map((i) => i.id) : [],
                          )
                        }
                      />
                    </Table.ColumnHeader>
                    <Table.ColumnHeader>Title</Table.ColumnHeader>
                    <Table.ColumnHeader>Author</Table.ColumnHeader>
                    <Table.ColumnHeader>ISBN</Table.ColumnHeader>
                    <Table.ColumnHeader>Status</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">
                      Action
                    </Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {items.map((item) => (
                    <Table.Row
                      key={item.id}
                      opacity={item.status === "PROCESSING" ? 0.6 : 1}
                    >
                      <Table.Cell>
                        <Checkbox
                          checked={selectedIds.includes(item.id)}
                          onCheckedChange={(details) => {
                            if (details.checked) {
                              setSelectedIds((prev) => [...prev, item.id])
                            } else {
                              setSelectedIds((prev) =>
                                prev.filter((id) => id !== item.id),
                              )
                            }
                          }}
                          disabled={item.status === "PROCESSING"}
                        />
                      </Table.Cell>
                      <Table.Cell fontWeight="medium">
                        {item.raw_data.title}
                      </Table.Cell>
                      <Table.Cell>{item.raw_data.author}</Table.Cell>
                      <Table.Cell>{item.raw_data.isbn}</Table.Cell>
                      <Table.Cell>
                        {item.status === "PENDING" && (
                          <Icon as={FaFileImport} color="gray.400" />
                        )}
                        {item.status === "PROCESSING" && (
                          <Icon
                            as={FaSpinner}
                            animation="spin"
                            color="ui.hover"
                          />
                        )}
                        {item.status === "COMPLETED" && (
                          <Icon as={FaCheckCircle} color="green.500" />
                        )}
                        {item.status === "FAILED" && (
                          <HStack color="red.500" gap={1}>
                            <Icon as={FaExclamationTriangle} />
                            <Text fontSize="xs" title={item.error_log}>
                              Failed
                            </Text>
                          </HStack>
                        )}
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <Button
                          variant="ghost"
                          size="xs"
                          color="red.500"
                          onClick={() => deleteMutation.mutate(item.id)}
                          disabled={item.status === "PROCESSING"}
                        >
                          <FaTrash />
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </VStack>
        ) : (
          !isStagedLoading && (
            <Flex
              width="full"
              justify="center"
              p={12}
              border="2px dashed"
              borderColor="border.subtle"
              borderRadius="xl"
            >
              <VStack gap={2}>
                <Icon as={FaFileImport} fontSize="4xl" color="gray.300" />
                <Text color="gray.500">No items staged for import.</Text>
              </VStack>
            </Flex>
          )
        )}
      </VStack>
    </Box>
  )
}
