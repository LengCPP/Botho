import { Badge, Box, Button, Flex, Text, VStack } from "@chakra-ui/react"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { FiPackage } from "react-icons/fi"

interface AvailableItem {
  item_id: string
  item_title: string
}

export const ItemAvailableBanner = () => {
  const [queue, setQueue] = useState<Array<AvailableItem>>([])
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail
      if (msg.notification_type === "ITEM_AVAILABLE" && msg.item_id) {
        setQueue((prev) => [
          ...prev,
          { item_id: msg.item_id, item_title: msg.item_title },
        ])
      }
    }
    window.addEventListener("websocket-message", handler)
    return () => window.removeEventListener("websocket-message", handler)
  }, [])

  const current = queue[0]
  if (!current) return null

  const handleDismiss = () => setQueue((prev) => prev.slice(1))
  const handleRequest = () => {
    navigate({ to: "/items" })
    setQueue((prev) => prev.slice(1))
  }

  return (
    <Box
      bg="teal.600"
      color="white"
      py={3}
      px={4}
      position="sticky"
      top="52px"
      zIndex="docked"
      boxShadow="lg"
    >
      <Flex
        maxW="container.xl"
        mx="auto"
        align="center"
        justify="space-between"
        gap={4}
        direction={{ base: "column", sm: "row" }}
      >
        <Flex align="center" gap={3}>
          <Box as={FiPackage} boxSize={5} flexShrink={0} />
          <VStack align="start" gap={0}>
            <Text fontWeight="bold" fontSize="sm">
              Item Now Available!
            </Text>
            <Text fontSize="xs" opacity={0.9}>
              "{current.item_title}" is now available to borrow.
            </Text>
          </VStack>
          {queue.length > 1 && (
            <Badge bg="whiteAlpha.300" color="white" borderRadius="full">
              {queue.length}
            </Badge>
          )}
        </Flex>
        <Flex gap={2} flexShrink={0}>
          <Button
            size="xs"
            bg="whiteAlpha.300"
            color="white"
            _hover={{ bg: "whiteAlpha.400" }}
            onClick={handleRequest}
          >
            Request Item
          </Button>
          <Button
            size="xs"
            variant="ghost"
            color="white"
            _hover={{ bg: "whiteAlpha.200" }}
            onClick={handleDismiss}
          >
            Dismiss
          </Button>
        </Flex>
      </Flex>
    </Box>
  )
}
