import { Checkbox } from "@/components/ui/checkbox"
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Heading,
  IconButton,
  Image,
  Stack,
  Table,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react"
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import React, { useCallback, useMemo, useState } from "react"
import {
  FiArchive,
  FiCheckCircle,
  FiEye,
  FiEyeOff,
  FiFilePlus,
  FiMapPin,
  FiMaximize2,
  FiRefreshCw,
  FiTrash2,
} from "react-icons/fi"

import { type ItemPublic, ItemsService } from "@/client"
import ConfirmationModal from "@/components/Common/ConfirmationModal"
import { ImportItems } from "@/components/Common/ImportItems"
import useCustomToast from "@/hooks/useCustomToast"
import { ItemDetailModal } from "./ItemDetailModal"

interface ManageItemsProps {
  ownerId: string
  communityId?: string
}

type ActionType = "delete" | "lost" | "found" | "private" | "sync"

const ItemRow = React.memo(
  ({
    item,
    isSelected,
    onSelect,
    onDelete,
    onMarkLost,
    onMarkFound,
    onTogglePrivate,
    onView,
    isProcessing,
  }: {
    item: ItemPublic
    isSelected: boolean
    onSelect: (checked: boolean) => void
    onDelete: (id: string) => void
    onMarkLost: (id: string) => void
    onMarkFound: (id: string) => void
    onTogglePrivate: (id: string) => void
    onView: (item: ItemPublic) => void
    isProcessing: boolean
  }) => {
    const info = (item.info as any) || {}
    const condition = Number(info.average_condition_grade || info.grade || 0)
    const physicalNotes = info.physical_notes || []

    return (
      <Table.Row bg={isSelected ? "bg.subtle" : undefined} verticalAlign="top">
        <Table.Cell>
          <Checkbox
            checked={isSelected}
            onCheckedChange={(e) => onSelect(!!e.checked)}
          />
        </Table.Cell>
        <Table.Cell>
          {item.image_url ? (
            <Image
              src={item.image_url}
              alt={item.title}
              h="60px"
              objectFit="contain"
            />
          ) : (
            <Box h="60px" w="40px" bg="bg.muted" borderRadius="md" />
          )}
        </Table.Cell>
        <Table.Cell>
          <VStack align="start" gap={0}>
            <Text fontWeight="bold" lineClamp={1}>
              {item.title}
            </Text>
            <Text fontSize="xs" color="fg.muted">
              {item.author}
            </Text>
            {condition > 0 && (
              <HStack gap={1} mt={1}>
                <Badge
                  size="xs"
                  variant="subtle"
                  colorPalette={
                    condition >= 8 ? "green" : condition >= 5 ? "yellow" : "red"
                  }
                >
                  Cond: {condition}/10
                </Badge>
                {physicalNotes.length > 0 && (
                  <Text fontSize="2xs" color="fg.subtle" lineClamp={1}>
                    • {physicalNotes[0]}
                  </Text>
                )}
              </HStack>
            )}
          </VStack>
        </Table.Cell>
        <Table.Cell>
          <HStack gap={2}>
            {item.is_lost && <Badge colorPalette="red">Lost</Badge>}
            {item.is_private && <Badge colorPalette="purple">Private</Badge>}
            {!item.is_available && !item.is_lost && (
              <Badge colorPalette="orange">On Loan</Badge>
            )}
            {item.is_available && !item.is_lost && (
              <Badge colorPalette="green">Available</Badge>
            )}
          </HStack>
        </Table.Cell>
        <Table.Cell>
          <HStack gap={2}>
            <IconButton
              size="xs"
              variant="ghost"
              onClick={() => onView(item)}
              title="View Details"
            >
              <FiMaximize2 />
            </IconButton>
            <IconButton
              size="xs"
              variant="ghost"
              colorPalette="red"
              onClick={() => onDelete(item.id)}
              disabled={isProcessing}
              title="Delete"
            >
              <FiTrash2 />
            </IconButton>
            {item.is_lost ? (
              <IconButton
                size="xs"
                variant="ghost"
                colorPalette="green"
                onClick={() => onMarkFound(item.id)}
                disabled={isProcessing}
                title="Mark as Found"
              >
                <FiCheckCircle />
              </IconButton>
            ) : (
              <IconButton
                size="xs"
                variant="ghost"
                colorPalette="orange"
                onClick={() => onMarkLost(item.id)}
                disabled={isProcessing}
                title="Mark as Lost"
              >
                <FiMapPin />
              </IconButton>
            )}
            <IconButton
              size="xs"
              variant="ghost"
              colorPalette="purple"
              onClick={() => onTogglePrivate(item.id)}
              disabled={isProcessing}
              title={item.is_private ? "Make Public" : "Make Private"}
            >
              {item.is_private ? <FiEye /> : <FiEyeOff />}
            </IconButton>
          </HStack>
        </Table.Cell>
      </Table.Row>
    )
  },
)

