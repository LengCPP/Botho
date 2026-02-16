import BorrowerReportCard from "@/components/Common/BorrowerReportCard"
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Link,
  Text,
  VStack,
} from "@chakra-ui/react"
import { Link as RouterLink } from "@tanstack/react-router"
import { format } from "date-fns"
import {
  FiCheckCircle,
  FiClock,
  FiRepeat,
  FiStar,
  FiXCircle,
} from "react-icons/fi"

import type { LoanPublic } from "@/client"
import AddReview from "@/components/Items/AddReview"
import useAuth from "@/hooks/useAuth"

interface LoanCardProps {
  loan: LoanPublic
  type: "incoming" | "outgoing"
  onReview?: (loan: LoanPublic) => void
  onAction?: (
    loan: LoanPublic,
    action:
      | "cancel"
      | "respond"
      | "ratify"
      | "return"
      | "extension"
      | "remind"
      | "default"
      | "forgive"
      | "signalReturn"
      | "requestExtension",
    params?: any,
  ) => void
}

export function LoanCard({ loan, type, onReview, onAction }: LoanCardProps) {
  const { user: currentUser } = useAuth()

  const isPending = loan.status === "PENDING"
  const isAccepted = loan.status === "ACCEPTED"
  const isActive = loan.status === "ACTIVE"
  const isReturnPending = loan.status === "RETURN_PENDING"
  const isExtensionPending = loan.status === "EXTENSION_PENDING"
  const isDefaulted = loan.status === "DEFAULTED"
  const isReturned = loan.status === "RETURNED"
  const canCancel = isPending || isAccepted

  const isSelfRequested =
    type === "incoming" && loan.requester_id === currentUser?.id
  const restrictionApplies = isSelfRequested && (loan as any).other_admins_exist

  const canBorrowerReview =
    type === "outgoing" && (isReturned || isReturnPending) && !loan.has_review

  return (
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
      borderColor={
        (isReturned || isReturnPending) &&
        !loan.has_review &&
        type === "outgoing"
          ? "ui.hover"
          : "border.subtle"
      }
    >
      <Flex justify="space-between" align="start" mb={4} wrap="wrap" gap={4}>
        <VStack align="start" gap={0} flex={1} minW="200px">
          <HStack>
            <Text fontWeight="bold" fontSize="lg">
              {loan.item.title}
            </Text>
            {canBorrowerReview && (
              <Badge colorPalette="orange" variant="solid" size="xs">
                Review Needed
              </Badge>
            )}
          </HStack>
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
            <Badge colorPalette="gray" variant="subtle" fontSize="2xs">
              Your Request (Requires Other Admin)
            </Badge>
          )}
          {canCancel && (
            <Button
              aria-label="Cancel Loan"
              size="xs"
              variant="ghost"
              colorPalette="red"
              onClick={() => onAction?.(loan, "cancel")}
              disabled={restrictionApplies}
            >
              <FiXCircle />
            </Button>
          )}
        </VStack>
      </Flex>

      {type === "incoming" && isPending && (
        <Box mb={4}>
          <BorrowerReportCard userId={loan.requester_id} />
        </Box>
      )}

      <Flex
        fontSize="sm"
        gap={8}
        mb={4}
        wrap="wrap"
        align="center"
        justify="space-between"
      >
        <HStack gap={8}>
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

        {type === "outgoing" && (isActive || isReturned) && (
          <Box>
            <AddReview item={loan.item} />
          </Box>
        )}
      </Flex>

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
                  onClick={() =>
                    onAction?.(loan, "extension", { accept: true })
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
                  onClick={() =>
                    onAction?.(loan, "extension", { accept: false })
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
              onClick={() => onAction?.(loan, "forgive")}
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

      <Flex gap={2} mt="auto" direction="column">
        <Flex gap={2} wrap="wrap">
          {type === "incoming" && isPending && (
            <>
              <Button
                size="xs"
                colorPalette="green"
                flex={1}
                minW="120px"
                onClick={() => onAction?.(loan, "respond", { accept: true })}
                disabled={restrictionApplies}
              >
                <FiCheckCircle /> Accept
              </Button>
              <Button
                size="xs"
                colorPalette="red"
                variant="outline"
                flex={1}
                minW="120px"
                onClick={() => onAction?.(loan, "respond", { accept: false })}
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
              onClick={() => onAction?.(loan, "ratify")}
              disabled={restrictionApplies}
            >
              <FiCheckCircle /> Confirm I have the item
            </Button>
          )}

          {type === "outgoing" && isActive && (
            <>
              <Button
                size="xs"
                variant="outline"
                colorPalette="main"
                flex={1}
                minW="120px"
                onClick={() => onAction?.(loan, "requestExtension")}
              >
                <FiRepeat /> Extend
              </Button>
              <Button
                size="xs"
                colorPalette="accent"
                flex={1}
                minW="120px"
                onClick={() => onAction?.(loan, "signalReturn")}
              >
                <FiClock /> Return Item
              </Button>
            </>
          )}

          {type === "incoming" && (isActive || isReturnPending) && (
            <Button
              size="xs"
              colorPalette={isReturnPending ? "green" : "gray"}
              width="full"
              onClick={() => onAction?.(loan, "return")}
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

          {canBorrowerReview && (
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

          {isReturned &&
            !loan.has_review &&
            type === "incoming" &&
            loan.requester_id !== currentUser?.id && (
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

          {isReturned && loan.has_review && (
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
          <HStack gap={2} width="full" wrap="wrap">
            <Button
              size="xs"
              variant="outline"
              colorPalette="orange"
              flex={1}
              minW="150px"
              onClick={() => onAction?.(loan, "remind")}
              disabled={restrictionApplies}
            >
              Send Return Reminder
            </Button>
            <Button
              size="xs"
              variant="outline"
              colorPalette="red"
              flex={1}
              minW="150px"
              onClick={() => onAction?.(loan, "default")}
              disabled={restrictionApplies}
            >
              Mark Unrecoverable
            </Button>
          </HStack>
        )}
      </Flex>
    </Box>
  )
}

export default LoanCard
