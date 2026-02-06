import BorrowerReportCard from "@/components/Common/BorrowerReportCard"
import ReviewModal from "@/components/Common/ReviewModal"
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { useState } from "react"
import { FiCheckCircle, FiXCircle } from "react-icons/fi"

import { type LoanPublic, LoansService } from "@/client"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"

interface LoanCardProps {
  loan: LoanPublic
  type: "incoming" | "outgoing"
  otherAdminsExist?: boolean
}

export function LoanCard({ loan, type, otherAdminsExist }: LoanCardProps) {
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()
  const { user: currentUser } = useAuth()
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)

  const respondMutation = useMutation({
    mutationFn: (accept: boolean) =>
      LoansService.respondToLoanRequest({ id: loan.id, accept }),
    onSuccess: () => {
      showSuccessToast("Response sent successfully")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => LoansService.cancelLoan({ id: loan.id }),
    onSuccess: () => {
      showSuccessToast("Loan cancelled successfully")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
    },
  })

  const ratifyMutation = useMutation({
    mutationFn: () => LoansService.ratifyLoan({ id: loan.id }),
    onSuccess: () => {
      showSuccessToast("Loan ratified! You now have the item.")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
    },
  })

  const returnMutation = useMutation({
    mutationFn: () => LoansService.returnLoan({ id: loan.id }),
    onSuccess: () => {
      showSuccessToast("Item marked as returned")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
      setIsReviewModalOpen(true)
    },
  })

  const isPending = loan.status === "PENDING"
  const isAccepted = loan.status === "ACCEPTED"
  const isActive = loan.status === "ACTIVE"
  const isReturnPending = loan.status === "RETURN_PENDING"
  const canCancel = isPending || isAccepted

  const isSelfRequested =
    type === "incoming" && loan.requester_id === currentUser?.id
  const restrictionApplies = isSelfRequested && !!otherAdminsExist

  return (
    <>
      <Box
        p={4}
        borderWidth="1px"
        borderRadius="lg"
        bg="bg.panel"
        boxShadow="sm"
        opacity={restrictionApplies ? 0.6 : 1}
        filter={restrictionApplies ? "grayscale(40%)" : "none"}
        pointerEvents={restrictionApplies ? "none" : "auto"}
        position="relative"
      >
        {restrictionApplies && (
          <Badge
            position="absolute"
            top={2}
            right={2}
            colorPalette="gray"
            variant="subtle"
            fontSize="3xs"
          >
            Your Request (Requires Other Admin)
          </Badge>
        )}
        <Flex justify="space-between" align="start" mb={4}>
          <VStack align="start" gap={0}>
            <Text fontWeight="bold" fontSize="lg">
              {loan.item.title}
            </Text>
            <Text fontSize="xs" color="fg.muted">
              {type === "incoming"
                ? `Borrower: ${
                    loan.requester?.full_name ||
                    loan.requester?.email ||
                    "Unknown"
                  } ${isSelfRequested ? "(You)" : ""}`
                : `Owner: ${
                    loan.owner?.full_name ||
                    loan.owner?.email ||
                    loan.community?.name ||
                    "Community"
                  }`}
            </Text>
          </VStack>
          <Badge
            colorPalette={
              loan.status === "ACTIVE"
                ? "green"
                : loan.status === "PENDING"
                  ? "accent"
                  : loan.status === "ACCEPTED"
                    ? "main"
                    : loan.status === "REJECTED" || loan.status === "CANCELLED"
                      ? "red"
                      : loan.status === "RETURN_PENDING"
                        ? "orange"
                        : "gray"
            }
          >
            {loan.status.replace("_", " ").toUpperCase()}
          </Badge>
        </Flex>

        {type === "incoming" && isPending && (
          <Box mb={4}>
            <BorrowerReportCard userId={loan.requester_id} />
          </Box>
        )}

        <HStack fontSize="sm" gap={4} mb={4}>
          <VStack align="start" gap={0}>
            <Text
              fontSize="2xs"
              color="fg.muted"
              fontWeight="bold"
              textTransform="uppercase"
            >
              From
            </Text>
            <Text>{format(new Date(loan.start_date), "MMM d, yyyy")}</Text>
          </VStack>
          <VStack align="start" gap={0}>
            <Text
              fontSize="2xs"
              color="fg.muted"
              fontWeight="bold"
              textTransform="uppercase"
            >
              To
            </Text>
            <Text>{format(new Date(loan.end_date), "MMM d, yyyy")}</Text>
          </VStack>
        </HStack>

        <Flex gap={2} mt="auto">
          {type === "incoming" && isPending && (
            <>
              <Button
                size="xs"
                colorPalette="green"
                onClick={() => respondMutation.mutate(true)}
                loading={respondMutation.isPending}
                disabled={restrictionApplies}
              >
                <FiCheckCircle /> Accept
              </Button>
              <Button
                size="xs"
                colorPalette="red"
                variant="outline"
                onClick={() => respondMutation.mutate(false)}
                loading={respondMutation.isPending}
                disabled={restrictionApplies}
              >
                <FiXCircle /> Reject
              </Button>
            </>
          )}

          {type === "outgoing" && isAccepted && (
            <Button
              size="xs"
              colorPalette="main"
              width="full"
              onClick={() => ratifyMutation.mutate()}
              loading={ratifyMutation.isPending}
              disabled={restrictionApplies}
            >
              <FiCheckCircle /> Confirm I have the item
            </Button>
          )}

          {type === "incoming" && (isActive || isReturnPending) && (
            <Button
              size="xs"
              colorPalette={isReturnPending ? "green" : "gray"}
              width="full"
              onClick={() => returnMutation.mutate()}
              loading={returnMutation.isPending}
              disabled={restrictionApplies}
            >
              {isReturnPending ? (
                <>
                  <FiCheckCircle /> Confirm Receipt
                </>
              ) : (
                "Mark as Returned"
              )}
            </Button>
          )}

          {canCancel && (
            <Button
              size="xs"
              variant="ghost"
              colorPalette="red"
              onClick={() => cancelMutation.mutate()}
              loading={cancelMutation.isPending}
              ml={type === "outgoing" && isAccepted ? 0 : "auto"}
              disabled={restrictionApplies}
            >
              Cancel
            </Button>
          )}
        </Flex>
      </Box>

      <ReviewModal
        loan={loan}
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
      />
    </>
  )
}

export default LoanCard
