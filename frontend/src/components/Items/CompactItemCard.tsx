import {
  Communities,
  type ItemPublic,
  type LoanPublic,
  Loans,
} from "@/client"
import { ItemActionsMenu } from "@/components/Common/ItemActionsMenu"
import { useColorModeValue } from "@/components/ui/color-mode"
import useAuth from "@/hooks/useAuth"
import { getImageUrl } from "@/utils"
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  FiBookOpen,
  FiChevronRight,
  FiClock,
  FiCornerUpLeft,
  FiX,
} from "react-icons/fi"
import { FriendItemActionsMenu } from "./FriendItemActionsMenu"

interface CompactItemCardProps {
  item: ItemPublic | ItemPublic[]
  loan?: LoanPublic
  communityId?: string
  isAdmin?: boolean
  onShowDetails: () => void
  onRemoveFromCollection?: () => void
  onReview?: (loan: LoanPublic) => void
  onLoanRequest?: (item: ItemPublic) => void
  onExtensionRequest?: (loan: LoanPublic) => void
}

export const CompactItemCard = ({
  item: itemProp,
  loan: loanProp,
  communityId,
  isAdmin,
  onShowDetails,
  onRemoveFromCollection,
  onReview,
  onLoanRequest,
  onExtensionRequest,
}: CompactItemCardProps) => {
  const [itemIndex, setItemIndex] = useState(0)
  const [imgError, setImgError] = useState(false)
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data: community } = useQuery({
    queryKey: ["community", communityId],
    queryFn: () => Communities.readCommunity({ id: communityId! }),
    enabled: !!communityId,
  })

  const items = Array.isArray(itemProp) ? itemProp : [itemProp]
  const item = items[itemIndex]
  const availableCount = items.filter((i) => i.is_available).length

  // Fetch loan context
  const { data: outgoingLoans } = useQuery({
    queryKey: ["loans", "outgoing"],
    queryFn: () => Loans.readOutgoingLoanRequests({}),
    enabled: !!user,
  })

  const currentLoan =
    loanProp ||
    outgoingLoans?.data.find(
      (l) =>
        l.item_id === item.id &&
        !["REJECTED", "CANCELLED", "RETURNED"].includes(l.status),
    )

  const isPending = currentLoan?.status === "PENDING"
  const isActive = currentLoan?.status === "ACTIVE"
  const isReturnPending = currentLoan?.status === "RETURN_PENDING"

  const bgColor = useColorModeValue("white", "gray.800")
  const borderColor = useColorModeValue("gray.200", "gray.700")

  const cancelLoanMutation = useMutation({
    mutationFn: () => Loans.cancelLoan({ id: currentLoan!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
    },
  })

  const signalReturnMutation = useMutation({
    mutationFn: () =>
      Loans.signalReturn({ id: (loanProp?.id || currentLoan?.id)! }),
    onSuccess: (updatedLoan) => {
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
      onReview?.(updatedLoan)
    },
  })

  const isOwner = item.owner_id === user?.id
  const isCommunityOwned =
    !!item.community_owner || (item as any).is_community_owned
  const canManage = isOwner || (isCommunityOwned && isAdmin)

  const renderAction = () => {
    if (isOwner) return null

    if (isPending) {
      return (
        <Button
          size="xs"
          colorPalette="red"
          variant="subtle"
          onClick={(e) => {
            e.stopPropagation()
            cancelLoanMutation.mutate()
          }}
          loading={cancelLoanMutation.isPending}
        >
          <FiX /> Cancel
        </Button>
      )
    }

    if (isActive) {
      return (
        <HStack gap={1}>
          <Button
            size="xs"
            colorPalette="main"
            onClick={(e) => {
              e.stopPropagation()
              onExtensionRequest?.(currentLoan!)
            }}
          >
            <FiClock />
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              signalReturnMutation.mutate()
            }}
            loading={signalReturnMutation.isPending}
          >
            <FiCornerUpLeft />
          </Button>
        </HStack>
      )
    }

    if (isReturnPending) {
      return (
        <Badge size="xs" colorPalette="orange">
          Returning
        </Badge>
      )
    }

    return (
      <Button
        size="xs"
        colorPalette="accent"
        onClick={(e) => {
          e.stopPropagation()
          onLoanRequest?.(item)
        }}
        disabled={!item.is_available}
      >
        <FiBookOpen /> Request
      </Button>
    )
  }

  const category = item.work_metadata?.category || (item as any).category
  const info = (item.info as any) || {}
  const condition = Number(info.average_condition_grade || info.grade || 0)

  return (
    <Box
      width="100%"
      p={2}
      bg={bgColor}
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="md"
      cursor="pointer"
      onClick={onShowDetails}
      _hover={{ shadow: "sm", borderColor: "ui.hover" }}
      transition="all 0.2s"
    >
      <Flex align="center" gap={3}>
        <Box
          width="40px"
          height="60px"
          bg="gray.100"
          borderRadius="sm"
          overflow="hidden"
          flexShrink={0}
          position="relative"
        >
          {item.image_url && !imgError ? (
            <Image
              src={getImageUrl(item.image_url)}
              alt={item.title}
              objectFit="cover"
              width="100%"
              height="100%"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <Flex align="center" justify="center" h="100%" bg="gray.400">
              <Text fontSize="2xs" color="white" fontWeight="bold">
                ?
              </Text>
            </Flex>
          )}
          {items.length > 1 && (
            <Badge
              position="absolute"
              bottom={0}
              right={0}
              colorPalette="accent"
              size="xs"
              borderRadius="xs"
            >
              {items.length}
            </Badge>
          )}
        </Box>

        <VStack align="start" gap={0} flex={1} overflow="hidden">
          <HStack width="full" justify="space-between" align="baseline">
            <HStack gap={2} flex={1} minW={0}>
              <Text fontSize="sm" fontWeight="bold" lineClamp={1}>
                {item.title}
              </Text>
              {condition > 0 && (
                <Badge
                  size="xs"
                  variant="subtle"
                  colorPalette={
                    condition >= 8 ? "green" : condition >= 5 ? "yellow" : "red"
                  }
                >
                  {condition}/10
                </Badge>
              )}
            </HStack>
            {category && (
              <Badge size="xs" colorPalette="blue" variant="subtle">
                {category}
              </Badge>
            )}
          </HStack>
          {item.author && (
            <Text fontSize="xs" color="gray.500" lineClamp={1}>
              {item.author}
            </Text>
          )}
          <HStack gap={2} mt={1}>
            <Badge
              colorPalette={availableCount > 0 ? "green" : "red"}
              variant="subtle"
              size="xs"
            >
              {availableCount > 0 ? "Available" : "On Loan"}
            </Badge>
            {items.length > 1 && (
              <IconButton
                aria-label="Next Item"
                size="xs"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  setItemIndex((prev) => (prev + 1) % items.length)
                }}
                h="14px"
                minW="14px"
              >
                <FiChevronRight size="10px" />
              </IconButton>
            )}
          </HStack>
        </VStack>

        <HStack gap={2} onClick={(e) => e.stopPropagation()}>
          {renderAction()}
          {canManage ? (
            <ItemActionsMenu
              item={item}
              communityId={communityId}
              isAdmin={isAdmin}
              onRemoveFromCollection={onRemoveFromCollection}
              onShowDetails={onShowDetails}
            />
          ) : (
            <FriendItemActionsMenu
              item={item}
              isBorrowing={isActive || isReturnPending}
              loanId={currentLoan?.id}
              communityId={communityId}
              community={community}
              isAdmin={isAdmin}
              onShowDetails={onShowDetails}
            />
          )}
        </HStack>
      </Flex>
    </Box>
  )
}
