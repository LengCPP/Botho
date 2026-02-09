import BorrowerReportCard from "@/components/Common/BorrowerReportCard"
import ConfirmationModal from "@/components/Common/ConfirmationModal"
import ForgiveModal from "@/components/Common/ForgiveModal"
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
import { Link as RouterLink } from "@tanstack/react-router"
import { format } from "date-fns"
import { useMemo, useState } from "react"
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

  // Consolidated Modal State
  const [modalType, setModalType] = useState<
    | "cancel"
    | "remind"
    | "default"
    | "forgive"
    | "return"
    | "ratify"
    | "respond"
    | "extension_respond"
    | null
  >(null)
  const [pendingResponse, setPendingResponse] = useState<boolean | null>(null)

  const respondMutation = useMutation({
    mutationFn: (accept: boolean) =>
      LoansService.respondToLoanRequest({ id: loan.id, accept }),
    onSuccess: () => {
      showSuccessToast("Response sent successfully")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
      setModalType(null)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => LoansService.cancelLoan({ id: loan.id }),
    onSuccess: () => {
      showSuccessToast("Loan cancelled successfully")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
      setModalType(null)
    },
  })

  const ratifyMutation = useMutation({
    mutationFn: () => LoansService.ratifyLoan({ id: loan.id }),
    onSuccess: () => {
      showSuccessToast("Loan ratified! You now have the item.")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
      setModalType(null)
    },
  })

  const returnMutation = useMutation({
    mutationFn: () => LoansService.returnLoan({ id: loan.id }),
    onSuccess: (updatedLoan) => {
      showSuccessToast("Item marked as returned")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
      setModalType(null)
      onReview?.(updatedLoan)
    },
  })

  const extensionMutation = useMutation({
    mutationFn: (accept: boolean) =>
      LoansService.respondToExtensionRequest({ id: loan.id, accept }),
    onSuccess: () => {
      showSuccessToast("Extension response sent")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
      setModalType(null)
    },
  })

  const defaultMutation = useMutation({
    mutationFn: () => LoansService.markLoanDefaulted({ id: loan.id }),
    onSuccess: () => {
      showSuccessToast("Loan marked as defaulted")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
      setModalType(null)
    },
  })

  const remindMutation = useMutation({
    mutationFn: () => LoansService.sendReturnReminder({ id: loan.id }),
    onSuccess: () => {
      showSuccessToast("Return reminder sent to borrower")
      setModalType(null)
    },
  })

  const isPending = loan.status === "PENDING"
  const isAccepted = loan.status === "ACCEPTED"
  const isActive = loan.status === "ACTIVE"
  const isReturnPending = loan.status === "RETURN_PENDING"
  const isExtensionPending = loan.status === "EXTENSION_PENDING"
  const isDefaulted = loan.status === "DEFAULTED"
  const canCancel = isPending || isAccepted

  const isSelfRequested =
    type === "incoming" && loan.requester_id === currentUser?.id
  const restrictionApplies = isSelfRequested && loan.other_admins_exist

  // Modal Configuration
  const getModalConfig = () => {
    switch (modalType) {
      case "cancel":
        return {
          title: "Cancel Loan Request",
          message: `Are you sure you want to cancel the loan request for '${loan.item.title}'?`,
          onConfirm: () => cancelMutation.mutate(),
          isLoading: cancelMutation.isPending,
        }
      case "remind":
        return {
          title: "Send Return Reminder",
          message: `Send an email reminder to ${
            loan.requester?.full_name || "the borrower"
          } for '${loan.item.title}'?`,
          onConfirm: () => remindMutation.mutate(),
          isLoading: remindMutation.isPending,
        }
      case "default":
        return {
          title: "Mark as Unrecoverable",
          message: `Are you sure? This item will be marked as lost/unrecoverable and the borrower's honor score will be significantly penalized. This action should only be used as a last resort.`,
          onConfirm: () => defaultMutation.mutate(),
          isLoading: defaultMutation.isPending,
        }
      case "forgive":
        return null // Handled by separate ForgiveModal
      case "return":
        return {
          title: "Confirm Return",
          message: isReturnPending
            ? `Confirm that you have received '${loan.item.title}' back?`
            : `Mark '${loan.item.title}' as returned? Use this if the borrower has returned the item but hasn't signaled it in the app.`,
          onConfirm: () => returnMutation.mutate(),
          isLoading: returnMutation.isPending,
        }
      case "ratify":
        return {
          title: "Confirm Receipt",
          message: `Confirm that you have received '${loan.item.title}' from the owner/community?`,
          onConfirm: () => ratifyMutation.mutate(),
          isLoading: ratifyMutation.isPending,
        }
      case "respond":
        return {
          title: pendingResponse ? "Accept Request" : "Reject Request",
          message: `Are you sure you want to ${
            pendingResponse ? "accept" : "reject"
          } the request for '${loan.item.title}'?`,
          onConfirm: () => respondMutation.mutate(pendingResponse!),
          isLoading: respondMutation.isPending,
        }
      case "extension_respond":
        return {
          title: pendingResponse ? "Accept Extension" : "Reject Extension",
          message: `Are you sure you want to ${
            pendingResponse ? "accept" : "reject"
          } the extension request for '${loan.item.title}'?`,
          onConfirm: () => extensionMutation.mutate(pendingResponse!),
          isLoading: extensionMutation.isPending,
        }
      default:
        return null
    }
  }

  const modalConfig = getModalConfig()

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
                      : loan.status === "REJECTED" ||
                          loan.status === "CANCELLED" ||
                          loan.status === "DEFAULTED"
                        ? "red"
                        : loan.status === "RETURN_PENDING" ||
                            loan.status === "EXTENSION_PENDING"
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
                onClick={() => setModalType("cancel")}
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
            bg="orange.subtle"
            borderWidth="1px"
            borderColor="orange.muted"
            borderRadius="md"
          >
            <VStack align="start" gap={2}>
              <Text fontSize="xs" fontWeight="bold" color="orange.fg">
                Extension requested until:{" "}
                {format(new Date(loan.pending_extension_date!), "MMM d, yyyy")}
              </Text>
              {type === "incoming" && (
                <HStack gap={2} width="full">
                  <Button
                    size="xs"
                    colorPalette="green"
                    flex={1}
                    onClick={() => {
                      setPendingResponse(true)
                      setModalType("extension_respond")
                    }}
                    loading={
                      extensionMutation.isPending && pendingResponse === true
                    }
                    disabled={restrictionApplies}
                  >
                    <FiCheckCircle /> Accept
                  </Button>
                  <Button
                    size="xs"
                    colorPalette="red"
                    variant="outline"
                    flex={1}
                    onClick={() => {
                      setPendingResponse(false)
                      setModalType("extension_respond")
                    }}
                    loading={
                      extensionMutation.isPending && pendingResponse === false
                    }
                    disabled={restrictionApplies}
                  >
                    <FiXCircle /> Reject
                  </Button>
                </HStack>
              )}
            </VStack>
          </Box>
        )}

        {isDefaulted && (
          <Box
            mb={4}
            p={2}
            bg="red.subtle"
            borderWidth="1px"
            borderColor="red.muted"
            borderRadius="md"
          >
            <Text fontSize="xs" fontWeight="bold" color="red.fg">
              This item was marked as unrecoverable.
            </Text>
            {type === "incoming" && !loan.is_forgiven && (
              <Button
                size="xs"
                colorPalette="green"
                variant="outline"
                width="full"
                mt={2}
                onClick={() => setModalType("forgive")}
                disabled={restrictionApplies}
              >
                Forgive Borrower
              </Button>
            )}
            {loan.is_forgiven && (
              <Badge colorPalette="green" mt={2}>
                FORGIVEN
              </Badge>
            )}
          </Box>
        )}

        <Flex gap={2} mt="auto">
          {type === "incoming" && isPending && (
            <>
              <Button
                size="xs"
                colorPalette="green"
                onClick={() => {
                  setPendingResponse(true)
                  setModalType("respond")
                }}
                loading={respondMutation.isPending && pendingResponse === true}
                disabled={restrictionApplies}
              >
                <FiCheckCircle /> Accept
              </Button>
              <Button
                size="xs"
                colorPalette="red"
                variant="outline"
                onClick={() => {
                  setPendingResponse(false)
                  setModalType("respond")
                }}
                loading={respondMutation.isPending && pendingResponse === false}
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
              onClick={() => setModalType("ratify")}
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
              onClick={() => setModalType("return")}
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

          {loan.status === "RETURNED" &&
            !loan.has_review &&
            (type === "outgoing" || loan.requester_id !== currentUser?.id) && (
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

        {type === "incoming" && isActive && (
          <HStack gap={2} width="full" mt={2}>
            <Button
              size="xs"
              variant="outline"
              colorPalette="orange"
              flex={1}
              onClick={() => setModalType("remind")}
              loading={remindMutation.isPending}
              disabled={restrictionApplies}
            >
              Send Return Reminder
            </Button>
            <Button
              size="xs"
              variant="outline"
              colorPalette="red"
              flex={1}
              onClick={() => setModalType("default")}
              loading={defaultMutation.isPending}
              disabled={restrictionApplies}
            >
              Mark Unrecoverable
            </Button>
          </HStack>
        )}
      </Box>

      {modalConfig && (
        <ConfirmationModal
          isOpen={modalType !== null && modalType !== "forgive"}
          onClose={() => {
            setModalType(null)
            setPendingResponse(null)
          }}
          onConfirm={modalConfig.onConfirm}
          title={modalConfig.title}
          message={modalConfig.message}
          isLoading={modalConfig.isLoading}
        />
      )}

      <ForgiveModal 
        loan={loan}
        isOpen={modalType === "forgive"}
        onClose={() => setModalType(null)}
      />
    </>
  )
}

export default LoanCard
