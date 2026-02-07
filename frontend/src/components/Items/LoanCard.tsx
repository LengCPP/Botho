import BorrowerReportCard from "@/components/Common/BorrowerReportCard"
import ConfirmationModal from "@/components/Common/ConfirmationModal"
import { Link as RouterLink } from "@tanstack/react-router"
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Link,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { useState } from "react"
import { FiCheckCircle, FiStar, FiXCircle } from "react-icons/fi"

import { type LoanPublic, LoansService } from "@/client"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"

interface LoanCardProps {
  loan: LoanPublic
  type: "incoming" | "outgoing"
  otherAdminsExist?: boolean
  onReview?: (loan: LoanPublic) => void
}

export function LoanCard({
  loan,
  type,
  otherAdminsExist,
  onReview,
}: LoanCardProps) {
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()
  const { user: currentUser } = useAuth()
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false)

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
      setIsCancelConfirmOpen(false)
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
    onSuccess: (updatedLoan) => {
      showSuccessToast("Item marked as returned")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
      onReview?.(updatedLoan)
    },
  })

  const isPending = loan.status === "PENDING"
  const isAccepted = loan.status === "ACCEPTED"
  const isActive = loan.status === "ACTIVE"
  const isReturnPending = loan.status === "RETURN_PENDING"
  const isExtensionPending = !!loan.pending_extension_date
  const canCancel = isPending || isAccepted

  const extensionMutation = useMutation({
    mutationFn: (accept: boolean) =>
      LoansService.respondToExtensionRequest({ id: loan.id, accept }),
    onSuccess: () => {
      showSuccessToast("Extension response sent")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
    },
  })

  const isSelfRequested =
    type === "incoming" && loan.requester_id === currentUser?.id
  const restrictionApplies = isSelfRequested && loan.other_admins_exist

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
        <Flex justify="space-between" align="start" mb={4}>
          <VStack align="start" gap={0}>
            <Text fontWeight="bold" fontSize="lg">
              {loan.item.title}
            </Text>
          {type === "incoming" ? (
            <Box>
              <Text fontSize="xs" color="fg.muted" as="span">
                Borrower:{" "}
              </Text>
              {loan.requester ? (
                <Box display="inline-block" verticalAlign="top">
                  <Link
                    asChild
                    colorPalette="blue"
                    fontWeight="medium"
                    fontSize="xs"
                  >
                    <RouterLink to={`/users/${loan.requester.id}`}>
                      {loan.requester.full_name ||
                        loan.requester.email ||
                        "Unknown"}
                    </RouterLink>
                  </Link>
                  {loan.requester.email &&
                    loan.requester.email !== "[Hidden]" &&
                    loan.requester.full_name && (
                      <Text
                        fontSize="xs"
                        color="gray.500"
                        lineHeight="shorter"
                        display="block"
                      >
                        {loan.requester.email}
                      </Text>
                    )}
                </Box>
              ) : (
                <Text fontSize="xs" color="fg.muted" as="span">
                  Unknown
                </Text>
              )}
              {isSelfRequested && (
                <Text fontSize="xs" color="fg.muted" as="span">
                  {" "}
                  (You)
                </Text>
              )}
            </Box>
          ) : (
            <Text fontSize="xs" color="fg.muted">
              Owner:{" "}
              {loan.owner ? (
                <Link asChild colorPalette="blue" fontWeight="medium">
                  <RouterLink to={`/users/${loan.owner.id}`}>
                    {loan.owner.full_name || loan.owner.email || "Owner"}
                  </RouterLink>
                </Link>
              ) : (
                loan.community?.name || "Community"
              )}
            </Text>
          )}
          </VStack>
          <VStack align="end" gap={2}>
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
            {restrictionApplies && (
              <Badge colorPalette="gray" variant="subtle" fontSize="3xs">
                Your Request (Requires Other Admin)
              </Badge>
            )}
            {canCancel && (
              <IconButton
                aria-label="Cancel Loan"
                size="xs"
                variant="ghost"
                colorPalette="red"
                onClick={() => setIsCancelConfirmOpen(true)}
                disabled={restrictionApplies}
              >
                <FiXCircle />
              </IconButton>
            )}
          </VStack>
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

        {isExtensionPending && (
          <Box
            mb={4}
            p={2}
            bg="orange.50"
            borderWidth="1px"
            borderColor="orange.200"
            borderRadius="md"
          >
            <VStack align="start" gap={2}>
              <Text fontSize="xs" fontWeight="bold" color="orange.800">
                Extension requested until:{" "}
                {format(new Date(loan.pending_extension_date!), "MMM d, yyyy")}
              </Text>
              {type === "incoming" && (
                <HStack gap={2} width="full">
                  <Button
                    size="xs"
                    colorPalette="green"
                    flex={1}
                    onClick={() => extensionMutation.mutate(true)}
                    loading={extensionMutation.isPending}
                    disabled={restrictionApplies}
                  >
                    <FiCheckCircle /> Accept
                  </Button>
                  <Button
                    size="xs"
                    colorPalette="red"
                    variant="outline"
                    flex={1}
                    onClick={() => extensionMutation.mutate(false)}
                    loading={extensionMutation.isPending}
                    disabled={restrictionApplies}
                  >
                    <FiXCircle /> Reject
                  </Button>
                </HStack>
              )}
            </VStack>
          </Box>
        )}

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

          {loan.status === "RETURNED" && !loan.has_review && (
            <Button
              size="xs"
              colorPalette="main"
              width="full"
              onClick={() => onReview?.(loan)}
              variant="surface"
            >
              <FiStar /> Review Experience
            </Button>
          )}

          {loan.status === "RETURNED" && loan.has_review && (
            <Badge
              colorPalette="gray"
              variant="subtle"
              width="full"
              justifyContent="center"
              py={1}
            >
              Review Submitted
            </Badge>
          )}
        </Flex>
      </Box>

      <ConfirmationModal
        isOpen={isCancelConfirmOpen}
        onClose={() => setIsCancelConfirmOpen(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancel Loan Request"
        message={`Are you sure you want to cancel the loan request for '${loan.item.title}'?`}
        isLoading={cancelMutation.isPending}
      />
    </>
  )
}

export default LoanCard
