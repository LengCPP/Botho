import type { ItemPublic } from "@/client"
import { useColorModeValue } from "@/components/ui/color-mode"
import { memo } from "react"
import { getImageUrl } from "@/utils"
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react"
import { FiBook } from "react-icons/fi"

interface GroupCardProps {
  name: string
  type: string
  item_type?: string // book or general
  groups?: ItemPublic[][]
  count?: number
  sample_image?: string | null
  sample_images?: string[] // For efficient rendering from index
  onOpen: () => void
}

/* Reusable card for displaying item collections (subject, genre, etc.) */
function GroupCardBase({
  name,
  type,
  item_type,
  groups,
  count,
  sample_image,
  sample_images,
  onOpen,
}: GroupCardProps) {
  const bgColor = useColorModeValue("accent.50", "gray.800")
  const borderColor = useColorModeValue("accent.200", "gray.600")
  const textColor = useColorModeValue("gray.800", "gray.100")
  const placeholderBg = useColorModeValue("gray.200", "gray.600")
  const placeholderIconColor = useColorModeValue("gray.400", "gray.500")

  // Flatten and take first 5 for preview
  const allItems = groups?.flat() || []
  const previewItems = allItems.slice(0, 5)

  // Use sample_images if provided, otherwise fallback to previewItems images
  const imagesToShow = sample_images?.length
    ? sample_images.slice(0, 5)
    : (previewItems.map((item) => item.image_url).filter(Boolean) as string[])

  const displayCount = count !== undefined ? count : groups?.length || 0

  // Determine item type for labels
  const effectiveItemType =
    item_type ||
    groups?.[0]?.[0]?.item_type ||
    (type === "author" ? "book" : "general")
  const isBook = String(effectiveItemType).toLowerCase() === "book"

  const getDynamicBadgePhrase = () => {
    switch (type) {
      case "author":
        return isBook ? "Works by Author" : "Creator's Works"
      case "subject":
        return isBook ? "On this Subject" : "Related Topic"
      case "genre":
        return isBook ? "In this Genre" : "Genre Collection"
      case "category":
        return isBook ? "In this Category" : "Category Collection"
      case "ownership":
        return "Contributor's Collection"
      default:
        return `${type.toUpperCase()} COLLECTION`
    }
  }

  const getDynamicTitle = () => {
    if (name !== "Others") return name
    switch (type) {
      case "author":
        return isBook ? "Unknown Author" : "Unknown Creator"
      case "subject":
        return isBook ? "General Subjects" : "Various Topics"
      case "genre":
        return isBook ? "Miscellaneous Genres" : "Other Genres"
      case "category":
        return isBook ? "Uncategorized Books" : "Uncategorized Items"
      default:
        return `Other ${type}s`
    }
  }

  return (
    <Card.Root
      width="100%"
      maxW="300px"
      mx="auto"
      aspectRatio="1"
      variant="outline"
      bg={bgColor}
      borderColor={borderColor}
      overflow="hidden"
      transition="transform 0.2s"
      _hover={{ transform: "translateY(-4px)", boxShadow: "lg" }}
      cursor="pointer"
      onClick={onOpen}
    >
      <Card.Body p={{ base: 3, md: 4 }} as={Flex} direction="column" h="100%">
        <Flex justify="space-between" align="start" mb={4}>
          <VStack align="start" gap={1} flex={1}>
            <Text
              fontSize={{ base: "md", md: "lg", xl: "xl" }}
              fontWeight="bold"
              color={textColor}
              lineClamp={1}
            >
              {getDynamicTitle()}
            </Text>
            <Badge colorPalette="accent" variant="subtle" size="xs">
              {getDynamicBadgePhrase().toUpperCase()}
            </Badge>
          </VStack>
          <Badge variant="solid" colorPalette="teal" size="xs" ml={2}>
            {displayCount}{" "}
            {isBook
              ? displayCount === 1
                ? "Book"
                : "Books"
              : displayCount === 1
                ? "Item"
                : "Items"}
          </Badge>
        </Flex>

        {/* Layered books preview */}
        <Box
          flex={1}
          position="relative"
          mb={4}
          bg="blackAlpha.100"
          borderRadius="md"
          p={2}
          overflow="hidden"
        >
          {imagesToShow.length > 0 ? (
            <Flex justify="center" align="center" height="100%">
              {imagesToShow.map((imageUrl, index) => (
                <Box
                  key={imageUrl + index}
                  zIndex={5 - index}
                  height="100%"
                  aspectRatio="2/3"
                  flexShrink={0}
                  ml={index === 0 ? 0 : "-70%"}
                  transform={`rotate(${index * 10 - 20}deg)`}
                  transition="transform 0.2s"
                >
                  <Image
                    src={getImageUrl(imageUrl)}
                    alt={`${name} preview ${index}`}
                    height="100%"
                    width="100%"
                    aspectRatio="2/3"
                    objectFit="cover"
                    borderRadius="sm"
                    boxShadow="xl"
                    border="1px solid white"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = "none" }}
                  />
                </Box>
              ))}
            </Flex>
          ) : sample_image ? (
            <Flex justify="center" align="center" height="100%">
              <Box height="100%" aspectRatio="2/3">
                <Image
                  src={getImageUrl(sample_image)}
                  alt={name}
                  height="100%"
                  width="100%"
                  aspectRatio="2/3"
                  objectFit="cover"
                  borderRadius="sm"
                  boxShadow="xl"
                  border="1px solid white"
                  onError={(e) => { e.currentTarget.style.display = "none" }}
                />
              </Box>
            </Flex>
          ) : (
            <Flex justify="center" align="center" height="100%">
              {Array.from({ length: Math.min(Math.max(displayCount, 1), 3) }).map(
                (_, index) => (
                  <Box
                    key={index}
                    zIndex={3 - index}
                    height="100%"
                    aspectRatio="2/3"
                    flexShrink={0}
                    ml={index === 0 ? 0 : "-70%"}
                    transform={`rotate(${index * 10 - 10}deg)`}
                    transition="transform 0.2s"
                    bg={placeholderBg}
                    borderRadius="sm"
                    boxShadow="md"
                    border="1px solid"
                    borderColor={borderColor}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    {index === 0 && (
                      <FiBook size={20} color={placeholderIconColor} />
                    )}
                  </Box>
                ),
              )}
            </Flex>
          )}
        </Box>

        <Button
          variant="solid"
          colorPalette="accent"
          width="full"
          size="sm"
          mt="auto"
          flexShrink={0}
        >
          View Collection
        </Button>
      </Card.Body>
    </Card.Root>
  )
}

export const GroupCard = memo(GroupCardBase)