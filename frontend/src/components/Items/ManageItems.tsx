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
  FiFilePlus,
  FiRefreshCw,
  FiTrash2,
  FiEye,
  FiEyeOff,
  FiMapPin,
  FiZap,
} from "react-icons/fi"

import { ItemsService, type ItemPublic } from "@/client"
import { ImportItems } from "@/components/Common/ImportItems"
import useCustomToast from "@/hooks/useCustomToast"

interface ManageItemsProps {
  ownerId: string
  communityId?: string
}

const ItemRow = React.memo(
  ({
    item,
    isSelected,
    onSelect,
    onDelete,
    onMarkLost,
    onTogglePrivate,
    isProcessing,
  }: {
    item: ItemPublic
    isSelected: boolean
    onSelect: (checked: boolean) => void
    onDelete: (id: string) => void
    onMarkLost: (id: string) => void
    onTogglePrivate: (id: string) => void
    isProcessing: boolean
  }) => {
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
              colorPalette="red"
              onClick={() => onDelete(item.id)}
              disabled={isProcessing}
              title="Delete"
            >
              <FiTrash2 />
            </IconButton>
            {!item.is_lost && (
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

  const batchEnrichMutation = useMutation({
    mutationFn: (ids: string[]) =>
      ItemsService.batchEnrichMetadata({ requestBody: { item_ids: ids } }),
    onSuccess: () => {
      showSuccessToast("Enrichment task started in background")
      setSelectedIds([])
    },
    onError: () => showErrorToast("Failed to start enrichment"),
  })

  const isProcessing =
    batchDeleteMutation.isPending ||
    batchLostMutation.isPending ||
    batchPrivateMutation.isPending ||
    batchEnrichMutation.isPending

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
          <ImportItems communityId={communityId} onBack={() => setActiveTab("catalogue")} />
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
                    onClick={() => batchDeleteMutation.mutate(selectedIds)}
                  >
                    <FiTrash2 /> Delete ({selectedIds.length})
                  </Button>
                  {activeTab !== "lost" && (
                    <Button
                      size="sm"
                      colorPalette="orange"
                      variant="surface"
                      disabled={selectedIds.length === 0 || isProcessing}
                      onClick={() => batchLostMutation.mutate(selectedIds)}
                    >
                      <FiMapPin /> Mark Lost
                    </Button>
                  )}
                  <Button
                    size="sm"
                    colorPalette="purple"
                    variant="surface"
                    disabled={selectedIds.length === 0 || isProcessing}
                    onClick={() => batchPrivateMutation.mutate(selectedIds)}
                  >
                    {activeTab === "private" ? <FiEye /> : <FiEyeOff />}{" "}
                    {activeTab === "private" ? "Make Public" : "Make Private"}
                  </Button>
                  {activeTab === "catalogue" && (
                    <Button
                      size="sm"
                      colorPalette="blue"
                      variant="surface"
                      disabled={selectedIds.length === 0 || isProcessing}
                      onClick={() => batchEnrichMutation.mutate(selectedIds)}
                    >
                      <FiZap /> Enrich
                    </Button>
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

              <Box overflowX="auto" border="1px solid" borderColor="border.subtle" borderRadius="md">
                <Table.Root size="sm">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeader w="40px">
                        <Checkbox
                          checked={
                            items.length > 0 && selectedIds.length === items.length
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
                        onDelete={(id) => batchDeleteMutation.mutate([id])}
                        onMarkLost={(id) => batchLostMutation.mutate([id])}
                        onTogglePrivate={(id) => batchPrivateMutation.mutate([id])}
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
    </VStack>
  )
}
