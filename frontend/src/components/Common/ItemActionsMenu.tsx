import {
  CommunitiesService,
  type CommunityPublic,
  type ItemPublic,
  ItemsService,
} from "@/client"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import {
  Button,
  IconButton,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { BsThreeDotsVertical } from "react-icons/bs"
import {
  FiBookOpen,
  FiCopy,
  FiEye,
  FiHeart,
  FiMinusCircle,
  FiTrash2,
} from "react-icons/fi"
import DeleteItem from "../Items/DeleteItem"
import EditItem from "../Items/EditItem"
import { LoanRequestModal } from "../Items/LoanRequestModal"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog"
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "../ui/menu"
import ConfirmationModal from "./ConfirmationModal"

interface ItemActionsMenuProps {
  item: ItemPublic
  communityId?: string
  isAdmin?: boolean
  onRemoveFromCollection?: () => void
  onlyInfo?: boolean
  onShowDetails?: () => void
}

export const ItemActionsMenu = ({
  item,
  communityId,
  isAdmin,
  onRemoveFromCollection,
  onlyInfo = false,
  onShowDetails,
}: ItemActionsMenuProps) => {
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuth()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [confirmationType, setConfirmationType] = useState<
    "donate" | "removeCommunity" | "removeCollection" | null
  >(null)
  const [isActionsModalOpen, setIsActionsModalOpen] = useState(false)
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false)

  const isMobile = useBreakpointValue({ base: true, md: false })
  const isCommunityOwned = !!item.community_owner || (item as any).is_community_owned

  const { data: community } = useQuery({
    queryKey: ["community", communityId],
    queryFn: () => CommunitiesService.readCommunity({ id: communityId! }),
    enabled: !!communityId,
  })

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
      {onShowDetails &&
        (isMobile ? (
          <Button
            variant="ghost"
            justifyContent="center"
            width="full"
            onClick={(e) => {
              e.stopPropagation()
              setIsActionsModalOpen(false)
              setTimeout(() => {
                onShowDetails()
              }, 100)
            }}
          >
            <FiEye style={{ marginRight: "8px" }} /> View Details
          </Button>
        ) : (
          <MenuItem
            value="view-details"
            onClick={(e) => {
              e.stopPropagation()
              setTimeout(() => {
                onShowDetails()
              }, 100)
            }}
          >
            <FiEye style={{ marginRight: "8px" }} /> View Details
          </MenuItem>
        ))}
      <EditItem
        item={item}
        width="full"
        justifyContent={isMobile ? "center" : "flex-start"}
        onlyInfo={onlyInfo}
        variant="ghost"
      />
      <DeleteItem
        id={item.id}
        width="full"
        justifyContent={isMobile ? "center" : "flex-start"}
      />
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

        <LoanRequestModal
          item={item}
          isOpen={isLoanModalOpen}
          onClose={() => setIsLoanModalOpen(false)}
          community={community}
        />

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

      <LoanRequestModal
        item={item}
        isOpen={isLoanModalOpen}
        onClose={() => setIsLoanModalOpen(false)}
        community={community}
      />

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
