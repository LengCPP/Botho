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
  Image,
  Input,
  Stack,
  Table,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Papa from "papaparse"
import { useEffect, useRef, useState } from "react"
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaFileImport,
  FaSpinner,
  FaTrash,
  FaEdit,
  FaInfoCircle,
} from "react-icons/fa"
import * as XLSX from "xlsx"
import { Tooltip } from "@/components/ui/tooltip"

interface ImportItemsProps {
  communityId?: string
  isArchiveImport?: boolean
}

interface EditableCellProps {
  item: StagedItemPublic
  field: string
  value: string
  onSave: (id: string, field: string, value: string) => void
  isMultiline?: boolean
  isNumeric?: boolean
}

const EditableCell = ({
  item,
  field,
  value,
  onSave,
  isMultiline = false,
}: EditableCellProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [currentValue, setCurrentValue] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
    }
  }, [isEditing])

  const handleBlur = () => {
    setIsEditing(false)
    if (currentValue !== value) {
      onSave(item.id, field, currentValue)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isMultiline) {
      handleBlur()
    }
    if (e.key === "Escape") {
      setCurrentValue(value)
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return isMultiline ? (
      <Textarea
        ref={inputRef as any}
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        size="sm"
        autoFocus
      />
    ) : (
      <Input
        ref={inputRef as any}
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        size="sm"
        autoFocus
      />
    )
  }

  return (
    <Box
      onClick={() => setIsEditing(true)}
      cursor="text"
      _hover={{ bg: "bg.muted" }}
      p={1}
      borderRadius="sm"
      minH="1.5em"
      transition="background 0.2s"
      position="relative"
      role="group"
    >
      <Text whiteSpace="normal" wordBreak="break-word">
        {value || <Text as="span" color="fg.subtle" fontStyle="italic">Click to edit...</Text>}
      </Text>
      <Icon
        as={FaEdit}
        position="absolute"
        top={1}
        right={1}
        opacity={0}
        _groupHover={{ opacity: 0.3 }}
        fontSize="xs"
      />
    </Box>
  )
}

const validateItem = (item: StagedItemPublic) => {
  const errors: string[] = []
  const data = item.raw_data

  if (!data.title?.trim()) {
    errors.push("Missing Title")
  }
  if (!data.author?.trim()) {
    errors.push("Missing Author")
  }
  if (data.isbn) {
    const cleanIsbn = data.isbn.replace(/[-\s]/g, "")
    const isIsbn10 = /^\d{9}[\dX]$/i.test(cleanIsbn)
    const isIsbn13 = /^\d{13}$/.test(cleanIsbn)
    if (!isIsbn10 && !isIsbn13) {
      errors.push("Invalid ISBN Format")
    }
  }

  return errors
}

