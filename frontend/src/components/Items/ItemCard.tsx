import { CommunitiesService, type ItemPublic, type LoanPublic } from "@/client"
import { ItemActionsMenu } from "@/components/Common/ItemActionsMenu"
import { useColorModeValue } from "@/components/ui/color-mode"
import useAuth from "@/hooks/useAuth"
import { getImageUrl } from "@/utils"
import {
  Badge,
  Box,
  Card,
  Flex,
  HStack,
  IconButton,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { format } from "date-fns"
import type React from "react"
import { useState } from "react"
import { FiExternalLink, FiChevronRight, FiChevronLeft } from "react-icons/fi"
import { FriendItemActionsMenu } from "./FriendItemActionsMenu"

interface ItemCardProps {
  item: ItemPublic | ItemPublic[]
  loan?: LoanPublic
  communityId?: string
  isAdmin?: boolean
  displayOwnerId?: string
  onRemoveFromCollection?: () => void
}

const ItemCard = ({
  item: itemProp,
  loan,
  communityId,
  isAdmin,
  displayOwnerId,
  onRemoveFromCollection,
}: ItemCardProps) => {
  const [isFlipped, setIsFlipped] = useState(false)
  const [itemIndex, setItemIndex] = useState(0)
  const { user } = useAuth()
  const navigate = useNavigate()

  const items = Array.isArray(itemProp) ? itemProp : [itemProp]
  const isGrouped = items.length > 1
  const item = items[itemIndex]
  const availableCount = items.filter((i) => i.is_available).length

  // Color Mode Values
  const bgColor = useColorModeValue("orange.50", "gray.800")
  const textColor = useColorModeValue("gray.800", "gray.100")
  const borderColor = useColorModeValue("orange.200", "gray.600")
  const scrollbarColor = useColorModeValue("orange.200", "gray.600")

  const handleFlip = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsFlipped(!isFlipped)
  }

  const handleNextItem = (e: React.MouseEvent) => {
    e.stopPropagation()
    setItemIndex((prev) => (prev + 1) % items.length)
  }

  const handlePrevItem = (e: React.MouseEvent) => {
    e.stopPropagation()
    setItemIndex((prev) => (prev - 1 + items.length) % items.length)
  }

  const handleGoToCollection = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (item.collection_id) {
      navigate({
        to: "/collections/$collectionId",
        params: { collectionId: item.collection_id },
      })
    }
  }

  // Simplified ownership detection
  const isOwner = item.owner_id === user?.id
  const isBorrowing =
    !!loan &&
    loan.requester_id === user?.id &&
    ["active", "return_pending"].includes(loan.status)

  const isBook = item.item_type === "book"
  const extraData = (item.extra_data as any) || {}

  const effectiveDisplayOwnerId = displayOwnerId || item.added_by_id

  // Determine availability status based on context
  let isDisplayAvailable = item.is_available
  if (isOwner && item.owner) {
    isDisplayAvailable = item.owner.is_available
  } else if (
    effectiveDisplayOwnerId &&
    item.owner &&
    item.owner.id === effectiveDisplayOwnerId
  ) {
    isDisplayAvailable = item.owner.is_available
  }

  return (
    <Box
      aspectRatio={isBook ? 2 / 3 : 3 / 4}
      width="100%"
      minW="160px"
      cursor="pointer"
      perspective="1000px"
      borderRadius="lg"
      position="relative"
    >
      {/* Dynamic Layered effect for grouped items (up to 3 total items visible) */}
      {items.slice(1, 3).map((layerItem, idx) => (
        <Box
          key={layerItem.id}
          position="absolute"
          inset="0"
          bg={layerItem.image_url ? "black" : bgColor}
          borderWidth={layerItem.image_url ? "0" : "1px"}
          borderColor={borderColor}
          borderRadius="lg"
          transform={`translate(${(idx + 1) * 4}px, -${(idx + 1) * 4}px) rotate(${(idx + 1) * 2}deg)`}
          zIndex={-(idx + 1)}
          boxShadow={idx === 0 ? "sm" : "xs"}
          opacity={idx === 0 ? 1 : 0.7}
          overflow="hidden"
        >
          {layerItem.image_url && (
            <Image
              src={getImageUrl(layerItem.image_url)}
              alt=""
              objectFit="cover"
              width="100%"
              height="100%"
              opacity={0.8}
            />
          )}
        </Box>
      ))}

      <Box
        position="relative"
        width="100%"
        height="100%"
        transition="transform 0.6s"
        transformStyle="preserve-3d"
        transform={isFlipped ? "rotateY(180deg)" : "rotateY(0deg)"}
      >
        {/* --- FRONT FACE (Cover) --- */}
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
          bg={item.image_url ? "black" : bgColor} // Black bg for covers to avoid white gaps
        >
          {item.image_url ? (
            <Image
              src={getImageUrl(item.image_url)}
              alt={item.title}
              objectFit="cover" // Cover entire area to avoid white spaces
              width="100%"
              height="100%"
            />
          ) : (
            // Fallback Cover if no image is present
            <Flex
              direction="column"
              justify="center"
              align="center"
              height="100%"
              p={6}
              bg={bgColor}
              color={textColor}
              textAlign="center"
              borderWidth="4px"
              borderColor={borderColor}
              borderStyle="double"
            >
              <Text
                fontSize="xl"
                fontWeight="bold"
                fontFamily="serif"
                mb={2}
                lineClamp={3}
              >
                {item.title}
              </Text>
              {isBook && extraData.author && (
                <Text fontSize="md" fontStyle="italic">
                  {String(extraData.author)}
                </Text>
              )}
            </Flex>
          )}

          {isGrouped && (
            <Badge
              position="absolute"
              bottom={2}
              right={2}
              colorPalette="orange"
              variant="solid"
              size="sm"
              borderRadius="full"
              boxShadow="lg"
            >
              {items.length}
            </Badge>
          )}

          {item.collection_id && (
            <IconButton
              aria-label="Go to collection"
              size="xs"
              position="absolute"
              top={2}
              right={2}
              colorPalette="orange"
              variant="solid"
              onClick={handleGoToCollection}
              zIndex={10}
            >
              <FiExternalLink />
            </IconButton>
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
          <Card.Body p={4} height="100%" display="flex" flexDirection="column">
            <Flex justify="space-between" align="start" mb={2}>
              <Badge colorPalette="teal" variant="solid" size="sm">
                {String(item.item_type || "General")}
              </Badge>
              <HStack gap={1} onClick={(e) => e.stopPropagation()}>
                {item.collection_id && (
                  <IconButton
                    aria-label="Go to collection"
                    size="xs"
                    colorPalette="orange"
                    variant="ghost"
                    onClick={handleGoToCollection}
                  >
                    <FiExternalLink />
                  </IconButton>
                )}
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

            <VStack align="start" gap={1} mb={3} flex="1" overflow="hidden">
              <Text fontSize="lg" fontWeight="bold" lineClamp={2}>
                {item.title}
              </Text>

              {isBook && extraData.author && (
                <Text
                  fontSize="sm"
                  fontStyle="italic"
                  color="gray.500"
                  lineClamp={1}
                >
                  By {String(extraData.author)}
                </Text>
              )}

              {isBook && (extraData.category || extraData.genre) && (
                <HStack gap={1} mt={1} wrap="wrap">
                  {extraData.category && (
                    <Badge variant="outline" size="xs" colorPalette="blue">
                      {extraData.category}
                    </Badge>
                  )}
                  {extraData.genre && (
                    <Badge variant="outline" size="xs" colorPalette="purple">
                      {extraData.genre}
                    </Badge>
                  )}
                </HStack>
              )}

              <Box
                mt={2}
                flex="1"
                overflowY="auto"
                width="full"
                pr={1}
                css={{
                  "&::-webkit-scrollbar": { width: "4px" },
                  "&::-webkit-scrollbar-thumb": {
                    background: scrollbarColor,
                    borderRadius: "full",
                  },
                }}
              >
                <Text fontSize="xs" color="inherit" opacity={0.9}>
                  {item.description || "No description provided."}
                </Text>
              </Box>
            </VStack>

            <Box
              mt="auto"
              pt={2}
              borderTopWidth="1px"
              borderColor={borderColor}
            >
              {loan && (
                <VStack align="start" gap={0} mb={2}>
                  <Text
                    fontSize="2xs"
                    color="fg.muted"
                    fontWeight="bold"
                    textTransform="uppercase"
                  >
                    Due Date
                  </Text>
                  <Text fontSize="xs" fontWeight="bold" color="orange.500">
                    {format(new Date(loan.end_date), "MMM d, yyyy")}
                  </Text>
                </VStack>
              )}

              <Badge
                colorPalette={availableCount > 0 ? "green" : "red"}
                variant="solid"
                mb={2}
                width="full"
                justifyContent="center"
              >
                {isGrouped
                  ? availableCount > 0
                    ? `${availableCount} Available`
                    : "On Loan"
                  : availableCount > 0
                    ? "Available"
                    : "On Loan"}
              </Badge>

              <Flex justify="space-between" align="center" mb={1}>
                <Text fontSize="xs" fontWeight="semibold">
                  Owner:
                </Text>
                {isGrouped && (
                  <HStack gap={1}>
                    <Text fontSize="2xs" color="gray.500">
                      {itemIndex + 1}/{items.length}
                    </Text>
                    <IconButton
                      aria-label="Next Owner"
                      size="2xs"
                      variant="ghost"
                      onClick={handleNextItem}
                    >
                      <FiChevronRight />
                    </IconButton>
                  </HStack>
                )}
              </Flex>
              <HStack gap={1} flexWrap="wrap">
                {loan ? (
                  <Link
                    to={
                      loan.owner?.id === user?.id
                        ? "/profile"
                        : "/users/$userId"
                    }
                    params={
                      loan.owner?.id === user?.id
                        ? {}
                        : { userId: loan.owner?.id || "" }
                    }
                    onClick={(e) => e.stopPropagation()}
                    style={{ textDecoration: "none" }}
                  >
                    <Text
                      fontSize="xs"
                      color="blue.500"
                      _hover={{ textDecoration: "underline" }}
                    >
                      {loan.owner
                        ? loan.owner.id === user?.id
                          ? "You"
                          : String(loan.owner.full_name || loan.owner.email)
                        : item.community_owner?.name || "Community"}
                    </Text>
                  </Link>
                ) : (
                  <>
                    {item.community_owner ? (
                      <Link
                        to="/communities/$communityId"
                        params={{ communityId: item.community_owner.id }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ textDecoration: "none" }}
                      >
                        <Text
                          fontSize="xs"
                          color="purple.500"
                          fontWeight="bold"
                          _hover={{ textDecoration: "underline" }}
                        >
                          {item.community_owner.name}
                        </Text>
                      </Link>
                    ) : (
                      <>
                        {effectiveDisplayOwnerId && (
                          <Link
                            to={
                              effectiveDisplayOwnerId === user?.id
                                ? "/profile"
                                : "/users/$userId"
                            }
                            params={
                              effectiveDisplayOwnerId === user?.id
                                ? {}
                                : { userId: effectiveDisplayOwnerId }
                            }
                            onClick={(e) => e.stopPropagation()}
                            style={{ textDecoration: "none" }}
                          >
                            <Text
                              fontSize="xs"
                              color="blue.500"
                              _hover={{ textDecoration: "underline" }}
                            >
                              {effectiveDisplayOwnerId === user?.id
                                ? "You"
                                : String(
                                    item.owner?.id === effectiveDisplayOwnerId
                                      ? (item.owner.full_name || item.owner.email)
                                      : "Owner",
                                  )}
                            </Text>
                          </Link>
                        )}
                        {!effectiveDisplayOwnerId && item.owner && (
                          <Link
                            to={
                              item.owner.id === user?.id
                                ? "/profile"
                                : "/users/$userId"
                            }
                            params={
                              item.owner.id === user?.id
                                ? {}
                                : { userId: item.owner.id }
                            }
                            onClick={(e) => e.stopPropagation()}
                            style={{ textDecoration: "none" }}
                          >
                            <Text
                              fontSize="xs"
                              color="blue.500"
                              _hover={{ textDecoration: "underline" }}
                            >
                              {item.owner.id === user?.id
                                ? "You"
                                : String(item.owner.full_name || item.owner.email)}
                            </Text>
                          </Link>
                        )}
                      </>
                    )}
                  </>
                )}
              </HStack>

              {isBook && extraData.isbn && (
                <Text fontSize="2xs" color="gray.400" mt={2} fontFamily="mono">
                  ISBN: {String(extraData.isbn)}
                </Text>
              )}
            </Box>
          </Card.Body>
        </Card.Root>
      </Box>
    </Box>
  )
}

export default ItemCard