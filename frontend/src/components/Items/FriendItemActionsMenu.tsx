import {
  CommunitiesService,
  type CommunityPublic,
  type ItemPublic,
  ItemsService,
  LoansService,
} from "@/client"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import {
  Button,
  HStack,
  IconButton,
  Text,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { BsThreeDotsVertical } from "react-icons/bs"
import {
  FiBookOpen,
  FiCheck,
  FiClock,
  FiCopy,
  FiCornerUpLeft,
  FiEye,
  FiHeart,
  FiTrash2,
  FiX,
} from "react-icons/fi"
import ConfirmationModal from "../Common/ConfirmationModal"
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
import { ExtensionRequestModal } from "./ExtensionRequestModal"
import { LoanRequestModal } from "./LoanRequestModal"

interface FriendItemActionsMenuProps {
  item: ItemPublic
  isBorrowing?: boolean
  loanId?: string
  communityId?: string
  community?: CommunityPublic
  isAdmin?: boolean
  onShowDetails?: () => void
}

export const FriendItemActionsMenu = ({
  item,
  isBorrowing = false,
  loanId,
  communityId,
  community,
  isAdmin = false,
  onShowDetails,
}: FriendItemActionsMenuProps) => {
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false)
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false)
  const [isActionsModalOpen, setIsActionsModalOpen] = useState(false)
  const [isDonateModalOpen, setIsDonateModalOpen] = useState(false)
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false)

  const queryClient = useQueryClient()
  const { user: currentUser } = useAuth()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const isMobile = useBreakpointValue({ base: true, md: false })
  const isPooledByMe = item.added_by_id === currentUser?.id
  const isCommunityOwned = !!item.community_owner

  // Fetch user's outgoing loans to check status
  const { data: outgoingLoans } = useQuery({
    queryKey: ["loans", "outgoing"],
    queryFn: () => LoansService.readOutgoingLoanRequests({}),
    enabled: !!currentUser,
  })

  const currentLoan = outgoingLoans?.data.find(
    (l) =>
      l.item_id === item.id &&
      !["REJECTED", "CANCELLED", "RETURNED"].includes(l.status),
  )

  const isPending = currentLoan?.status === "PENDING"
  const isActive = currentLoan?.status === "ACTIVE"
  const isReturnPending = currentLoan?.status === "RETURN_PENDING"

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

  const cancelLoanMutation = useMutation({
    mutationFn: () => LoansService.cancelLoan({ id: currentLoan!.id }),
    onSuccess: () => {
      showSuccessToast("Loan request cancelled.")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
    },
    onError: (err: any) => {
      showErrorToast(err.body?.detail || "Failed to cancel loan request")
    },
  })

  const signalReturnMutation = useMutation({
    mutationFn: () =>
      LoansService.signalReturn({ id: (loanId || currentLoan?.id)! }),
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
      setIsDonateModalOpen(false)
      queryClient.invalidateQueries({
        queryKey: ["communityItems", communityId],
      })
      queryClient.invalidateQueries({ queryKey: ["items"] })
      setIsActionsModalOpen(false)
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
      setIsActionsModalOpen(false)
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
      setIsRemoveModalOpen(false)
      queryClient.invalidateQueries({
        queryKey: ["communityItems", communityId],
      })
      queryClient.invalidateQueries({ queryKey: ["items"] })
      setIsActionsModalOpen(false)
    },
    onError: () => showErrorToast("Failed to remove item"),
  })

  const duplicateMutation = useMutation({
    mutationFn: () => ItemsService.duplicateItem({ id: item.id }),
    onSuccess: () => {
      showSuccessToast("Item added to your collection!")
      queryClient.invalidateQueries({ queryKey: ["items"] })
      setIsActionsModalOpen(false)
    },
    onError: () => showErrorToast("Failed to copy item"),
  })

  const loanAction = () => {
    if (isPending) {
      return (
        <>
          {isMobile ? (
            <Button
              variant="ghost"
              justifyContent="center"
              width="full"
              colorPalette="red"
              onClick={() => cancelLoanMutation.mutate()}
              loading={cancelLoanMutation.isPending}
            >
              <FiX style={{ marginRight: "8px" }} /> Cancel Request
            </Button>
          ) : (
            <MenuItem
              value="cancel-request"
              color="red.500"
              onClick={() => cancelLoanMutation.mutate()}
              disabled={cancelLoanMutation.isPending}
            >
              <FiX style={{ marginRight: "8px" }} /> Cancel Request
            </MenuItem>
          )}
        </>
      )
    }
    if (isActive) {
      return (
        <>
          {isMobile ? (
            <Button
              variant="ghost"
              justifyContent="center"
              width="full"
              onClick={() => setIsExtensionModalOpen(true)}
            >
              <FiClock style={{ marginRight: "8px" }} /> Request Extension
            </Button>
          ) : (
            <MenuItem
              value="request-extension"
              onClick={() => setIsExtensionModalOpen(true)}
            >
              <FiClock style={{ marginRight: "8px" }} /> Request Extension
            </MenuItem>
          )}
        </>
      )
    }
    if (isReturnPending) {
      return (
        <Text fontSize="xs" color="orange.500" textAlign="center" p={2}>
          Return Pending Confirmation
        </Text>
      )
    }
    return (
      <>
        {isMobile ? (
          <Button
            variant="ghost"
            justifyContent="center"
            width="full"
            onClick={() => {
              setIsLoanModalOpen(true)
              setIsActionsModalOpen(false)
            }}
            disabled={!item.is_available}
          >
            <FiBookOpen style={{ marginRight: "8px" }} />
            {item.is_available ? "Request Loan" : "On Loan (Unavailable)"}
          </Button>
        ) : (
          <MenuItem
            value="request-loan"
            onClick={() => setIsLoanModalOpen(true)}
            disabled={!item.is_available}
          >
            <FiBookOpen style={{ marginRight: "8px" }} />
            {item.is_available ? "Request Loan" : "On Loan (Unavailable)"}
          </MenuItem>
        )}
      </>
    )
  }

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

      {loanAction()}

      {(isActive || isBorrowing) && !isReturnPending && (
        <>
          {isMobile ? (
            <Button
              variant="ghost"
              justifyContent="center"
              width="full"
              onClick={(e) => {
                e.stopPropagation()
                signalReturnMutation.mutate()
              }}
              loading={signalReturnMutation.isPending}
            >
              <FiCornerUpLeft style={{ marginRight: "8px" }} /> Signal Return
            </Button>
          ) : (
            <MenuItem
              value="signal-return"
              onClick={(e) => {
                e.stopPropagation()
                signalReturnMutation.mutate()
              }}
              disabled={signalReturnMutation.isPending}
            >
              <FiCornerUpLeft style={{ marginRight: "8px" }} /> Signal Return
            </MenuItem>
          )}
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
          <FiCopy style={{ marginRight: "8px" }} />
          {hasCopy ? "I have another copy" : "I have a copy"}
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
          <FiCopy style={{ marginRight: "8px" }} />
          {hasCopy ? "I have another copy" : "I have a copy"}
        </MenuItem>
      )}

      {communityId && (
        <>
          {isPooledByMe &&
            !isCommunityOwned &&
            !item.is_donation_pending &&
            (isMobile ? (
              <Button
                variant="ghost"
                justifyContent="center"
                width="full"
                onClick={() => setIsDonateModalOpen(true)}
              >
                <FiHeart style={{ marginRight: "8px" }} />
                Donate to Community
              </Button>
            ) : (
              <MenuItem
                value="donate"
                onClick={() => setIsDonateModalOpen(true)}
              >
                <FiHeart style={{ marginRight: "8px" }} />
                Donate to Community
              </MenuItem>
            ))}

          {item.is_donation_pending &&
            isAdmin &&
            (isMobile ? (
              <Button
                variant="ghost"
                justifyContent="center"
                width="full"
                onClick={() => ratifyDonationMutation.mutate()}
              >
                <FiCheck style={{ marginRight: "8px" }} />
                Ratify Donation
              </Button>
            ) : (
              <MenuItem
                value="ratify"
                onClick={() => ratifyDonationMutation.mutate()}
              >
                <FiCheck style={{ marginRight: "8px" }} />
                Ratify Donation
              </MenuItem>
            ))}

          {(isAdmin || isPooledByMe) &&
            (isMobile ? (
              <Button
                variant="ghost"
                justifyContent="center"
                width="full"
                color="red.500"
                onClick={() => setIsRemoveModalOpen(true)}
              >
                <FiTrash2 style={{ marginRight: "8px" }} />
                Remove from Community
              </Button>
            ) : (
              <MenuItem
                value="remove-from-community"
                color="red.500"
                onClick={() => setIsRemoveModalOpen(true)}
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

        {(currentLoan || loanId) && (
          <ExtensionRequestModal
            loanId={(loanId || currentLoan?.id)!}
            itemTitle={item.title}
            currentEndDate={currentLoan?.end_date || ""}
            isOpen={isExtensionModalOpen}
            onClose={() => setIsExtensionModalOpen(false)}
          />
        )}

        <ConfirmationModal
          isOpen={isDonateModalOpen}
          onClose={() => setIsDonateModalOpen(false)}
          onConfirm={() => donateMutation.mutate()}
          title="Donate to Community"
          message="Are you sure you want to donate this item to the community pool? You will lose personal ownership of this copy."
          isLoading={donateMutation.isPending}
        />

        <ConfirmationModal
          isOpen={isRemoveModalOpen}
          onClose={() => setIsRemoveModalOpen(false)}
          onConfirm={() => removeItemMutation.mutate()}
          title="Remove from Community"
          message="Are you sure you want to remove this item from the community pool?"
          isLoading={removeItemMutation.isPending}
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

      {(currentLoan || loanId) && (
        <ExtensionRequestModal
          loanId={(loanId || currentLoan?.id)!}
          itemTitle={item.title}
          currentEndDate={currentLoan?.end_date || ""}
          isOpen={isExtensionModalOpen}
          onClose={() => setIsExtensionModalOpen(false)}
        />
      )}

      <ConfirmationModal
        isOpen={isDonateModalOpen}
        onClose={() => setIsDonateModalOpen(false)}
        onConfirm={() => donateMutation.mutate()}
        title="Donate to Community"
        message="Are you sure you want to donate this item to the community pool? You will lose personal ownership of this copy."
        isLoading={donateMutation.isPending}
      />

      <ConfirmationModal
        isOpen={isRemoveModalOpen}
        onClose={() => setIsRemoveModalOpen(false)}
        onConfirm={() => removeItemMutation.mutate()}
        title="Remove from Community"
        message="Are you sure you want to remove this item from the community pool?"
        isLoading={removeItemMutation.isPending}
      />
    </>
  )
}
