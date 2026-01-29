import {
  CommunitiesService,
  type ItemPublic,
  ItemsService,
  LoansService,
} from "@/client"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { IconButton } from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { BsThreeDotsVertical } from "react-icons/bs"
import {
  FiBookOpen,
  FiCheck,
  FiCopy,
  FiCornerUpLeft,
  FiHeart,
  FiTrash2,
} from "react-icons/fi"
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "../ui/menu"
import { LoanRequestModal } from "./LoanRequestModal"

interface FriendItemActionsMenuProps {
  item: ItemPublic
  isBorrowing?: boolean
  loanId?: string
  communityId?: string
  isAdmin?: boolean
}

export const FriendItemActionsMenu = ({
  item,
  isBorrowing = false,
  loanId,
  communityId,
  isAdmin = false,
}: FriendItemActionsMenuProps) => {
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false)
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuth()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const isPooledByMe = item.added_by_id === currentUser?.id
  const isCommunityOwned = !!item.community_owner

  // Check if user already has a copy
  const { data: myItemsData } = useQuery({
    queryKey: ["items", "me"],
    queryFn: () => ItemsService.readItems({ ownerId: currentUser?.id }),
    enabled: !!currentUser,
  })

  const hasCopy = myItemsData?.data.some(
    (i) =>
      i.title.toLowerCase().trim() === item.title.toLowerCase().trim() &&
      (i.author || "").toLowerCase().trim() ===
        (item.author || "").toLowerCase().trim(),
  )

  const signalReturnMutation = useMutation({
    mutationFn: () => LoansService.signalReturn({ id: loanId! }),
    onSuccess: () => {
      showSuccessToast("Return signaled to owner.")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
    },
    onError: (err: any) => {
      showErrorToast(err.body?.detail || "Failed to signal return")
    },
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
    },
    onError: () => showErrorToast("Failed to initiate donation"),
  })

  const ratifyDonationMutation = useMutation({
    mutationFn: () =>
      CommunitiesService.ratifyDonation({ id: communityId!, itemId: item.id }),
    onSuccess: () => {
      showSuccessToast("Donation ratified!")
      queryClient.invalidateQueries({
        queryKey: ["communityItems", communityId],
      })
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
    onError: () => showErrorToast("Failed to ratify donation"),
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
    },
    onError: () => showErrorToast("Failed to remove item"),
  })

  const duplicateMutation = useMutation({
    mutationFn: () => ItemsService.duplicateItem({ id: item.id }),
    onSuccess: () => {
      showSuccessToast("Item added to your collection!")
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
    onError: () => showErrorToast("Failed to copy item"),
  })

  if (isBorrowing) {
    return (
      <IconButton
        size="xs"
        colorPalette="blue"
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation()
          signalReturnMutation.mutate()
        }}
        loading={signalReturnMutation.isPending}
        title="Signal Return"
      >
        <FiCornerUpLeft />
      </IconButton>
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
        <MenuContent>
          <MenuItem
            value="request-loan"
            onClick={() => setIsLoanModalOpen(true)}
            disabled={!item.is_available}
          >
            <FiBookOpen style={{ marginRight: "8px" }} />
            {item.is_available ? "Request Loan" : "On Loan (Unavailable)"}
          </MenuItem>

          <MenuItem
            value="duplicate"
            onClick={(e) => {
              e.stopPropagation()
              duplicateMutation.mutate()
            }}
            disabled={duplicateMutation.isPending}
          >
            <FiCopy style={{ marginRight: "8px" }} />
            {hasCopy ? "I have another copy" : "I have a copy"}
          </MenuItem>

          {communityId && (
            <>
              {isPooledByMe &&
                !isCommunityOwned &&
                !item.is_donation_pending && (
                  <MenuItem
                    value="donate"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Donate this item to the community? You will lose personal ownership.",
                        )
                      ) {
                        donateMutation.mutate()
                      }
                    }}
                  >
                    <FiHeart style={{ marginRight: "8px" }} />
                    Donate to Community
                  </MenuItem>
                )}

              {item.is_donation_pending && isAdmin && (
                <MenuItem
                  value="ratify"
                  onClick={() => ratifyDonationMutation.mutate()}
                >
                  <FiCheck style={{ marginRight: "8px" }} />
                  Ratify Donation
                </MenuItem>
              )}

              {(isAdmin || isPooledByMe) && (
                <MenuItem
                  value="remove-from-community"
                  color="red.500"
                  onClick={() => {
                    if (
                      window.confirm("Remove this item from community pool?")
                    ) {
                      removeItemMutation.mutate()
                    }
                  }}
                >
                  <FiTrash2 style={{ marginRight: "8px" }} />
                  Remove from Community
                </MenuItem>
              )}
            </>
          )}
        </MenuContent>
      </MenuRoot>

      <LoanRequestModal
        item={item}
        isOpen={isLoanModalOpen}
        onClose={() => setIsLoanModalOpen(false)}
        communityId={communityId}
      />
    </>
  )
}
