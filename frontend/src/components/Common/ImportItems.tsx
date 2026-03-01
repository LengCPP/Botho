import { ImportsService, ItemsService, type StagedItemPublic } from "@/client"
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
import { Tooltip } from "@/components/ui/tooltip"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import {
  Box,
  Button,
  Flex,
  HStack,
  Heading,
  Icon,
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
  FaChevronLeft,
  FaChevronRight,
  FaCopy,
  FaEdit,
  FaExclamationTriangle,
  FaFileImport,
  FaRobot,
  FaSpinner,
  FaTrash,
} from "react-icons/fa"
import readXlsxFile from "read-excel-file/browser"

const STAGING_CHUNK_SIZE = 500

interface ImportItemsProps {
  communityId?: string
  isArchiveImport?: boolean
  onBack?: () => void
}

interface EditableCellProps {
  item: StagedItemPublic
  field: string
  value: string
  onEdit: (id: string, field: string, value: string) => void
  isMultiline?: boolean
  isFocused: boolean
  onFocus: () => void
  onConfirm?: () => void
  onTabNext?: (shiftKey: boolean) => void
}

const EditableCell = ({
  item,
  field,
  value,
  onEdit,
  isMultiline = false,
  isFocused,
  onFocus,
  onConfirm,
  onTabNext,
}: EditableCellProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [currentValue, setCurrentValue] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    setCurrentValue(value)
  }, [value])

  useEffect(() => {
    if (isEditing || isFocused) {
      inputRef.current?.focus()
    }
  }, [isEditing, isFocused])

  const handleBlur = () => {
    setIsEditing(false)
    if (currentValue !== value) {
      onEdit(item.id, field, currentValue)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isEditing) {
      if (e.key === "Escape") {
        setCurrentValue(value)
        setIsEditing(false)
        e.stopPropagation()
        e.preventDefault()
      } else if (e.key === "Enter" && !isMultiline) {
        // Confirm edit then let parent move focus down
        handleBlur()
        e.stopPropagation()
        e.preventDefault()
        onConfirm?.()
      } else if (e.key === "Tab") {
        // Confirm edit then let parent move focus left/right
        handleBlur()
        e.stopPropagation()
        e.preventDefault()
        onTabNext?.(e.shiftKey)
      } else if (
        isMultiline &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        // Arrows inside a textarea move the cursor — don't let them navigate cells
        e.stopPropagation()
      }
    } else {
      if (e.key === "Enter" || e.key === "F2") {
        setIsEditing(true)
        e.stopPropagation()
        e.preventDefault()
      } else if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        // Prevent page scroll; bubble up so handleTableKeyDown can navigate
        e.preventDefault()
      }
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
      ref={inputRef as any}
      tabIndex={0}
      onClick={onFocus}
      onDoubleClick={() => setIsEditing(true)}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
      cursor="default"
      bg={isFocused ? "ui.hover/10" : "transparent"}
      outline={isFocused ? "2px solid" : "none"}
      outlineColor="ui.hover"
      p={1}
      borderRadius="sm"
      minH="1.5em"
      transition="all 0.1s"
      position="relative"
      role="group"
    >
      <Text whiteSpace="normal" wordBreak="break-word" fontSize="sm">
        {value || (
          <Text as="span" color="fg.subtle" fontStyle="italic">
            -
          </Text>
        )}
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

const validateItem = (item: StagedItemPublic, pendingData?: any) => {
  const errors: string[] = []
  const data = (pendingData || item.raw_data) as Record<string, string>

  if (!data.title?.trim()) errors.push("Missing Title")
  if (!data.author?.trim()) errors.push("Missing Author")
  if (data.isbn) {
    const cleanIsbn = data.isbn.replace(/[-\s]/g, "")
    if (!/^\d{9}[\dX]$/i.test(cleanIsbn) && !/^\d{13}$/.test(cleanIsbn)) {
      errors.push("Invalid ISBN")
    }
  }
  return errors
}

export const ImportItems = ({
  communityId,
  isArchiveImport = false,
  onBack,
}: ImportItemsProps) => {
  const [isMappingOpen, setIsMappingOpen] = useState(false)
  const [parsedData, setParsedData] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({
    title: "",
    author: "",
    isbn: "",
    description: "",
    image_url: "",
    category: "",
    genre: "",
  })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pendingEdits, setPendingEdits] = useState<Record<string, any>>({})
  const [page, setPage] = useState(0)
  const [focusedCell, setFocusedCell] = useState<{
    row: number
    col: number
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stagingProgress, setStagingProgress] = useState<{
    current: number
    total: number
    stagedCount: number
  } | null>(null)

  const limit = 100
  const { showSuccessToast, showErrorToast, showInfoToast } = useCustomToast()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const { data: stagedItems, isLoading: isStagedLoading } = useQuery({
    queryKey: ["stagedItems", communityId, isArchiveImport, page],
    queryFn: () =>
      ImportsService.readStagedItems({
        communityId,
        skip: page * limit,
        limit,
      }),
    refetchInterval: (query) =>
      (query.state.data?.processing_count ?? 0) > 0 ? 1000 : 5000,
  })

  // Listen for batch completion WebSocket events
  useEffect(() => {
    const handleMessage = (event: CustomEvent) => {
      const message = event.detail
      if (
        message.type === "IMPORT_BATCH_COMPLETED" ||
        message.type === "BOOK_ARCHIVE_BATCH_COMPLETED"
      ) {
        showSuccessToast("Bulk processing finished and search index updated.")
        queryClient.invalidateQueries({ queryKey: ["stagedItems"] })
        queryClient.invalidateQueries({ queryKey: ["items"] })
        queryClient.invalidateQueries({ queryKey: ["book-archive-infinite"] })
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

  const items = stagedItems?.data || []
  const totalCount = stagedItems?.count || 0
  const totalPages = Math.ceil(totalCount / limit)

  const columns = [
    "title",
    "author",
    "isbn",
    "category",
    "genre",
    "description",
  ]

  const handlePageChange = (newPage: number) => {
    setFocusedCell(null)
    setPage(newPage)
  }

  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    // When a cell input is focused (edit mode), EditableCell handles all keys
    if (
      !focusedCell ||
      (e.target as HTMLElement).tagName === "INPUT" ||
      (e.target as HTMLElement).tagName === "TEXTAREA"
    )
      return

    const { row, col } = focusedCell

    if (e.key === "ArrowUp" && row > 0) {
      setFocusedCell({ row: row - 1, col })
      e.preventDefault()
    } else if (e.key === "ArrowDown" && row < items.length - 1) {
      setFocusedCell({ row: row + 1, col })
      e.preventDefault()
    } else if (e.key === "ArrowLeft" && col > 0) {
      setFocusedCell({ row, col: col - 1 })
      e.preventDefault()
    } else if (e.key === "ArrowRight" && col < columns.length - 1) {
      setFocusedCell({ row, col: col + 1 })
      e.preventDefault()
    } else if (e.key === "Tab") {
      if (e.shiftKey) {
        if (col > 0) setFocusedCell({ row, col: col - 1 })
        else if (row > 0) setFocusedCell({ row: row - 1, col: columns.length - 1 })
      } else {
        if (col < columns.length - 1) setFocusedCell({ row, col: col + 1 })
        else if (row < items.length - 1) setFocusedCell({ row: row + 1, col: 0 })
      }
      e.preventDefault()
    }
  }

  const bulkUpdateMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      (ImportsService as any).bulkUpdateStagedItems({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Changes saved.")
      setPendingEdits({})
      queryClient.invalidateQueries({ queryKey: ["stagedItems"] })
    },
    onError: (err: any) => {
      const detail = err?.body?.detail || "Failed to save changes."
      showErrorToast(detail)
    },
  })

  const processMutation = useMutation({
    mutationFn: (ids: string[]) =>
      isArchiveImport
        ? ImportsService.syncArchiveItems({ requestBody: ids })
        : ImportsService.processStagedItems({ requestBody: ids, communityId }),
    onSuccess: () => {
      showSuccessToast("Processing started.")
      setSelectedIds([])
      queryClient.invalidateQueries({ queryKey: ["stagedItems"] })
    },
    onError: (err: any) => {
      const detail = err?.body?.detail || "Failed to start processing."
      showErrorToast(detail)
    },
  })

  const deleteSelectedMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        selectedIds.map((id) => ImportsService.deleteStagedItem({ id })),
      )
    },
    onSuccess: () => {
      showSuccessToast(`Deleted ${selectedIds.length} items.`)
      setSelectedIds([])
      queryClient.invalidateQueries({ queryKey: ["stagedItems"] })
    },
    onError: (err: any) => {
      const detail = err?.body?.detail || "Failed to delete items."
      showErrorToast(detail)
    },
  })

  const dropDuplicates = () => {
    const seen = new Set()
    const toDelete: string[] = []
    for (const item of items) {
      const raw = pendingEdits[item.id] || item.raw_data
      const key = `${raw.title}-${raw.author}-${raw.isbn}`.toLowerCase().trim()
      if (seen.has(key)) toDelete.push(item.id)
      else seen.add(key)
    }
    if (toDelete.length > 0) {
      setSelectedIds(toDelete)
      showInfoToast(
        `Identified ${toDelete.length} duplicates. Click 'Delete Selected' to remove.`,
      )
    } else {
      showInfoToast("No duplicates found on this page.")
    }
  }

  const handleEdit = (id: string, field: string, newValue: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    setPendingEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || item.raw_data), [field]: newValue },
    }))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset so re-uploading the same file triggers onChange again
    e.target.value = ""
    if (!file) return
    const complete = (results: any) => {
      if (results.data.length > 0) {
        setHeaders(Object.keys(results.data[0]))
        setParsedData(results.data)
        setIsMappingOpen(true)
      } else {
        showErrorToast("No data found in file.")
      }
    }
    if (file.name.endsWith(".csv"))
      Papa.parse(file, { header: true, skipEmptyLines: true, complete })
    else {
      readXlsxFile(file).then((rows) => {
        if (rows.length < 2) { complete({ data: [] }); return }
        const headers = rows[0].map(String)
        const data = rows.slice(1).map((row) =>
          Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""]))
        )
        complete({ data })
      })
    }
  }

  const handleStartStaging = async () => {
    const chunks: any[][] = []
    for (let i = 0; i < parsedData.length; i += STAGING_CHUNK_SIZE) {
      chunks.push(parsedData.slice(i, i + STAGING_CHUNK_SIZE))
    }
    setStagingProgress({ current: 0, total: chunks.length, stagedCount: 0 })
    let totalStaged = 0
    try {
      for (let i = 0; i < chunks.length; i++) {
        const result: any = await ImportsService.stageItems({
          requestBody: chunks[i],
          mapping: JSON.stringify(mapping),
          communityId,
        })
        totalStaged += result?.count ?? 0
        setStagingProgress({
          current: i + 1,
          total: chunks.length,
          stagedCount: totalStaged,
        })
      }
      showSuccessToast(`Staged ${totalStaged} items.`)
      setIsMappingOpen(false)
      queryClient.invalidateQueries({ queryKey: ["stagedItems"] })
    } catch (err: any) {
      const detail = err?.body?.detail || "Failed to stage items."
      showErrorToast(detail)
    } finally {
      setStagingProgress(null)
    }
  }

  const hasPendingEdits = Object.keys(pendingEdits).length > 0

  return (
    <Box width="full" mt={4} onKeyDown={handleTableKeyDown}>
      <VStack align="start" gap={6} width="full">
        {onBack && (
          <Button size="xs" variant="ghost" onClick={onBack} alignSelf="start">
            <FaChevronLeft /> Back to Catalogue
          </Button>
        )}
        <HStack justify="space-between" width="full">
          <VStack align="start" gap={1}>
            <Heading size="md">
              {isArchiveImport ? "Global Archive Import" : "Bulk Import"}
            </Heading>
          </VStack>
          <HStack>
            {hasPendingEdits && (
              <Button
                colorPalette="green"
                size="sm"
                onClick={() => bulkUpdateMutation.mutate(pendingEdits)}
                loading={bulkUpdateMutation.isPending}
              >
                Save Changes
              </Button>
            )}
            <Button
              variant="solid"
              colorPalette="accent"
              size="sm"
              cursor="pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon as={FaFileImport} mr={2} /> Upload File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".csv, .xlsx, .xls"
              onChange={handleFileChange}
            />
          </HStack>
        </HStack>

        <DialogRoot
          open={isMappingOpen}
          onOpenChange={(e) => !stagingProgress && setIsMappingOpen(e.open)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Map Columns</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Stack gap={4}>
                {Object.keys(mapping).map((key) => (
                  <HStack key={key} justify="space-between">
                    <Text fontWeight="bold" textTransform="capitalize">
                      {key}
                    </Text>
                    <select
                      value={mapping[key]}
                      onChange={(e) =>
                        setMapping({ ...mapping, [key]: e.target.value })
                      }
                      disabled={!!stagingProgress}
                      style={{
                        width: "60%",
                        padding: "8px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                      }}
                    >
                      <option value="">-- Select --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </HStack>
                ))}
              </Stack>

              {stagingProgress && (
                <Box mt={5}>
                  <HStack justify="space-between" mb={1}>
                    <Text fontSize="sm" fontWeight="medium">
                      Uploading chunk {stagingProgress.current} of{" "}
                      {stagingProgress.total}
                    </Text>
                    <Text fontSize="sm" color="fg.muted">
                      {stagingProgress.stagedCount} rows staged
                    </Text>
                  </HStack>
                  <Box
                    w="full"
                    h="6px"
                    bg="bg.muted"
                    borderRadius="full"
                    overflow="hidden"
                  >
                    <Box
                      h="full"
                      bg="accent.500"
                      borderRadius="full"
                      style={{
                        width: `${Math.round((stagingProgress.current / stagingProgress.total) * 100)}%`,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </Box>
                  <Text fontSize="xs" color="fg.subtle" mt={1}>
                    {parsedData.length} total rows ·{" "}
                    {STAGING_CHUNK_SIZE} rows per chunk
                  </Text>
                </Box>
              )}
            </DialogBody>
            <DialogFooter>
              <Button
                onClick={handleStartStaging}
                bg="ui.hover"
                loading={!!stagingProgress}
                loadingText={
                  stagingProgress
                    ? `Staging ${stagingProgress.current}/${stagingProgress.total}…`
                    : undefined
                }
                disabled={!!stagingProgress}
              >
                Start Staging
              </Button>
            </DialogFooter>
          </DialogContent>
        </DialogRoot>

        {items.length > 0 && (
          <VStack width="full" align="start" gap={4}>
            <HStack justify="space-between" width="full">
              <HStack gap={4}>
                <Text fontWeight="bold">{totalCount} Items</Text>
                <HStack gap={2}>
                  <Button size="xs" variant="outline" onClick={dropDuplicates}>
                    <Icon as={FaCopy} mr={1} /> Find Dups
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    colorPalette="red"
                    disabled={selectedIds.length === 0}
                    onClick={() => deleteSelectedMutation.mutate()}
                  >
                    <Icon as={FaTrash} mr={1} /> Delete Selected
                  </Button>
                </HStack>
              </HStack>
              <HStack gap={2}>
                <Button
                  bg="ui.hover"
                  size="sm"
                  disabled={selectedIds.length === 0 || hasPendingEdits}
                  onClick={() => processMutation.mutate(selectedIds)}
                >
                  Add {selectedIds.length} to Collection
                </Button>
              </HStack>
            </HStack>

            <Box
              overflowX="auto"
              width="full"
              border="1px solid"
              borderColor="border.subtle"
              borderRadius="md"
            >
              <Table.Root size="sm" variant="line">
                <Table.Header>
                  <Table.Row bg="bg.muted">
                    <Table.ColumnHeader width="40px">
                      <Checkbox
                        checked={selectedIds.length === items.length}
                        onCheckedChange={(d) =>
                          setSelectedIds(
                            d.checked ? items.map((i) => i.id) : [],
                          )
                        }
                      />
                    </Table.ColumnHeader>
                    {columns.map((c) => (
                      <Table.ColumnHeader
                        key={c}
                        textTransform="capitalize"
                        minW={c === "description" ? "250px" : "150px"}
                      >
                        {c}
                      </Table.ColumnHeader>
                    ))}
                    <Table.ColumnHeader>Issues</Table.ColumnHeader>
                    <Table.ColumnHeader>Status</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {items.map((item, rIdx) => {
                    const raw = pendingEdits[item.id] || item.raw_data
                    const errors = validateItem(item, pendingEdits[item.id])
                    return (
                      <Table.Row
                        key={item.id}
                        bg={pendingEdits[item.id] ? "blue.50/5" : undefined}
                      >
                        <Table.Cell>
                          <Checkbox
                            checked={selectedIds.includes(item.id)}
                            onCheckedChange={(d) =>
                              setSelectedIds((prev) =>
                                d.checked
                                  ? [...prev, item.id]
                                  : prev.filter((id) => id !== item.id),
                              )
                            }
                          />
                        </Table.Cell>
                        {columns.map((col, cIdx) => (
                          <Table.Cell
                            key={col}
                            borderLeft="1px solid"
                            borderColor="border.subtle"
                            p={0}
                          >
                            <EditableCell
                              item={item}
                              field={col}
                              value={raw[col]}
                              onEdit={handleEdit}
                              isMultiline={col === "description"}
                              isFocused={
                                focusedCell?.row === rIdx &&
                                focusedCell?.col === cIdx
                              }
                              onFocus={() =>
                                setFocusedCell({ row: rIdx, col: cIdx })
                              }
                              onConfirm={() => {
                                if (rIdx < items.length - 1)
                                  setFocusedCell({
                                    row: rIdx + 1,
                                    col: cIdx,
                                  })
                              }}
                              onTabNext={(shiftKey) => {
                                if (!shiftKey) {
                                  if (cIdx < columns.length - 1)
                                    setFocusedCell({ row: rIdx, col: cIdx + 1 })
                                  else if (rIdx < items.length - 1)
                                    setFocusedCell({ row: rIdx + 1, col: 0 })
                                } else {
                                  if (cIdx > 0)
                                    setFocusedCell({ row: rIdx, col: cIdx - 1 })
                                  else if (rIdx > 0)
                                    setFocusedCell({
                                      row: rIdx - 1,
                                      col: columns.length - 1,
                                    })
                                }
                              }}
                            />
                          </Table.Cell>
                        ))}
                        <Table.Cell
                          borderLeft="1px solid"
                          borderColor="border.subtle"
                        >
                          {errors.length > 0 && (
                            <Tooltip content={errors.join(", ")}>
                              <Icon
                                as={FaExclamationTriangle}
                                color="orange.500"
                              />
                            </Tooltip>
                          )}
                        </Table.Cell>
                        <Table.Cell
                          borderLeft="1px solid"
                          borderColor="border.subtle"
                        >
                          {item.status === "PROCESSING" ? (
                            <Icon
                              as={FaSpinner}
                              animation="spin"
                              color="ui.hover"
                            />
                          ) : item.status === "COMPLETED" ? (
                            <Icon as={FaCheckCircle} color="green.500" />
                          ) : item.status === "FAILED" ? (
                            <Icon as={FaExclamationTriangle} color="red.500" />
                          ) : (
                            <Icon as={FaFileImport} color="gray.400" />
                          )}
                        </Table.Cell>
                      </Table.Row>
                    )
                  })}
                </Table.Body>
              </Table.Root>
            </Box>

            <HStack justify="center" width="full" mt={2} gap={4}>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handlePageChange(Math.max(0, page - 1))}
                disabled={page === 0}
              >
                <FaChevronLeft />
              </Button>
              <Text fontSize="sm">
                Page {page + 1} of {totalPages || 1}
              </Text>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages - 1}
              >
                <FaChevronRight />
              </Button>
            </HStack>
          </VStack>
        )}
      </VStack>
    </Box>
  )
}
