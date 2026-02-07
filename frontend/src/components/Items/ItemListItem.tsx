import { type ItemPublic } from "@/client"
import { getImageUrl } from "@/utils"
import {
  Badge,
  Box,
  Flex,
  HStack,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"
import { FiBook, FiUser } from "react-icons/fi"

interface ItemListItemProps {
  item: ItemPublic | ItemPublic[]
}

export const ItemListItem = ({ item: itemProp }: ItemListItemProps) => {
  const items = Array.isArray(itemProp) ? itemProp : [itemProp]
  const item = items[0]
  const isBook = item.item_type === "book"
  const count = items.length

  return (
    <Link
      to="/items/$itemId"
      params={{ itemId: item.id }}
      style={{ textDecoration: "none", width: "100%" }}
    >
      <Flex
        p={3}
        bg="bg.panel"
        borderRadius="lg"
        border="1px solid"
        borderColor="border.subtle"
        _hover={{ bg: "bg.muted", borderColor: "ui.main" }}
        transition="all 0.2s"
        gap={4}
        align="center"
      >
        {/* Thumbnail */}
        <Box
          width="50px"
          height="70px"
          flexShrink={0}
          bg="gray.100"
          _dark={{ bg: "gray.700" }}
          borderRadius="md"
          overflow="hidden"
          position="relative"
        >
          {item.image_url ? (
            <Image
              src={getImageUrl(item.image_url)}
              alt={item.title}
              width="100%"
              height="100%"
              objectFit="cover"
            />
          ) : (
            <Flex
              width="100%"
              height="100%"
              justify="center"
              align="center"
              color="fg.muted"
            >
              <FiBook />
            </Flex>
          )}
          {count > 1 && (
            <Badge
              position="absolute"
              bottom={0}
              right={0}
              size="xs"
              colorPalette="accent"
              variant="solid"
              borderTopLeftRadius="md"
            >
              {count}
            </Badge>
          )}
        </Box>

        {/* Content */}
        <VStack align="start" gap={1} flex={1} overflow="hidden">
          <HStack width="full" justify="space-between">
            <Text fontWeight="bold" fontSize="sm" lineClamp={1}>
              {item.title}
            </Text>
            <Badge size="sm" variant="subtle" colorPalette={isBook ? "blue" : "gray"}>
              {item.item_type || "General"}
            </Badge>
          </HStack>
          
          <Text fontSize="xs" color="fg.muted" lineClamp={1}>
            {item.author ? `by ${item.author}` : "Unknown Author"}
          </Text>

          <HStack gap={2} fontSize="xs" color="fg.subtle">
             <HStack gap={1}>
                <FiUser />
                <Text>
                  {item.owner?.full_name || item.owner?.email || item.community_owner?.name || "Unknown"}
                </Text>
             </HStack>
             <Text>•</Text>
             <Text>{new Date(item.created_at).toLocaleDateString()}</Text>
          </HStack>
        </VStack>
      </Flex>
    </Link>
  )
}