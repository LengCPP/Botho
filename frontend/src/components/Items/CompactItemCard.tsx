import { Box, Card, Flex, HStack, Image, Text, VStack } from "@chakra-ui/react"
import type { ItemPublic, LoanPublic } from "@/client"
import { getImageUrl } from "@/utils"
import { useColorModeValue } from "@/components/ui/color-mode"
import { useState } from "react"
import useAuth from "@/hooks/useAuth"
import { ItemActionsMenu } from "@/components/Common/ItemActionsMenu"
import { FriendItemActionsMenu } from "./FriendItemActionsMenu"

interface CompactItemCardProps {
  item: ItemPublic
  loan?: LoanPublic
  communityId?: string
  isAdmin?: boolean
  onShowDetails: () => void
  onRemoveFromCollection?: () => void
}

export const CompactItemCard = ({
  item,
  loan,
  communityId,
  isAdmin,
  onShowDetails,
  onRemoveFromCollection,
}: CompactItemCardProps) => {
  const [isFlipped, setIsFlipped] = useState(false)
  const { user } = useAuth()
  const isBook = item.item_type === "book"
  const extraData = (item.extra_data as any) || {}

  const bgColor = useColorModeValue("orange.50", "gray.800")
  const textColor = useColorModeValue("gray.800", "gray.100")
  const borderColor = useColorModeValue("orange.200", "gray.600")

  const handleFlip = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsFlipped(!isFlipped)
  }

  const handleDescriptionClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onShowDetails()
  }

  const isOwner = item.owners?.some((o) => o.id === user?.id)
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
    >
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
            <Flex justify="flex-end" mb={1}>
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
            </VStack>
          </Card.Body>
        </Card.Root>
      </Box>
    </Box>
  )
}
