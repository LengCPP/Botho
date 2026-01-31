import {
  Button,
  IconButton,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { BsThreeDotsVertical } from "react-icons/bs"
import { FiCopy, FiHeart, FiMinusCircle, FiTrash2 } from "react-icons/fi"
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "../ui/menu"

import { CommunitiesService, type ItemPublic, ItemsService } from "@/client"
import useCustomToast from "@/hooks/useCustomToast"
import DeleteItem from "../Items/DeleteItem"
import EditItem from "../Items/EditItem"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog"
import ConfirmationModal from "./ConfirmationModal"

interface ItemActionsMenuProps {
  item: ItemPublic
  communityId?: string
  isAdmin?: boolean
  onRemoveFromCollection?: () => void
}

export const ItemActionsMenu = ({
  item,
  communityId,
  isAdmin,
  onRemoveFromCollection,
}: ItemActionsMenuProps) => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [confirmationType, setConfirmationType] = useState<
    "donate" | "removeCommunity" | "removeCollection" | null
  >(null)
  const [isActionsModalOpen, setIsActionsModalOpen] = useState(false)

  const isMobile = useBreakpointValue({ base: true, md: false })
  const isCommunityOwned = !!item.community_owner

  const donateMutation = useMutation({
    mutationFn: () =>
      CommunitiesService.initiateDonation({
        id: communityId!,
        itemId: item.id,
      }),
    onSuccess: () => {
      showSuccessToast("Donation request sent!")
      queryClient.invalidateQueries({
        queryKey: ["communityItems", communityId],
      })
      queryClient.invalidateQueries({ queryKey: ["items"] })
      setConfirmationType(null)
      setIsActionsModalOpen(false)
    },
    onError: () => {
      showErrorToast("Failed to initiate donation")
      setConfirmationType(null)
    },
  })

  const removeItemMutation = useMutation({
    mutationFn: () =>
      CommunitiesService.removeItemFromCommunity({
        id: communityId!,
        itemId: item.id,
      }),
    onSuccess: () => {
      showSuccessToast("Item removed from community")
      queryClient.invalidateQueries({
        queryKey: ["communityItems", communityId],
      })
      queryClient.invalidateQueries({ queryKey: ["items"] })
      setConfirmationType(null)
      setIsActionsModalOpen(false)
    },
    onError: () => {
      showErrorToast("Failed to remove item")
      setConfirmationType(null)
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: () => ItemsService.duplicateItem({ id: item.id }),
    onSuccess: () => {
      showSuccessToast("Another copy added to your collection!")
      queryClient.invalidateQueries({ queryKey: ["items"] })
      setIsActionsModalOpen(false)
    },
    onError: () => showErrorToast("Failed to copy item"),
  })

  const handleConfirm = () => {
    if (confirmationType === "donate") {
      donateMutation.mutate()
    } else if (confirmationType === "removeCommunity") {
      removeItemMutation.mutate()
    } else if (confirmationType === "removeCollection") {
      if (onRemoveFromCollection) {
        onRemoveFromCollection()
      }
      setConfirmationType(null)
      setIsActionsModalOpen(false)
    }
  }

  const getConfirmationConfig = () => {
    switch (confirmationType) {
      case "donate":
        return {
          title: "Donate Item",
          message:
            "Donate this item to the community? You will lose personal ownership.",
          isLoading: donateMutation.isPending,
        }
      case "removeCommunity":
        return {
          title: "Remove from Community",
          message: "Remove this item from community pool?",
          isLoading: removeItemMutation.isPending,
        }
      case "removeCollection":
        return {
          title: "Remove from Collection",
          message: "Remove this item from the collection?",
          isLoading: false,
        }
      default:
        return {
          title: "",
          message: "",
          isLoading: false,
        }
    }
  }

  const config = getConfirmationConfig()

  const actions = (
    <>
      {isMobile ? (
        <>
          <EditItem item={item} width="full" justifyContent="center" />
          <DeleteItem id={item.id} width="full" justifyContent="center" />
        </>
      ) : (
        <>
          <EditItem item={item} />
          <DeleteItem id={item.id} />
        </>
      )}
      {isMobile ? (
        <Button
          variant="ghost"
          justifyContent="center"
          width="full"
          onClick={(e) => {
            e.stopPropagation()
            duplicateMutation.mutate()
          }}
          disabled={duplicateMutation.isPending}
        >
          <FiCopy style={{ marginRight: "8px" }} />I have another copy
        </Button>
      ) : (
        <MenuItem
          value="duplicate"
          onClick={(e) => {
            e.stopPropagation()
            duplicateMutation.mutate()
          }}
          disabled={duplicateMutation.isPending}
        >
          <FiCopy style={{ marginRight: "8px" }} />I have another copy
        </MenuItem>
      )}

      {onRemoveFromCollection &&
        (isMobile ? (
          <Button
            variant="ghost"
            justifyContent="center"
            width="full"
            color="red.500"
            onClick={(e) => {
              e.stopPropagation()
              setConfirmationType("removeCollection")
            }}
          >
            <FiMinusCircle style={{ marginRight: "8px" }} />
            Remove from Collection
          </Button>
        ) : (
          <MenuItem
            value="remove-from-collection"
            color="red.500"
            onClick={(e) => {
              e.stopPropagation()
              setConfirmationType("removeCollection")
            }}
          >
            <FiMinusCircle style={{ marginRight: "8px" }} />
            Remove from Collection
          </MenuItem>
        ))}

      {communityId && (
        <>
          {!isCommunityOwned &&
            !item.is_donation_pending &&
            (isMobile ? (
              <Button
                variant="ghost"
                justifyContent="center"
                width="full"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmationType("donate")
                }}
              >
                <FiHeart style={{ marginRight: "8px" }} />
                Donate to Community
              </Button>
            ) : (
              <MenuItem
                value="donate"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmationType("donate")
                }}
              >
                <FiHeart style={{ marginRight: "8px" }} />
                Donate to Community
              </MenuItem>
            ))}
          {(isAdmin || !isCommunityOwned) &&
            (isMobile ? (
              <Button
                variant="ghost"
                justifyContent="center"
                width="full"
                color="red.500"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmationType("removeCommunity")
                }}
              >
                <FiTrash2 style={{ marginRight: "8px" }} />
                Remove from Community
              </Button>
            ) : (
              <MenuItem
                value="remove-from-community"
                color="red.500"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmationType("removeCommunity")
                }}
              >
                <FiTrash2 style={{ marginRight: "8px" }} />
                Remove from Community
              </MenuItem>
            ))}
        </>
      )}
    </>
  )

  if (isMobile) {
    return (
      <>
        <DialogRoot
          open={isActionsModalOpen}
          onOpenChange={(e) => setIsActionsModalOpen(e.open)}
          placement="center"
          size="xs"
        >
          <DialogTrigger asChild>
            <IconButton variant="ghost" color="inherit">
              <BsThreeDotsVertical />
            </IconButton>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Item Actions</DialogTitle>
            </DialogHeader>
            <DialogBody pb={6}>
              <VStack gap={2} align="stretch">
                {actions}
              </VStack>
            </DialogBody>
            <DialogCloseTrigger />
          </DialogContent>
        </DialogRoot>

        <ConfirmationModal
          isOpen={!!confirmationType}
          onClose={() => setConfirmationType(null)}
          onConfirm={handleConfirm}
          title={config.title}
          message={config.message}
          isLoading={config.isLoading}
        />
      </>
    )
  }

  return (
    <>
      <MenuRoot>
        <MenuTrigger asChild>
          <IconButton variant="ghost" color="inherit">
            <BsThreeDotsVertical />
          </IconButton>
        </MenuTrigger>
        <MenuContent>{actions}</MenuContent>
      </MenuRoot>

      <ConfirmationModal
        isOpen={!!confirmationType}
        onClose={() => setConfirmationType(null)}
        onConfirm={handleConfirm}
        title={config.title}
        message={config.message}
        isLoading={config.isLoading}
      />
    </>
  )
}