export const ManageItems: React.FC<ManageItemsProps> = ({
  ownerId,
  communityId,
}) => {
  const [activeTab, setActiveTab] = useState("catalogue")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [viewItem, setViewItem] = useState<ItemPublic | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    type: ActionType
    ids: string[]
  } | null>(null)

  const { showSuccessToast, showErrorToast } = useCustomToast()
  const queryClient = useQueryClient()

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["manage-items", ownerId, activeTab],
    queryFn: ({ pageParam = 0 }) => {
      const params: any = {
        ownerId,
        skip: pageParam,
        limit: 50,
        minimal: true,
      }
      if (activeTab === "lost") params.lostOnly = true
      if (activeTab === "private") params.privateOnly = true
      if (activeTab === "catalogue") {
        params.excludeLost = true
        params.excludePrivate = true
      }
      return ItemsService.readItems(params)
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const totalLoaded = allPages.length * 50
      return totalLoaded < lastPage.count ? totalLoaded : undefined
    },
    enabled: activeTab !== "bulk",
  })

  const items = useMemo(
    () => data?.pages.flatMap((page) => (page as any).data) ?? [],
    [data],
  )

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((i) => i !== id),
    )
  }, [])

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? items.map((i) => i.id) : [])
    },
    [items],
  )

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      ItemsService.batchDeleteItems({ requestBody: { item_ids: ids } }),
    onSuccess: () => {
      showSuccessToast("Items deleted")
      setSelectedIds([])
      queryClient.invalidateQueries({ queryKey: ["manage-items"] })
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
    onError: () => showErrorToast("Failed to delete items"),
  })

  const batchLostMutation = useMutation({
    mutationFn: (ids: string[]) =>
      ItemsService.batchMarkLost({ requestBody: { item_ids: ids } }),
    onSuccess: () => {
      showSuccessToast("Items marked as lost")
      setSelectedIds([])
      queryClient.invalidateQueries({ queryKey: ["manage-items"] })
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
    onError: () => showErrorToast("Failed to mark items as lost"),
  })

  const batchFoundMutation = useMutation({
    mutationFn: (ids: string[]) =>
      (ItemsService as any).batchMarkFound({ requestBody: { item_ids: ids } }),
    onSuccess: () => {
      showSuccessToast("Items marked as found")
      setSelectedIds([])
      queryClient.invalidateQueries({ queryKey: ["manage-items"] })
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
    onError: () => showErrorToast("Failed to mark items as found"),
  })

  const batchPrivateMutation = useMutation({
    mutationFn: (ids: string[]) =>
      ItemsService.batchTogglePrivacy({ requestBody: { item_ids: ids } }),
    onSuccess: () => {
      showSuccessToast("Privacy toggled for items")
      setSelectedIds([])
      queryClient.invalidateQueries({ queryKey: ["manage-items"] })
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
    onError: () => showErrorToast("Failed to toggle privacy"),
  })

  const batchSyncMutation = useMutation({
    mutationFn: (ids: string[]) =>
      ItemsService.batchSyncFromArchive({ requestBody: { item_ids: ids } }),
    onSuccess: () => {
      showSuccessToast("Sync task started in background")
      setSelectedIds([])
    },
    onError: () => showErrorToast("Failed to start sync"),
  })

  const handleAction = (type: ActionType, ids: string[]) => {
    const dontShow = localStorage.getItem(`skipConfirm_${type}`) === "true"
    if (dontShow) {
      executeAction(type, ids)
    } else {
      setConfirmAction({ type, ids })
    }
  }

  const executeAction = (type: ActionType, ids: string[]) => {
    switch (type) {
      case "delete":
        batchDeleteMutation.mutate(ids)
        break
      case "lost":
        batchLostMutation.mutate(ids)
        break
      case "found":
        batchFoundMutation.mutate(ids)
        break
      case "private":
        batchPrivateMutation.mutate(ids)
        break
      case "sync":
        batchSyncMutation.mutate(ids)
        break
    }
  }

  const onConfirmAction = (dontShowAgain: boolean) => {
    if (confirmAction) {
      if (dontShowAgain) {
        localStorage.setItem(`skipConfirm_${confirmAction.type}`, "true")
      }
      executeAction(confirmAction.type, confirmAction.ids)
      setConfirmAction(null)
    }
  }

  const actionConfig = {
    delete: {
      title: "Delete Items",
      message: `Are you sure you want to delete ${confirmAction?.ids.length} item(s)? This action cannot be undone.`,
      color: "red",
    },
    lost: {
      title: "Mark as Lost",
      message: `Mark ${confirmAction?.ids.length} item(s) as lost? They will be moved to the 'Lost Items' tab and hidden from the public catalogue.`,
      color: "orange",
    },
    found: {
      title: "Mark as Found",
      message: `Mark ${confirmAction?.ids.length} item(s) as found? They will be moved back to your public catalogue.`,
      color: "green",
    },
    private: {
      title: "Toggle Privacy",
      message: `Change the privacy status for ${confirmAction?.ids.length} item(s)? Private items are only visible to you.`,
      color: "purple",
    },
    sync: {
      title: "Sync from Archive",
      message: `Sync ${confirmAction?.ids.length} item(s) with the Botho Archive? Existing tags will be merged with archive tags, and other fields will be updated to match the archive.`,
      color: "teal",
    },
  }

  const isProcessing =
    batchDeleteMutation.isPending ||
    batchLostMutation.isPending ||
    batchFoundMutation.isPending ||
    batchPrivateMutation.isPending ||
    batchSyncMutation.isPending

  return (
    <VStack align="stretch" gap={6} width="full">
      <Tabs.Root
        value={activeTab}
        onValueChange={(e) => {
          setActiveTab(e.value)
          setSelectedIds([])
        }}
        variant="enclosed"
      >
        <Tabs.List>
          <Tabs.Trigger value="catalogue">
            <FiArchive /> Catalogue
          </Tabs.Trigger>
          <Tabs.Trigger value="bulk">
            <FiFilePlus /> Bulk Add
          </Tabs.Trigger>
          <Tabs.Trigger value="lost">
            <FiMapPin /> Lost Items
          </Tabs.Trigger>
          <Tabs.Trigger value="private">
            <FiEyeOff /> Private Items
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="bulk" pt={6}>
          <ImportItems
            communityId={communityId}
            onBack={() => setActiveTab("catalogue")}
          />
        </Tabs.Content>

        {activeTab !== "bulk" && (
          <Tabs.Content value={activeTab} pt={6}>
            <VStack align="stretch" gap={4}>
              <Flex justify="space-between" align="center">
                <HStack gap={2}>
                  <Button
                    size="sm"
                    colorPalette="red"
                    variant="surface"
                    disabled={selectedIds.length === 0 || isProcessing}
                    onClick={() => handleAction("delete", selectedIds)}
                  >
                    <FiTrash2 /> Delete ({selectedIds.length})
                  </Button>
                  {activeTab !== "lost" ? (
                    <Button
                      size="sm"
                      colorPalette="orange"
                      variant="surface"
                      disabled={selectedIds.length === 0 || isProcessing}
                      onClick={() => handleAction("lost", selectedIds)}
                    >
                      <FiMapPin /> Mark Lost
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      colorPalette="green"
                      variant="surface"
                      disabled={selectedIds.length === 0 || isProcessing}
                      onClick={() => handleAction("found", selectedIds)}
                    >
                      <FiCheckCircle /> Mark Found
                    </Button>
                  )}
                  <Button
                    size="sm"
                    colorPalette="purple"
                    variant="surface"
                    disabled={selectedIds.length === 0 || isProcessing}
                    onClick={() => handleAction("private", selectedIds)}
                  >
                    {activeTab === "private" ? <FiEye /> : <FiEyeOff />}{" "}
                    {activeTab === "private" ? "Make Public" : "Make Private"}
                  </Button>
                  {activeTab === "catalogue" && (
                    <>
                      <Button
                        size="sm"
                        colorPalette="teal"
                        variant="surface"
                        disabled={selectedIds.length === 0 || isProcessing}
                        onClick={() => handleAction("sync", selectedIds)}
                        title="Sync metadata from the local Botho Archive"
                      >
                        <FiRefreshCw /> Sync
                      </Button>
                    </>
                  )}
                </HStack>
                <IconButton
                  variant="ghost"
                  onClick={() => refetch()}
                  loading={isLoading}
                >
                  <FiRefreshCw />
                </IconButton>
              </Flex>

              <Box
                overflowX="auto"
                border="1px solid"
                borderColor="border.subtle"
                borderRadius="md"
              >
                <Table.Root size="sm">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeader w="40px">
                        <Checkbox
                          checked={
                            items.length > 0 &&
                            selectedIds.length === items.length
                          }
                          onCheckedChange={(e) => toggleSelectAll(!!e.checked)}
                        />
                      </Table.ColumnHeader>
                      <Table.ColumnHeader w="60px">Image</Table.ColumnHeader>
                      <Table.ColumnHeader>Item</Table.ColumnHeader>
                      <Table.ColumnHeader>Status</Table.ColumnHeader>
                      <Table.ColumnHeader w="120px">Actions</Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {items.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        isSelected={selectedIds.includes(item.id)}
                        onSelect={(checked) => toggleSelect(item.id, checked)}
                        onDelete={(id) => handleAction("delete", [id])}
                        onMarkLost={(id) => handleAction("lost", [id])}
                        onMarkFound={(id) => handleAction("found", [id])}
                        onTogglePrivate={(id) => handleAction("private", [id])}
                        onView={(i) => setViewItem(i)}
                        isProcessing={isProcessing}
                      />
                    ))}
                  </Table.Body>
                </Table.Root>
              </Box>

              {hasNextPage && (
                <Button
                  variant="ghost"
                  onClick={() => fetchNextPage()}
                  loading={isFetchingNextPage}
                >
                  Load More
                </Button>
              )}
            </VStack>
          </Tabs.Content>
        )}
      </Tabs.Root>

      <ItemDetailModal
        item={viewItem}
        isOpen={!!viewItem}
        onClose={() => setViewItem(null)}
      />

      {confirmAction && (
        <ConfirmationModal
          isOpen={!!confirmAction}
          onClose={() => setConfirmAction(null)}
          onConfirm={onConfirmAction}
          title={actionConfig[confirmAction.type].title}
          message={actionConfig[confirmAction.type].message}
          colorPalette={actionConfig[confirmAction.type].color}
          isLoading={isProcessing}
        />
      )}
    </VStack>
  )
}
