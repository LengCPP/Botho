import { type CommunityPublic, type ItemPublic, LoansService } from "@/client"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import {
  Box,
  Button,
  Input as ChakraInput,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FiAlertCircle, FiShield } from "react-icons/fi"

interface LoanRequestModalProps {
  item: ItemPublic
  isOpen: boolean
  onClose: () => void
  community?: CommunityPublic
}

export function LoanRequestModal({
  item,
  isOpen,
  onClose,
  community,
}: LoanRequestModalProps) {
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const { user: currentUser } = useAuth()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data: {
      item_id: string
      start_date: string
      end_date: string
      community_id?: string
    }) => LoansService.createLoanRequest({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Loan request sent!")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
      queryClient.invalidateQueries({ queryKey: ["items"] })
      onClose()
    },
    onError: (err: any) => {
      showErrorToast(err.body?.detail || "Failed to send loan request")
    },
  })

  // Privacy Logic: Reveal if Friends or Private Community
  const isOwner = item.owner_id === currentUser?.id

  // If community prop is missing, check if owner and requester share any private community
  const sharedPrivateComm =
    !community && item.communities?.some((c) => c.is_private)
  const isPrivateContext = community?.is_private || sharedPrivateComm

  // Show notice if borrowing from a user (not community-owned) and it's not a private context
  const isUserOwned = !!(item as any).user_owner
  const showPrivacyNotice = !isOwner && isUserOwned && !isPrivateContext

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={(e) => !e.open && onClose()}
      placement="center"
      size="md"
    >
      <DialogContent
        backdropProps={{ backdropFilter: "blur(10px)" }}
        borderRadius="xl"
      >
        <DialogHeader>
          <DialogTitle>Request Loan: {item.title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <VStack gap={4} align="stretch">
            {showPrivacyNotice && (
              <Box
                p={3}
                bg="orange.50"
                color="orange.800"
                _dark={{ bg: "orange.950", color: "orange.200" }}
                rounded="md"
                border="1px solid"
                borderColor="orange.200"
                fontSize="sm"
              >
                <VStack align="start" gap={1}>
                  <Text
                    fontWeight="bold"
                    display="flex"
                    alignItems="center"
                    gap={2}
                  >
                    <FiAlertCircle /> Privacy Notice
                  </Text>
                  <Text>
                    Your personal details (Full Name and Contact Info) will be
                    revealed to the owner to help them decide on your request.
                  </Text>
                </VStack>
              </Box>
            )}

            {isPrivateContext && (
              <Box
                p={3}
                bg="blue.50"
                color="blue.800"
                _dark={{ bg: "blue.950", color: "blue.200" }}
                rounded="md"
                border="1px solid"
                borderColor="blue.200"
                fontSize="sm"
              >
                <VStack align="start" gap={1}>
                  <Text
                    fontWeight="bold"
                    display="flex"
                    alignItems="center"
                    gap={2}
                  >
                    <FiShield /> Community Trust
                  </Text>
                  <Text>
                    Your identity is shared with other members of this private
                    circle.
                  </Text>
                </VStack>
              </Box>
            )}

            <Field label="Start Date">
              <ChakraInput
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="End Date">
              <ChakraInput
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </VStack>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            colorPalette="accent"
            onClick={() =>
              mutation.mutate({
                item_id: item.id,
                start_date: startDate,
                end_date: endDate,
                community_id: community?.id,
              })
            }
            loading={mutation.isPending}
            disabled={!startDate || !endDate}
          >
            Send Request
          </Button>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}
