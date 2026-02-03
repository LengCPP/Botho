import type { ItemPublic, LoanPublic } from "@/client"
import { ItemActionsMenu } from "@/components/Common/ItemActionsMenu"
import { useColorModeValue } from "@/components/ui/color-mode"
import useAuth from "@/hooks/useAuth"
import { getImageUrl } from "@/utils"
import {
  Badge,
  Box,
  Flex,
  HStack,
  IconButton,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useState } from "react"
import { FiChevronRight, FiEye } from "react-icons/fi"
import { FriendItemActionsMenu } from "./FriendItemActionsMenu"

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
  loan,
  communityId,
  isAdmin,
  onShowDetails,
  onRemoveFromCollection,
}: CompactItemCardProps) => {
  const [itemIndex, setItemIndex] = useState(0)
  const { user } = useAuth()

  const items = Array.isArray(itemProp) ? itemProp : [itemProp]
  const isGrouped = items.length > 1
  const item = items[itemIndex]
  const availableCount = items.filter((i) => i.is_available).length

  const isBook = item.item_type === "book"
  const extraData = (item.extra_data as any) || {}

  const bgColor = useColorModeValue("white", "gray.800")
  const borderColor = useColorModeValue("gray.200", "gray.700")
  const textColor = useColorModeValue("gray.800", "gray.100")

  const handleNextItem = (e: React.MouseEvent) => {
    e.stopPropagation()
    setItemIndex((prev) => (prev + 1) % items.length)
  }

  const isOwner = item.owner_id === user?.id
  const isCommunityOwned = !!item.community_owner
  const canManage = isOwner || (isCommunityOwned && isAdmin)

  const isBorrowing =
    !!loan &&
    loan.requester_id === user?.id &&
    ["ACTIVE", "RETURN_PENDING"].includes(loan.status)

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
        {/* Small Image on Left */}
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

        {/* Title and Author next to image */}
        <VStack align="start" gap={0} flex={1} overflow="hidden">
          <Text fontSize="sm" fontWeight="bold" lineClamp={1}>
            {item.title}
          </Text>
          {isBook && extraData.author && (
            <Text fontSize="xs" color="gray.500" lineClamp={1}>
              {String(extraData.author)}
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
                onClick={handleNextItem}
                h="14px"
                minW="14px"
              >
                <FiChevronRight size="10px" />
              </IconButton>
            )}
          </HStack>
        </VStack>

        {/* Ellipsis menu at the end */}
        <HStack gap={1} onClick={(e) => e.stopPropagation()}>
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
              isBorrowing={isBorrowing}
              loanId={loan?.id}
              communityId={communityId}
              isAdmin={isAdmin}
              onShowDetails={onShowDetails}
            />
          )}
        </HStack>
      </Flex>
    </Box>
  )
}
