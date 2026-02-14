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
import { Tooltip } from "@/components/ui/tooltip"
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
  FaEdit,
  FaExclamationTriangle,
  FaFileImport,
  FaSpinner,
  FaTrash,
  FaCopy,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa"
import * as XLSX from "xlsx"

interface ImportItemsProps {
  communityId?: string
  isArchiveImport?: boolean
}

interface EditableCellProps {
  item: StagedItemPublic
  field: string
  value: string
  onEdit: (id: string, field: string, value: string) => void
  isMultiline?: boolean
  isFocused: boolean
  onFocus: () => void
}

const EditableCell = ({
  item,
  field,
  value,
  onEdit,
  isMultiline = false,
  isFocused,
  onFocus,
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
    if (e.key === "Enter" && !isMultiline) {
      if (isEditing) {
        handleBlur()
      } else {
        setIsEditing(true)
      }
      e.stopPropagation()
    }
    if (e.key === "Escape") {
      setCurrentValue(value)
      setIsEditing(false)
      e.stopPropagation()
    }
    // Prevent arrow navigation while typing in a multiline textarea
    if (isEditing && isMultiline && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.stopPropagation()
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
      onClick={() => { onFocus(); setIsEditing(true); }}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
      cursor="text"
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
}: ImportItemsProps) => {
  const [isMappingOpen, setIsMappingOpen] = useState(false)
  const [parsedData, setParsedData] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({ title: "", author: "", isbn: "", description: "", image_url: "" })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pendingEdits, setPendingEdits] = useState<Record<string, any>>({})
  const [page, setPage] = useState(0)
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number } | null>(null)
  
  const limit = 100
  const { showSuccessToast, showErrorToast, showInfoToast } = useCustomToast()
  const queryClient = useQueryClient()

  const { data: stagedItems, isLoading: isStagedLoading } = useQuery({
    queryKey: ["stagedItems", communityId, isArchiveImport, page],
    queryFn: () => ImportsService.readStagedItems({ communityId, skip: page * limit, limit }),
    refetchInterval: (query) => (query.state.data?.processing_count ?? 0) > 0 ? 1000 : 5000,
  })

  // Listen for batch completion WebSocket events
  useEffect(() => {
    const handleMessage = (event: CustomEvent) => {
      const message = event.detail
      if (message.type === "IMPORT_BATCH_COMPLETED" || message.type === "BOOK_ARCHIVE_BATCH_COMPLETED") {
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

  const columns = ["title", "author", "isbn", "description"]

  const handlePageChange = (newPage: number) => {
    setFocusedCell(null)
    setPage(newPage)
  }

  const handleTableKeyDown = (e: React.KeyboardEvent) => {
    if (!focusedCell || (e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return

    const { row, col } = focusedCell
    if (e.key === "ArrowUp" && row > 0) setFocusedCell({ row: row - 1, col })
    else if (e.key === "ArrowDown" && row < items.length - 1) setFocusedCell({ row: row + 1, col })
    else if (e.key === "ArrowLeft" && col > 0) setFocusedCell({ row, col: col - 1 })
    else if (e.key === "ArrowRight" && col < columns.length - 1) setFocusedCell({ row, col: col + 1 })
  }

  const bulkUpdateMutation = useMutation({
    mutationFn: (data: Record<string, any>) => (ImportsService as any).bulkUpdateStagedItems({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Changes saved.")
      setPendingEdits({})
      queryClient.invalidateQueries({ queryKey: ["stagedItems"] })
    },
  })

  const processMutation = useMutation({
    mutationFn: (ids: string[]) => isArchiveImport ? ImportsService.syncArchiveItems({ requestBody: ids }) : ImportsService.processStagedItems({ requestBody: ids, communityId }),
    onSuccess: () => {
      showSuccessToast("Processing started.")
      setSelectedIds([])
      queryClient.invalidateQueries({ queryKey: ["stagedItems"] })
    },
  })

  const deleteSelectedMutation = useMutation({
    mutationFn: async () => {
        await Promise.all(selectedIds.map(id => ImportsService.deleteStagedItem({ id })))
    },
    onSuccess: () => {
        showSuccessToast(`Deleted ${selectedIds.length} items.`)
        setSelectedIds([])
        queryClient.invalidateQueries({ queryKey: ["stagedItems"] })
    }
  })

  const dropDuplicates = () => {
    const seen = new Set()
    const toDelete: string[] = []
    items.forEach(item => {
        const raw = pendingEdits[item.id] || item.raw_data
        const key = `${raw.title}-${raw.author}-${raw.isbn}`.toLowerCase().trim()
        if (seen.has(key)) toDelete.push(item.id)
        else seen.add(key)
    })
    if (toDelete.length > 0) {
        setSelectedIds(toDelete)
        showInfoToast(`Identified ${toDelete.length} duplicates. Click 'Delete Selected' to remove.`)
    } else {
        showInfoToast("No duplicates found on this page.")
    }
  }

  const handleEdit = (id: string, field: string, newValue: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    setPendingEdits(prev => ({ ...prev, [id]: { ...(prev[id] || item.raw_data), [field]: newValue } }))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const complete = (results: any) => {
        if (results.data.length > 0) {
            setHeaders(Object.keys(results.data[0]))
            setParsedData(results.data)
            setIsMappingOpen(true)
        }
    }
    if (file.name.endsWith(".csv")) Papa.parse(file, { header: true, skipEmptyLines: true, complete })
    else {
        const reader = new FileReader()
        reader.onload = (evt) => {
            const wb = XLSX.read(evt.target?.result, { type: "binary" })
            const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
            complete({ data })
        }
        reader.readAsBinaryString(file)
    }
  }

  const hasPendingEdits = Object.keys(pendingEdits).length > 0

  return (
    <Box width="full" mt={4} onKeyDown={handleTableKeyDown}>
      <VStack align="start" gap={6} width="full">
        <HStack justify="space-between" width="full">
          <VStack align="start" gap={1}>
            <Heading size="md">{isArchiveImport ? "Global Archive Import" : "Bulk Import"}</Heading>
            <Text fontSize="sm" color="gray.500">Spreadsheet-style staging area. Use arrows to navigate.</Text>
          </VStack>
          <HStack>
            {hasPendingEdits && (
              <Button bg="green.600" size="sm" onClick={() => bulkUpdateMutation.mutate(pendingEdits)} loading={bulkUpdateMutation.isPending}>
                Save Changes
              </Button>
            )}
            <Button as="label" variant="solid" bg="ui.hover" size="sm" cursor="pointer">
              <Icon as={FaFileImport} mr={2} /> Upload File
              <input type="file" hidden accept=".csv, .xlsx, .xls" onChange={handleFileChange} />
            </Button>
          </HStack>
        </HStack>

        <DialogRoot open={isMappingOpen} onOpenChange={(e) => setIsMappingOpen(e.open)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Map Columns</DialogTitle></DialogHeader>
            <DialogBody>
              <Stack gap={4}>
                {Object.keys(mapping).map((key) => (
                  <HStack key={key} justify="space-between">
                    <Text fontWeight="bold" textTransform="capitalize">{key}</Text>
                    <select value={mapping[key]} onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })} style={{ width: "60%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}>
                      <option value="">-- Select --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </HStack>
                ))}
              </Stack>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => { 
                ImportsService.stageItems({ requestBody: parsedData, mapping: JSON.stringify(mapping), communityId })
                .then(() => { showSuccessToast("Staged."); setIsMappingOpen(false); queryClient.invalidateQueries({ queryKey: ["stagedItems"] }); })
              }} bg="ui.hover">Start Staging</Button>
            </DialogFooter>
          </DialogContent>
        </DialogRoot>

        {items.length > 0 && (
          <VStack width="full" align="start" gap={4}>
            <HStack justify="space-between" width="full">
              <HStack gap={4}>
                <Text fontWeight="bold">{totalCount} Items</Text>
                <HStack gap={2}>
                    <Button size="xs" variant="outline" onClick={dropDuplicates}><Icon as={FaCopy} mr={1}/> Find Dups</Button>
                    <Button size="xs" variant="outline" color="red.500" disabled={selectedIds.length === 0} onClick={() => deleteSelectedMutation.mutate()}><Icon as={FaTrash} mr={1}/> Delete Selected</Button>
                </HStack>
              </HStack>
              <Button bg="ui.hover" size="sm" disabled={selectedIds.length === 0 || hasPendingEdits} onClick={() => processMutation.mutate(selectedIds)}>
                Add {selectedIds.length} to Collection
              </Button>
            </HStack>

            <Box overflowX="auto" width="full" border="1px solid" borderColor="border.subtle" borderRadius="md">
              <Table.Root size="sm" variant="line">
                <Table.Header>
                  <Table.Row bg="bg.muted">
                    <Table.ColumnHeader width="40px">
                      <Checkbox checked={selectedIds.length === items.length} onCheckedChange={(d) => setSelectedIds(d.checked ? items.map(i => i.id) : [])} />
                    </Table.ColumnHeader>
                    {columns.map(c => <Table.ColumnHeader key={c} textTransform="capitalize" minW={c === "description" ? "250px" : "150px"}>{c}</Table.ColumnHeader>)}
                    <Table.ColumnHeader>Issues</Table.ColumnHeader>
                    <Table.ColumnHeader>Status</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {items.map((item, rIdx) => {
                    const raw = pendingEdits[item.id] || item.raw_data
                    const errors = validateItem(item, pendingEdits[item.id])
                    return (
                      <Table.Row key={item.id} bg={!!pendingEdits[item.id] ? "blue.50/5" : undefined}>
                        <Table.Cell>
                          <Checkbox checked={selectedIds.includes(item.id)} onCheckedChange={(d) => setSelectedIds(prev => d.checked ? [...prev, item.id] : prev.filter(id => id !== item.id))} />
                        </Table.Cell>
                        {columns.map((col, cIdx) => (
                          <Table.Cell key={col} borderLeft="1px solid" borderColor="border.subtle" p={0}>
                            <EditableCell
                              item={item}
                              field={col}
                              value={raw[col]}
                              onEdit={handleEdit}
                              isMultiline={col === "description"}
                              isFocused={focusedCell?.row === rIdx && focusedCell?.col === cIdx}
                              onFocus={() => setFocusedCell({ row: rIdx, col: cIdx })}
                            />
                          </Table.Cell>
                        ))}
                        <Table.Cell borderLeft="1px solid" borderColor="border.subtle">
                          {errors.length > 0 && <Tooltip content={errors.join(", ")}><Icon as={FaExclamationTriangle} color="orange.500"/></Tooltip>}
                        </Table.Cell>
                        <Table.Cell borderLeft="1px solid" borderColor="border.subtle">
                          {item.status === "PROCESSING" ? <Icon as={FaSpinner} animation="spin" color="ui.hover"/> : item.status === "COMPLETED" ? <Icon as={FaCheckCircle} color="green.500"/> : item.status === "FAILED" ? <Icon as={FaExclamationTriangle} color="red.500"/> : <Icon as={FaFileImport} color="gray.400"/>}
                        </Table.Cell>
                      </Table.Row>
                    )
                  })}
                </Table.Body>
              </Table.Root>
            </Box>

            <HStack justify="center" width="full" mt={2} gap={4}>
                <Button size="sm" variant="ghost" onClick={() => handlePageChange(Math.max(0, page - 1))} disabled={page === 0}><FaChevronLeft/></Button>
                <Text fontSize="sm">Page {page + 1} of {totalPages || 1}</Text>
                <Button size="sm" variant="ghost" onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages - 1}><FaChevronRight/></Button>
            </HStack>
          </VStack>
        )}
      </VStack>
    </Box>
  )
}
