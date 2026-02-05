import {
  CommunitiesService,
  type ItemPublic,
  type LoanPublic,
  LoansService,
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
import { ExtensionRequestModal } from "./ExtensionRequestModal"
import { FriendItemActionsMenu } from "./FriendItemActionsMenu"
import { LoanRequestModal } from "./LoanRequestModal"

interface CompactItemCardProps {
  item: ItemPublic | ItemPublic[]
  loan?: LoanPublic
  communityId?: string
  isAdmin?: boolean
  onShowDetails: () => void
  onRemoveFromCollection?: () => void
}

export const CompactItemCard = ({
  item: itemProp,
  loan: loanProp,
  communityId,
  isAdmin,
  onShowDetails,
  onRemoveFromCollection,
}: CompactItemCardProps) => {
  const [itemIndex, setItemIndex] = useState(0)
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false)
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false)
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data: community } = useQuery({
    queryKey: ["community", communityId],
    queryFn: () => CommunitiesService.readCommunity({ id: communityId! }),
    enabled: !!communityId,
  })

  const items = Array.isArray(itemProp) ? itemProp : [itemProp]
  const isGrouped = items.length > 1
  const item = items[itemIndex]
  const availableCount = items.filter((i) => i.is_available).length

  // Fetch loan context
  const { data: outgoingLoans } = useQuery({
    queryKey: ["loans", "outgoing"],
    queryFn: () => LoansService.readOutgoingLoanRequests({}),
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
    mutationFn: () => LoansService.cancelLoan({ id: currentLoan!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] })
    },
  })

  const signalReturnMutation = useMutation({
    mutationFn: () =>
      LoansService.signalReturn({ id: (loanProp?.id || currentLoan?.id)! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] })
    },
  })

  const isOwner = item.owner_id === user?.id
  const isCommunityOwned = !!item.community_owner
  const canManage = isOwner || (isCommunityOwned && isAdmin)

  const renderAction = () => {
    if (canManage || isOwner) return null

    if (isPending) {
      return (
        <Button
          size="2xs"
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
            size="2xs"
            colorPalette="main"
            onClick={(e) => {
              e.stopPropagation()
              setIsExtensionModalOpen(true)
            }}
          >
            <FiClock />
          </Button>
          <Button
            size="2xs"
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
        size="2xs"
        colorPalette="accent"
        onClick={(e) => {
          e.stopPropagation()
          setIsLoanModalOpen(true)
        }}
        disabled={!item.is_available}
      >
        <FiBookOpen /> Request
      </Button>
    )
  }

  return (
    <>
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
            {item.image_url ? (
              <Image
                src={getImageUrl(item.image_url)}
                alt={item.title}
                objectFit="cover"
                width="100%"
                height="100%"
              />
            ) : (
              <Flex align="center" justify="center" h="100%" bg="gray.400">
                <Text fontSize="2xs" color="white" fontWeight="bold">
                  ?
                </Text>
              </Flex>
            )}
            {isGrouped && (
              <Badge
                position="absolute"
                bottom={0}
                right={0}
                colorPalette="accent"
                size="2xs"
                borderRadius="xs"
              >
                {items.length}
              </Badge>
            )}
          </Box>

          <VStack align="start" gap={0} flex={1} overflow="hidden">
            <Text fontSize="sm" fontWeight="bold" lineClamp={1}>
              {item.title}
            </Text>
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
              {isGrouped && (
                <IconButton
                  aria-label="Next Item"
                  size="2xs"
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

      <LoanRequestModal
        item={item}
        isOpen={isLoanModalOpen}
        onClose={() => setIsLoanModalOpen(false)}
        community={community}
      />

      {currentLoan && (
        <ExtensionRequestModal
          loanId={currentLoan.id}
          itemTitle={item.title}
          currentEndDate={currentLoan.end_date}
          isOpen={isExtensionModalOpen}
          onClose={() => setIsExtensionModalOpen(false)}
        />
      )}
    </>
  )
}
