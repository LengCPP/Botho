import type { ItemPublic } from "@/client"
import { useColorModeValue } from "@/components/ui/color-mode"
import { getImageUrl } from "@/utils"
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  HStack,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react"

interface GroupCardProps {
  name: string
  type: string
  groups: ItemPublic[][]
  onOpen: () => void
}

/* Reusable card for displaying item collections (subject, genre, etc.) */
export function GroupCard({ name, type, groups, onOpen }: GroupCardProps) {
  const bgColor = useColorModeValue("accent.50", "gray.800")
  const borderColor = useColorModeValue("accent.200", "gray.600")
  const textColor = useColorModeValue("gray.800", "gray.100")

  // Flatten and take first 5 for preview
  const allItems = groups.flat()
  const previewItems = allItems.slice(0, 5)

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
              {name}
            </Text>
            <Badge colorPalette="accent" variant="subtle" size="xs">
              {(type || "subject").toUpperCase()} COLLECTION
            </Badge>
          </VStack>
          <Badge variant="solid" colorPalette="teal" size="xs" ml={2}>
            {groups.length}{" "}
            {groups[0][0].item_type === "book"
              ? groups.length === 1
                ? "Book"
                : "Books"
              : groups.length === 1
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
          {previewItems.length > 0 ? (
            <Flex justify="center" align="center" height="100%">
              {previewItems.map((item, index) => (
                <Box
                  key={item.id}
                  zIndex={5 - index}
                  height="100%"
                  aspectRatio="2/3"
                  flexShrink={0}
                  ml={index === 0 ? 0 : "-70%"}
                  transform={`rotate(${index * 10 - 20}deg)`}
                  transition="transform 0.2s"
                >
                  {item.image_url ? (
                    <Image
                      src={getImageUrl(item.image_url)}
                      alt={item.title}
                      height="100%"
                      width="100%"
                      aspectRatio="2/3"
                      objectFit="cover"
                      borderRadius="sm"
                      boxShadow="xl"
                      border="1px solid white"
                      loading="lazy"
                    />
                  ) : (
                    <Box
                      height="100%"
                      width="100%"
                      aspectRatio="2/3"
                      bg="gray.400"
                      borderRadius="sm"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      border="1px solid white"
                      p={1}
                    >
                      <Text
                        fontSize="8px"
                        fontWeight="bold"
                        textAlign="center"
                        color="white"
                        lineClamp={3}
                      >
                        {item.title}
                      </Text>
                    </Box>
                  )}
                </Box>
              ))}
            </Flex>
          ) : (
            <Flex height="100%" align="center" justify="center">
              <Text fontSize="sm" color="gray.500" fontStyle="italic">
                Empty
              </Text>
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
