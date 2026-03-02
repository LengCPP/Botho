import { useColorModeValue } from "@/components/ui/color-mode"
import {
  Box,
  Flex,
  HStack,
  Heading,
  Icon,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { FiStar } from "react-icons/fi"
import { Reviews } from "../../client"

const MyReviewsList = () => {
  const { data: reviews, isLoading } = useQuery({
    queryKey: ["reviews", "me"],
    queryFn: () => Reviews.readMyReviews(),
  })

  const borderColor = useColorModeValue("gray.200", "gray.700")

  if (isLoading) {
    return (
      <Flex justify="center" py={4}>
        <Spinner size="sm" />
      </Flex>
    )
  }

  if (!reviews || reviews.length === 0) {
    return (
      <Text
        fontSize="xs"
        color="gray.400"
        fontStyle="italic"
        textAlign="center"
      >
        You haven't received any reviews yet.
      </Text>
    )
  }

  return (
    <VStack align="stretch" gap={4} width="full">
      <Heading size="xs" textTransform="uppercase" color="gray.500">
        My Received Reviews
      </Heading>

      <VStack align="stretch" gap={3}>
        {reviews.map((review) => (
          <Box
            key={review.id}
            p={4}
            bg="white"
            _dark={{ bg: "gray.800" }}
            borderRadius="lg"
            borderWidth="1px"
            borderColor={borderColor}
            position="relative"
          >
            <VStack align="start" gap={2}>
              <HStack justify="space-between" width="full">
                <HStack gap={2}>
                  <Text fontSize="sm" fontWeight="bold">
                    {review.reviewer_name}
                  </Text>
                  <Text fontSize="xs" color="gray.400">
                    {format(new Date(review.created_at), "MMM d, yyyy")}
                  </Text>
                </HStack>
              </HStack>

              <HStack gap={1}>
                {[...Array(5)].map((_, i) => (
                  <Icon
                    key={i}
                    as={FiStar}
                    boxSize="12px"
                    color={i < review.rating ? "yellow.500" : "gray.200"}
                    fill={i < review.rating ? "yellow.500" : "transparent"}
                  />
                ))}
              </HStack>

              <Text
                fontSize="sm"
                color="gray.600"
                _dark={{ color: "gray.300" }}
              >
                {review.comment || "No comment provided."}
              </Text>

              {review.condition_grade && (
                <Box
                  mt={2}
                  p={2}
                  bg="gray.50"
                  _dark={{ bg: "gray.700/50" }}
                  borderRadius="md"
                  width="full"
                  borderLeftWidth="3px"
                  borderLeftColor="ui.hover"
                >
                  <HStack justify="space-between" mb={1}>
                    <Text fontSize="xs" fontWeight="bold" color="ui.hover">
                      ITEM CONDITION RATING
                    </Text>
                    <Text fontSize="xs" fontWeight="bold">
                      {review.condition_grade}/10
                    </Text>
                  </HStack>
                  {review.condition_notes && (
                    <Text fontSize="xs" color="gray.500" fontStyle="italic">
                      "{review.condition_notes}"
                    </Text>
                  )}
                </Box>
              )}
            </VStack>
          </Box>
        ))}
      </VStack>
    </VStack>
  )
}

export default MyReviewsList