export const ImportItems = ({
  communityId,
  isArchiveImport = false,
}: ImportItemsProps) => {
  const [parsedData, setParsedData] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({
    title: "",
    author: "",
    isbn: "",
    description: "",
    image_url: "",
  })
  const [isMappingOpen, setIsMappingOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [filterMode, setFilterMode] = useState<"all" | "issues" | "pending">("all")
  const { showSuccessToast, showErrorToast, showInfoToast } = useCustomToast()
  const queryClient = useQueryClient()

  const { data: stagedItems, isLoading: isStagedLoading } = useQuery({
    queryKey: ["stagedItems", communityId, isArchiveImport],
    queryFn: () => ImportsService.readStagedItems({ communityId }),
    refetchInterval: (query) => {
      const data = query.state.data
      const isProcessing = data?.processing_count && data.processing_count > 0
      return isProcessing ? 1000 : 5000 // Poll faster during processing, slower otherwise
    },
  })

  // Track processing state for completion toast
  const prevProcessingCount = useRef(0)
  useEffect(() => {
    const currentProcessing = stagedItems?.processing_count || 0
    if (prevProcessingCount.current > 0 && currentProcessing === 0) {
      // Just finished a batch
      const completed = stagedItems?.completed_count || 0
      const failed = stagedItems?.failed_count || 0
      if (completed > 0 || failed > 0) {
        showInfoToast(
          `Import batch complete: ${completed} success, ${failed} failed.`,
        )
      }
    }
    prevProcessingCount.current = currentProcessing
  }, [stagedItems?.processing_count, stagedItems?.completed_count, stagedItems?.failed_count, showInfoToast])

  // Listen for real-time processing updates via WebSocket event bus
  useState(() => {
    const handleWsMessage = (event: any) => {
      const message = event.detail
      if (message.type === "IMPORT_ITEM_PROCESSED") {
        queryClient.invalidateQueries({ queryKey: ["stagedItems"] })
        if (isArchiveImport) {
          queryClient.invalidateQueries({ queryKey: ["book-archive"] })
        }
      }
    }
    window.addEventListener("websocket-message", handleWsMessage)
    return () =>
      window.removeEventListener("websocket-message", handleWsMessage)
  })

  const items = stagedItems?.data || []
  const filteredItems = items.filter((item) => {
    if (filterMode === "all") return true
    if (filterMode === "issues") return validateItem(item).length > 0
    if (filterMode === "pending") return item.status === "PENDING"
    return true
  })
  const totalStaged = stagedItems?.count || 0
  const processingCount = stagedItems?.processing_count || 0
  const completedCount = stagedItems?.completed_count || 0
  const failedCount = stagedItems?.failed_count || 0

  const completedItems = items.filter((i) => i.status === "COMPLETED")
  const failedItems = items.filter((i) => i.status === "FAILED")

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
      isArchiveImport
        ? ImportsService.syncArchiveItems({ requestBody: ids })
        : ImportsService.processStagedItems({ requestBody: ids, communityId }),
    onSuccess: () => {
      showSuccessToast(
        isArchiveImport
          ? "Archive sync started. Books are being enriched."
          : "Processing started. Items are being enriched.",
      )
      setSelectedIds([])
      queryClient.invalidateQueries({ queryKey: ["stagedItems"] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, raw_data }: { id: string; raw_data: any }) =>
      ImportsService.updateStagedItem({ id, requestBody: raw_data }),
    onSuccess: () => {
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

  const handleCellSave = (id: string, field: string, newValue: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return

    const newRawData = { ...item.raw_data, [field]: newValue }
    updateMutation.mutate({ id, raw_data: newRawData })
  }

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
            <Heading size="md">
              {isArchiveImport ? "Import to Global Archive" : "Import Items"}
            </Heading>
            <Text fontSize="sm" color="gray.500">
              {isArchiveImport
                ? "Upload books directly to the global registry. These won't be added to your personal collection."
                : "Upload Excel/CSV to bulk add books. We'll find covers and details for you."}
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
                        id={`mapping-${key}`}
                        name={`mapping-${key}`}
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
                {isArchiveImport
                  ? `Add ${selectedIds.length} to Registry`
                  : `Add ${selectedIds.length} Selected to Collection`}
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
                    <Table.ColumnHeader w="60px">Cover</Table.ColumnHeader>
                    <Table.ColumnHeader minW="150px">Title</Table.ColumnHeader>
                    <Table.ColumnHeader minW="120px">Author</Table.ColumnHeader>
                    <Table.ColumnHeader minW="100px">ISBN</Table.ColumnHeader>
                    <Table.ColumnHeader minW="200px">
                      Description
                    </Table.ColumnHeader>
                    <Table.ColumnHeader>Issues</Table.ColumnHeader>
                    <Table.ColumnHeader>Status</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">
                      Action
                    </Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {items.map((item) => {
                    const validationErrors = validateItem(item)
                    return (
                      <Table.Row
                        key={item.id}
                        opacity={item.status === "PROCESSING" ? 0.6 : 1}
                        bg={validationErrors.length > 0 ? "orange.50/10" : undefined}
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
                        <Table.Cell>
                          {item.raw_data.image_url ? (
                            <Tooltip content={item.raw_data.image_url}>
                              <Text fontSize="xs" maxW="150px" truncate color="blue.500" cursor="pointer" onClick={() => window.open(item.raw_data.image_url, "_blank")}>
                                {item.raw_data.image_url}
                              </Text>
                            </Tooltip>
                          ) : (
                            <Text fontSize="xs" color="gray.400">No Image</Text>
                          )}
                        </Table.Cell>
                        <Table.Cell>
                          <EditableCell
                            item={item}
                            field="title"
                            value={item.raw_data.title}
                            onSave={handleCellSave}
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <EditableCell
                            item={item}
                            field="author"
                            value={item.raw_data.author}
                            onSave={handleCellSave}
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <EditableCell
                            item={item}
                            field="isbn"
                            value={item.raw_data.isbn}
                            onSave={handleCellSave}
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <EditableCell
                            item={item}
                            field="description"
                            value={item.raw_data.description}
                            onSave={handleCellSave}
                            isMultiline
                          />
                        </Table.Cell>
                        <Table.Cell>
                          {validationErrors.length > 0 && (
                            <Tooltip content={validationErrors.join(", ")}>
                              <Icon as={FaExclamationTriangle} color="orange.500" cursor="help" />
                            </Tooltip>
                          )}
                          {validationErrors.length === 0 && item.status === "PENDING" && (
                            <Icon as={FaCheckCircle} color="gray.300" opacity={0.5} />
                          )}
                        </Table.Cell>
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
                    )
                  })}
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
