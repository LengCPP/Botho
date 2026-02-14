import { Box, Card, SimpleGrid, Skeleton } from "@chakra-ui/react"

const PendingItems = () => (
  <Box mt={8}>
    <SimpleGrid columns={{ base: 2, sm: 3, md: 4 }} gap={{ base: 2, md: 6 }}>
      {[...Array(8)].map((_, index) => (
        <Box
          key={index}
          aspectRatio={2 / 3}
          width="100%"
          maxW="300px"
          mx="auto"
          minW="140px"
        >
          <Card.Root
            height="100%"
            overflow="hidden"
            borderRadius="lg"
            boxShadow="sm"
          >
            <Skeleton height="100%" />
          </Card.Root>
        </Box>
      ))}
    </SimpleGrid>
  </Box>
)

export default PendingItems
