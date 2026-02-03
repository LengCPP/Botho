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
import { FiCheckCircle, FiXCircle } from "react-icons/fi"

import { type LoanPublic, LoansService } from "@/client"
import useCustomToast from "@/hooks/useCustomToast"

interface LoanCardProps {
  loan: LoanPublic
  type: "incoming" | "outgoing"
}

export function LoanCard({ loan, type }: LoanCardProps) {
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()

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
    },
  })

  const isPending = loan.status === "PENDING"
  const isAccepted = loan.status === "ACCEPTED"
  const isActive = loan.status === "ACTIVE"
  const canCancel = isPending || isAccepted

  return (
    <Box p={4} borderWidth="1px" borderRadius="lg" bg="bg.panel" boxShadow="sm">
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
                }`
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
                    : "gray"
          }
        >
          {loan.status.toUpperCase()}
        </Badge>
      </Flex>

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
            >
              <FiCheckCircle /> Accept
            </Button>
            <Button
              size="xs"
              colorPalette="red"
              variant="outline"
              onClick={() => respondMutation.mutate(false)}
              loading={respondMutation.isPending}
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
          >
            <FiCheckCircle /> Confirm I have the item
          </Button>
        )}

        {type === "incoming" && isActive && (
          <Button
            size="xs"
            colorPalette="gray"
            width="full"
            onClick={() => returnMutation.mutate()}
            loading={returnMutation.isPending}
          >
            Mark as Returned
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
          >
            Cancel
          </Button>
        )}
      </Flex>
    </Box>
  )
}
