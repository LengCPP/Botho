import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Icon,
  Image,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { FiAlertCircle, FiBook, FiUser } from "react-icons/fi"

import { ItemsService } from "@/client"
import { ItemActionsMenu } from "@/components/Common/ItemActionsMenu"
import ItemExtendedInfo from "@/components/Items/ItemExtendedInfo"
import { useColorModeValue } from "@/components/ui/color-mode"
import useAuth from "@/hooks/useAuth"
import { getImageUrl } from "@/utils"

export const Route = createFileRoute("/_layout/items/$itemId")({
  component: ItemDetail,
})

function ItemDetail() {
  const { itemId } = Route.useParams()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const cardBg = useColorModeValue("white", "gray.800")

  const { data: item, isLoading, error } = useQuery({
    queryKey: ["items", itemId],
    queryFn: () => ItemsService.readItem({ id: itemId }),
  })

  if (isLoading) {
    return (
      <Flex justify="center" align="center" minH="50vh">
        <Spinner size="xl" />
      </Flex>
    )
  }

  if (error || !item) {
    return (
      <Container maxW="container.md" pt={12}>
        <VStack gap={6} textAlign="center">
          <Icon as={FiAlertCircle} boxSize={12} color="red.500" />
          <Heading size="lg">Item Not Found</Heading>
          <Text color="gray.500">
            The item you are looking for does not exist or you do not have permission to view it.
          </Text>
          <Button onClick={() => navigate({ to: "/" })} variant="outline">
            Go Home
          </Button>
        </VStack>
      </Container>
    )
  }

  const isOwner = item.owner_id === currentUser?.id
  const isBook = item.item_type === "book"

  return (
    <Container maxW="container.lg" py={8}>
      <Box
        bg={cardBg}
        rounded="xl"
        shadow="sm"
        overflow="hidden"
        borderWidth="1px"
        borderColor="border.subtle"
      >
        <Flex direction={{ base: "column", md: "row" }}>
          {/* Image Section */}
          <Box
            w={{ base: "100%", md: "350px" }}
            bg="gray.100"
            _dark={{ bg: "gray.900" }}
            position="relative"
            minH="400px"
          >
            {item.image_url ? (
              <Image
                src={getImageUrl(item.image_url)}
                alt={item.title}
                objectFit="contain"
                w="100%"
                h="100%"
              />
            ) : (
              <Flex justify="center" align="center" h="100%" color="gray.400">
                <Icon as={FiBook} boxSize={16} />
              </Flex>
            )}
          </Box>

          {/* Details Section */}
          <Box p={8} flex={1}>
            <VStack align="start" gap={6}>
              <Flex justify="space-between" width="full" align="start">
                <Box>
                  <Heading size="2xl" mb={2}>{item.title}</Heading>
                  {item.author && (
                    <Text fontSize="xl" color="gray.500" fontStyle="italic">
                      by {item.author}
                    </Text>
                  )}
                </Box>
                {isOwner && (
                    <ItemActionsMenu item={item} />
                )}
              </Flex>

              <Text fontSize="md" color="gray.600" _dark={{ color: "gray.300" }} whiteSpace="pre-wrap">
                {item.description || "No description provided."}
              </Text>

              <VStack align="start" gap={3} w="full" pt={4}>
                 <Heading size="sm" borderBottomWidth="1px" w="full" pb={2}>Details</Heading>
                 <ItemExtendedInfo item={item} isOwner={isOwner} />
              </VStack>

              <Box pt={6} w="full">
                 <Heading size="sm" mb={4}>Owner</Heading>
                 <Flex align="center" gap={3} p={3} bg="bg.muted" rounded="lg">
                    <Icon as={FiUser} />
                    <VStack align="start" gap={0}>
                        <Text fontWeight="bold">
                            {item.owner?.full_name || item.owner?.email || item.community_owner?.name || "Unknown"}
                        </Text>
                         {item.community_owner && <Text fontSize="xs">Community Item</Text>}
                    </VStack>
                 </Flex>
              </Box>
            </VStack>
          </Box>
        </Flex>
      </Box>
    </Container>
  )
}
