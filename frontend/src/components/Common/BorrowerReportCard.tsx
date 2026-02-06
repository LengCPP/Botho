import { UsersService } from "@/client"
import { useColorModeValue } from "@/components/ui/color-mode"
import {
  Badge,
  Box,
  Flex,
  HStack,
  Heading,
  Icon,
  Separator,
  Spinner,
  Text,
  Timeline,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import {
  FiCheckCircle,
  FiClock,
  FiMessageSquare,
  FiStar,
  FiUser,
} from "react-icons/fi"

interface BorrowerReportCardProps {
  userId: string
}

const BorrowerReportCard = ({ userId }: BorrowerReportCardProps) => {
  const {
    data: reportCard,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["report-card", userId],
    queryFn: () => UsersService.readUserReportCard({ userId }),
  })

  const borderColor = useColorModeValue("gray.200", "gray.700")
  const mutedColor = useColorModeValue("gray.500", "gray.400")

  if (isLoading) return <Spinner size="sm" />
  if (error || !reportCard)
    return (
      <Text fontSize="xs" color="red.500">
        Could not load report card
      </Text>
    )

  const { metrics, reviews, user } = reportCard

  return (
    <VStack align="stretch" gap={4} width="full">
      <Box p={4} borderWidth="1px" borderColor={borderColor} borderRadius="lg">
        <VStack align="start" gap={3}>
          <HStack justify="space-between" width="full">
            <HStack gap={2}>
              <Icon as={FiUser} />
              <Text fontWeight="bold" fontSize="sm">
                {user.full_name || user.email}
              </Text>
            </HStack>
            <HStack gap={1}>
              <Text fontWeight="bold" fontSize="sm">
                {metrics.honor_score.toFixed(1)}
              </Text>
              <Icon as={FiStar} color="yellow.500" />
            </HStack>
          </HStack>

          <HStack gap={4} width="full">
            <VStack align="start" gap={0} flex={1}>
              <Text fontSize="3xs" color="gray.500" textTransform="uppercase">
                Reliability
              </Text>
              <Text fontSize="xs" fontWeight="semibold">
                {metrics.reliability_rate.toFixed(0)}%
              </Text>
            </VStack>
            <VStack align="start" gap={0} flex={1}>
              <Text fontSize="3xs" color="gray.500" textTransform="uppercase">
                Reviews
              </Text>
              <Text fontSize="xs" fontWeight="semibold">
                {metrics.review_count}
              </Text>
            </VStack>
            <VStack align="start" gap={0} flex={1}>
              <Text fontSize="3xs" color="gray.500" textTransform="uppercase">
                Status
              </Text>
              <Badge
                size="xs"
                colorPalette={metrics.is_delinquent ? "red" : "green"}
              >
                {metrics.is_delinquent ? "Delinquent" : "Good Standing"}
              </Badge>
            </VStack>
          </HStack>
        </VStack>
      </Box>

      <Box>
        <Heading size="3xs" mb={3} textTransform="uppercase" color="gray.500">
          Recent Peer Feedback
        </Heading>
        {reviews.length === 0 ? (
          <Text fontSize="xs" color="gray.400" fontStyle="italic">
            No reviews yet for this user.
          </Text>
        ) : (
          <VStack align="stretch" gap={3}>
            {reviews.map((review) => (
              <Box
                key={review.id}
                p={3}
                bg="gray.50"
                borderRadius="md"
                borderWidth="1px"
                borderColor="gray.100"
              >
                <VStack align="start" gap={1}>
                  <HStack justify="space-between" width="full">
                    <Text fontSize="2xs" fontWeight="bold">
                      {review.reviewer_name}
                    </Text>
                    <Text fontSize="3xs" color="gray.400">
                      {format(new Date(review.created_at), "MMM d, yyyy")}
                    </Text>
                  </HStack>
                  <HStack gap={1} mb={1}>
                    {[...Array(5)].map((_, i) => (
                      <Icon
                        key={i}
                        as={FiStar}
                        boxSize="8px"
                        color={i < review.rating ? "yellow.500" : "gray.200"}
                        fill={i < review.rating ? "yellow.500" : "transparent"}
                      />
                    ))}
                  </HStack>
                  <Text fontSize="xs" color="gray.700" lineHeight="short">
                    {review.comment || "No comment provided."}
                  </Text>
                </VStack>
              </Box>
            ))}
          </VStack>
        )}
      </Box>
    </VStack>
  )
}

export default BorrowerReportCard
