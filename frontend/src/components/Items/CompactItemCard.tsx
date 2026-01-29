import { Box, Card, Flex, HStack, Image, Text, VStack, Badge, IconButton } from "@chakra-ui/react"
import type { ItemPublic, LoanPublic } from "@/client"
import { getImageUrl } from "@/utils"
import { useColorModeValue } from "@/components/ui/color-mode"
import { useState } from "react"
import useAuth from "@/hooks/useAuth"
import { ItemActionsMenu } from "@/components/Common/ItemActionsMenu"
import { FriendItemActionsMenu } from "./FriendItemActionsMenu"
import { FiChevronRight } from "react-icons/fi"

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
  const [isFlipped, setIsFlipped] = useState(false)
  const [itemIndex, setItemIndex] = useState(0)
  const { user } = useAuth()
  
  const items = Array.isArray(itemProp) ? itemProp : [itemProp]
  const isGrouped = items.length > 1
  const item = items[itemIndex]
  const availableCount = items.filter((i) => i.is_available).length

  const isBook = item.item_type === "book"
  const extraData = (item.extra_data as any) || {}

  const bgColor = useColorModeValue("orange.50", "gray.800")
  const textColor = useColorModeValue("gray.800", "gray.100")
  const borderColor = useColorModeValue("orange.200", "gray.600")

  const handleFlip = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsFlipped(!isFlipped)
  }

  const handleNextItem = (e: React.MouseEvent) => {
    e.stopPropagation()
    setItemIndex((prev) => (prev + 1) % items.length)
  }

  const handleDescriptionClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onShowDetails()
  }

  const isOwner = item.owner_id === user?.id
  const isBorrowing =
    !!loan &&
    loan.requester_id === user?.id &&
    ["active", "return_pending"].includes(loan.status)

  return (
    <Box
      aspectRatio={isBook ? 2 / 3 : 3 / 4}
      width="100%"
      cursor="pointer"
      perspective="1000px"
      borderRadius="lg"
      position="relative"
    >
      {/* Layered effect for multiple items */}
      {isGrouped && (
        <>
          <Box
            position="absolute"
            inset="0"
            bg={bgColor}
            borderWidth="1px"
            borderColor={borderColor}
            borderRadius="lg"
            transform="translate(2px, -2px) rotate(1deg)"
            zIndex={-1}
            boxShadow="sm"
          />
          <Box
            position="absolute"
            inset="0"
            bg={bgColor}
            borderWidth="1px"
            borderColor={borderColor}
            borderRadius="lg"
            transform="translate(4px, -4px) rotate(2deg)"
            zIndex={-2}
            boxShadow="xs"
            opacity={0.7}
          />
        </>
      )}

      <Box
        position="relative"
        width="100%"
        height="100%"
        transition="transform 0.6s"
        transformStyle="preserve-3d"
        transform={isFlipped ? "rotateY(180deg)" : "rotateY(0deg)"}
      >
        {/* --- FRONT FACE (Cover Only) --- */}
        <Card.Root
          position="absolute"
          width="100%"
          height="100%"
          backfaceVisibility="hidden"
          onClick={handleFlip}
          overflow="hidden"
          borderRadius="lg"
          borderWidth="0"
          boxShadow="md"
          bg={item.image_url ? "black" : bgColor}
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
            <Flex
              direction="column"
              justify="center"
              align="center"
              height="100%"
              p={4}
              bg={bgColor}
              color={textColor}
              textAlign="center"
              borderWidth="4px"
              borderColor={borderColor}
              borderStyle="double"
            >
              <Text
                fontSize="xs"
                fontWeight="bold"
                fontFamily="serif"
                lineClamp={4}
              >
                {item.title}
              </Text>
            </Flex>
          )}

          {isGrouped && (
            <Badge
              position="absolute"
              bottom={1}
              right={1}
              colorPalette="orange"
              variant="solid"
              size="2xs"
              borderRadius="full"
              boxShadow="md"
            >
              {items.length}
            </Badge>
          )}
        </Card.Root>

        {/* --- BACK FACE (Details) --- */}
        <Card.Root
          position="absolute"
          width="100%"
          height="100%"
          backfaceVisibility="hidden"
          transform="rotateY(180deg)"
          onClick={handleFlip}
          overflow="hidden"
          borderRadius="lg"
          boxShadow="md"
          bg={bgColor}
          color={textColor}
          borderColor={borderColor}
        >
          <Card.Body p={3} height="100%" display="flex" flexDirection="column">
            <Flex justify="space-between" align="center" mb={1}>
              {isGrouped ? (
                <HStack gap={1}>
                  <Text fontSize="3xs" color="gray.500">
                    {itemIndex + 1}/{items.length}
                  </Text>
                  <IconButton
                    aria-label="Next"
                    size="3xs"
                    variant="ghost"
                    onClick={handleNextItem}
                  >
                    <FiChevronRight />
                  </IconButton>
                </HStack>
              ) : <Box />}
              <HStack gap={1} onClick={(e) => e.stopPropagation()}>
                {isOwner ? (
                  <ItemActionsMenu
                    item={item}
                    communityId={communityId}
                    isAdmin={isAdmin}
                    onRemoveFromCollection={onRemoveFromCollection}
                  />
                ) : (
                  <FriendItemActionsMenu
                    item={item}
                    isBorrowing={isBorrowing}
                    loanId={loan?.id}
                    communityId={communityId}
                    isAdmin={isAdmin}
                  />
                )}
              </HStack>
            </Flex>
            <VStack align="start" gap={1} flex="1" overflow="hidden">
              <Text fontSize="xs" fontWeight="bold" lineClamp={2}>
                {item.title}
              </Text>

              {isBook && extraData.author && (
                <Text
                  fontSize="2xs"
                  fontStyle="italic"
                  color="gray.500"
                  lineClamp={1}
                >
                  By {String(extraData.author)}
                </Text>
              )}

              <Box
                mt={2}
                flex="1"
                width="full"
                onClick={handleDescriptionClick}
                bg={useColorModeValue("blackAlpha.50", "whiteAlpha.50")}
                p={2}
                borderRadius="md"
                overflow="hidden"
              >
                <Text fontSize="2xs" color="inherit" opacity={0.9} lineClamp={5}>
                  {item.description || "No description provided. Click to see more."}
                </Text>
                <Text fontSize="3xs" color="blue.500" mt={1} fontWeight="bold">
                  TAP FOR MORE
                </Text>
              </Box>

              <Badge
                colorPalette={availableCount > 0 ? "green" : "red"}
                variant="outline"
                size="2xs"
                width="full"
                textAlign="center"
              >
                {isGrouped
                  ? availableCount > 0
                    ? `${availableCount} Available`
                    : "On Loan"
                  : availableCount > 0
                    ? "Available"
                    : "On Loan"}
              </Badge>
            </VStack>
          </Card.Body>
        </Card.Root>
      </Box>
    </Box>
  )
}
