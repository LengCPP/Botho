import type { ItemPublic } from "@/client"
import useAuth from "@/hooks/useAuth"
import { getImageUrl } from "@/utils"
import { Badge, Box, Flex, HStack, Image, Text, VStack } from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"
import { FiBook, FiUser } from "react-icons/fi"

interface ItemListItemProps {
  item: ItemPublic | ItemPublic[]
}

export const ItemListItem = ({ item: itemProp }: ItemListItemProps) => {
  const { user } = useAuth()
  const items = Array.isArray(itemProp) ? itemProp : [itemProp]
  const item = items[0]
  const isBook = item.item_type === "book"
  const count = items.length

  const isOwner = item.owner_id === user?.id

  // Logic for destination
  //   - If community owner: /communities/$communityId
  //   - If user owner (self): /profile
  //   - If user owner (other): /users/$userId

  const primaryCommunity = item.community_owner || item.communities?.[0]

  let to = "/items"
  let params: any = {}
  let search: any = { q: item.title }

  if (primaryCommunity) {
    to = "/communities/$communityId"
    params = { communityId: primaryCommunity.id }
    search = { tab: "items", q: item.title }
  } else if (isOwner) {
    to = "/items"
    params = {}
    search = { q: item.title }
  } else {
    to = "/users/$userId"
    params = { userId: item.owner_id }
    search = { q: item.title }
  }

  return (
    <Link
      to={to}
      params={params}
      search={search}
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
              loading="lazy"
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
            <Badge
              size="sm"
              variant="subtle"
              colorPalette={isBook ? "blue" : "gray"}
            >
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
                {item.owner?.full_name ||
                  item.owner?.email ||
                  item.community_owner?.name ||
                  "Unknown"}
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
