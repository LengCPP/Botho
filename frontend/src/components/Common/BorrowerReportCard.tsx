import { Users } from "@/client"
import { useColorModeValue } from "@/components/ui/color-mode"
import {
  Badge,
  Box,
  Button,
  HStack,
  Heading,
  Icon,
  Link,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { Link as RouterLink } from "@tanstack/react-router"
import { format } from "date-fns"
import { useState } from "react"
import { FiAward, FiChevronDown, FiChevronUp, FiStar, FiUser } from "react-icons/fi"

interface BorrowerReportCardProps {
  userId: string
}

const PAGE_SIZE = 5

const StarRating = ({ rating, size = "10px" }: { rating: number; size?: string }) => (
  <HStack gap={0.5}>
    {[...Array(5)].map((_, i) => (
      <Icon
        key={i}
        as={FiStar}
        boxSize={size}
        color={i < Math.round(rating) ? "yellow.500" : "gray.200"}
        fill={i < Math.round(rating) ? "yellow.500" : "transparent"}
      />
    ))}
  </HStack>
)

const BorrowerReportCard = ({ userId }: BorrowerReportCardProps) => {
  const [showReviews, setShowReviews] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const {
    data: reportCard,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["report-card", userId],
    queryFn: () => Users.readUserReportCard({ user_id: userId }),
  })

  const borderColor = useColorModeValue("gray.200", "gray.700")
  const reviewBg = useColorModeValue("gray.50", "gray.800")
  const reviewBorderColor = useColorModeValue("gray.100", "gray.700")

  if (isLoading) return <Spinner size="sm" />
  if (error || !reportCard)
    return (
      <Text fontSize="xs" color="red.500">
        Could not load report card
      </Text>
    )

  const { metrics, reviews, user } = reportCard

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null

  const visibleReviews = reviews.slice(0, visibleCount)
  const remaining = reviews.length - visibleCount

  return (
    <VStack align="stretch" gap={4} width="full">
      {/* Summary stats */}
      <Box p={3} borderWidth="1px" borderColor={borderColor} borderRadius="lg">
        <VStack align="start" gap={3}>
          <HStack justify="space-between" width="full">
            <HStack gap={2}>
              <Icon as={FiUser} boxSize={3} />
              <Link asChild fontWeight="bold" fontSize="sm" colorPalette="blue">
                <RouterLink to={`/users/${user.id}`}>
                  {user.full_name || user.email}
                </RouterLink>
              </Link>
            </HStack>
            <HStack gap={1}>
              <Text fontWeight="bold" fontSize="sm">
                {(metrics.honor_score ?? 0).toFixed(0)}
              </Text>
              <Icon as={FiAward} color="yellow.500" boxSize={3} />
            </HStack>
          </HStack>

          <HStack gap={3} width="full" wrap="wrap">
            <VStack align="start" gap={0} flex={1} minW="60px">
              <Text fontSize="3xs" color="gray.500" textTransform="uppercase">
                Reliability
              </Text>
              <Text fontSize="xs" fontWeight="semibold">
                {(metrics.reliability_rate ?? 0).toFixed(0)}%
              </Text>
            </VStack>
            <VStack align="start" gap={0} flex={1} minW="60px">
              <Text fontSize="3xs" color="gray.500" textTransform="uppercase">
                Reviews
              </Text>
              <Text fontSize="xs" fontWeight="semibold">
                {metrics.review_count}
              </Text>
            </VStack>
            <VStack align="start" gap={0} flex={1} minW="60px">
              <Text fontSize="3xs" color="gray.500" textTransform="uppercase">
                Returned
              </Text>
              <Text fontSize="xs" fontWeight="semibold">
                {metrics.returned_count ?? 0}
                <Text as="span" fontSize="3xs" color="gray.400" fontWeight="normal">
                  {" "}/ {metrics.total_borrows ?? 0}
                </Text>
              </Text>
            </VStack>
            <VStack align="start" gap={0} flex={1} minW="80px">
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

      {/* Reviews */}
      <Box>
        <HStack
          justify="space-between"
          cursor="pointer"
          onClick={() => setShowReviews((v) => !v)}
          _hover={{ opacity: 0.8 }}
          userSelect="none"
        >
          <HStack gap={2}>
            <Heading size="xs" textTransform="uppercase" color="gray.500">
              Peer Feedback
            </Heading>
            {reviews.length > 0 && (
              <Text fontSize="2xs" color="gray.400">
                ({reviews.length})
              </Text>
            )}
          </HStack>
          <HStack gap={2}>
            {avgRating !== null && (
              <HStack gap={1}>
                <StarRating rating={avgRating} size="9px" />
                <Text fontSize="2xs" color="gray.500" fontWeight="semibold">
                  {avgRating.toFixed(1)}
                </Text>
              </HStack>
            )}
            <Icon
              as={showReviews ? FiChevronUp : FiChevronDown}
              boxSize={3}
              color="gray.400"
            />
          </HStack>
        </HStack>

        {showReviews && (
          <Box mt={3}>
        {reviews.length === 0 ? (
          <Text fontSize="xs" color="gray.400" fontStyle="italic">
            No reviews yet for this user.
          </Text>
        ) : (
          <VStack align="stretch" gap={3}>
            {visibleReviews.map((review) => (
              <Box
                key={review.id}
                p={3}
                bg={reviewBg}
                borderRadius="md"
                borderWidth="1px"
                borderColor={reviewBorderColor}
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
                  <StarRating rating={review.rating} />
                  <Text fontSize="xs" color="inherit" opacity={0.85} lineHeight="short">
                    {review.comment || "No comment provided."}
                  </Text>
                  {review.condition_grade && (
                    <Box
                      mt={1}
                      p={1.5}
                      bg="white"
                      _dark={{ bg: "gray.900" }}
                      borderRadius="sm"
                      width="full"
                      borderLeftWidth="2px"
                      borderLeftColor="ui.hover"
                    >
                      <HStack justify="space-between">
                        <Text fontSize="3xs" fontWeight="bold" color="ui.hover">
                          ITEM CONDITION
                        </Text>
                        <Text fontSize="3xs" fontWeight="bold">
                          {review.condition_grade}/10
                        </Text>
                      </HStack>
                      {review.condition_notes && (
                        <Text
                          fontSize="3xs"
                          color="gray.500"
                          fontStyle="italic"
                        >
                          "{review.condition_notes}"
                        </Text>
                      )}
                    </Box>
                  )}
                </VStack>
              </Box>
            ))}

            {remaining > 0 && (
              <Button
                size="xs"
                variant="ghost"
                colorPalette="gray"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              >
                Show {Math.min(remaining, PAGE_SIZE)} more review
                {Math.min(remaining, PAGE_SIZE) !== 1 ? "s" : ""}
                {remaining > PAGE_SIZE ? ` (${remaining} remaining)` : ""}
              </Button>
            )}
            {visibleCount > PAGE_SIZE && (
              <Button
                size="xs"
                variant="ghost"
                colorPalette="gray"
                onClick={() => setVisibleCount(PAGE_SIZE)}
              >
                Show less
              </Button>
            )}
          </VStack>
        )}
          </Box>
        )}
      </Box>
    </VStack>
  )
}

export default BorrowerReportCard
