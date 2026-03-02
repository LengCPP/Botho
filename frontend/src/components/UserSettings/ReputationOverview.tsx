import { Reviews, Users } from "@/client"
import { useColorModeValue } from "@/components/ui/color-mode"
import {
  Badge,
  Box,
  Flex,
  HStack,
  Heading,
  Icon,
  Separator,
  SimpleGrid,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { FiAlertCircle, FiAward, FiStar, FiTrendingUp } from "react-icons/fi"

const ReputationOverview = () => {
  const { data: reputation, isLoading } = useQuery({
    queryKey: ["reputation", "me"],
    queryFn: () => Users.readUserReputationMe(),
  })

  const { data: reviews } = useQuery({
    queryKey: ["reviews", "me"],
    queryFn: () => Reviews.readMyReviews(),
  })

  const avgRating =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null

  const bgColor = useColorModeValue("main.50", "gray.800")
  const borderColor = useColorModeValue("main.200", "gray.700")
  const cardBg = useColorModeValue("white", "gray.900")

  if (isLoading) {
    return (
      <Flex justify="center" py={10}>
        <Spinner color="ui.primary" />
      </Flex>
    )
  }

  if (!reputation) return null

  const honorTier =
    reputation.honor_score >= 90
      ? "Pillar of Community"
      : reputation.honor_score >= 75
        ? "Trusted Member"
        : reputation.honor_score >= 50
          ? "Reliable Neighbor"
          : reputation.honor_score >= 25
            ? "Member"
            : "Novice"

  return (
    <VStack gap={6} align="stretch" width="full">
      {/* Trust Overview Header */}
      <Box
        p={6}
        borderRadius="xl"
        bg={bgColor}
        borderWidth="1px"
        borderColor={borderColor}
      >
        <HStack justify="space-between" align="center" flexWrap="wrap" gap={4}>
          <VStack align="start" gap={1}>
            <Heading size="md" color="ui.primary">
              Your Community Standing
            </Heading>
            <HStack>
              <Badge
                colorPalette="main"
                variant="solid"
                px={3}
                py={1}
                borderRadius="full"
              >
                {honorTier}
              </Badge>
              {reputation.is_delinquent && (
                <Badge
                  colorPalette="red"
                  variant="solid"
                  px={3}
                  py={1}
                  borderRadius="full"
                >
                  Delinquent
                </Badge>
              )}
            </HStack>
          </VStack>

          <HStack gap={8}>
            <VStack gap={0}>
              <Text
                fontSize="2xs"
                fontWeight="bold"
                color="gray.500"
                textTransform="uppercase"
              >
                Honor Score
              </Text>
              <HStack gap={1}>
                <Text fontSize="2xl" fontWeight="bold">
                  {(reputation.honor_score ?? 0).toFixed(0)}
                </Text>
                <Icon as={FiAward} color="yellow.500" />
              </HStack>
            </VStack>
            <VStack gap={0}>
              <Text
                fontSize="2xs"
                fontWeight="bold"
                color="gray.500"
                textTransform="uppercase"
              >
                Reliability
              </Text>
              <HStack gap={1}>
                <Text fontSize="2xl" fontWeight="bold">
                  {(reputation.reliability_rate ?? 0).toFixed(0)}%
                </Text>
                <Icon as={FiTrendingUp} color="green.500" />
              </HStack>
            </VStack>
          </HStack>
        </HStack>

        <Box mt={4} pt={4} borderTopWidth="1px" borderColor={borderColor}>
          <VStack align="start" gap={2}>
            <Text fontSize="xs" color="gray.500">
              <strong>Honor Score Components:</strong>
            </Text>
            <SimpleGrid columns={{ base: 1, md: 2 }} gap={2} width="full">
              <Text fontSize="2xs" color="gray.500">
                • <strong>Pooling:</strong> Sharing items with communities (+15
                max)
              </Text>
              <Text fontSize="2xs" color="gray.500">
                • <strong>Reviews:</strong> Reviewing items you borrow (+15 max)
              </Text>
              <Text fontSize="2xs" color="gray.500">
                • <strong>Responsiveness:</strong> Approving loan requests (+10
                max)
              </Text>
              <Text fontSize="2xs" color="gray.500">
                • <strong>Contributions:</strong> Improving item metadata (+10
                max)
              </Text>
              <Text fontSize="2xs" color="gray.500">
                • <strong>Reputation:</strong> Ratings from lenders (+25 max)
              </Text>
              <Text fontSize="2xs" color="gray.500">
                • <strong>Punctuality:</strong> Returning items on time (+25
                max)
              </Text>
            </SimpleGrid>
            <Text fontSize="2xs" color="red.500" mt={1}>
              <strong>Note:</strong> Overdue items and unrecoverable defaults
              significantly penalize your score.
            </Text>
          </VStack>
        </Box>
      </Box>

      {/* Sentiment Mirror Card */}
      <Box
        p={6}
        borderRadius="xl"
        bg={cardBg}
        borderWidth="1px"
        borderColor={borderColor}
        boxShadow="sm"
      >
        <VStack align="start" gap={4}>
          <HStack gap={2}>
            <Icon as={FiAward} color="ui.primary" />
            <Heading size="xs">The Sentiment Mirror</Heading>
          </HStack>

          {avgRating !== null && (
            <HStack gap={3} align="center">
              <HStack gap={1}>
                {[...Array(5)].map((_, i) => (
                  <Icon
                    key={i}
                    as={FiStar}
                    boxSize="16px"
                    color={i < Math.round(avgRating) ? "yellow.400" : "gray.300"}
                    fill={i < Math.round(avgRating) ? "yellow.400" : "transparent"}
                  />
                ))}
              </HStack>
              <Text fontSize="sm" fontWeight="bold">
                {avgRating.toFixed(1)}
              </Text>
              <Text fontSize="xs" color="gray.500">
                ({reviews!.length} review{reviews!.length !== 1 ? "s" : ""})
              </Text>
            </HStack>
          )}

          <Text
            fontSize="sm"
            fontStyle="italic"
            color="gray.600"
            lineHeight="tall"
          >
            {(reputation as any).ai_honor_summary ||
              "We're still gathering feedback to generate your personal summary. Keep engaging with the community to see your mirror!"}
          </Text>

          {(reputation as any).ai_improvement_tips &&
            (reputation as any).ai_improvement_tips.length > 0 && (
              <>
                <Separator />
                <VStack align="start" gap={2} width="full">
                  <HStack gap={2}>
                    <Icon as={FiAlertCircle} color="ui.hover" />
                    <Text fontSize="xs" fontWeight="bold">
                      Path to Growth
                    </Text>
                  </HStack>
                  {(reputation as any).ai_improvement_tips.map(
                    (tip: string, idx: number) => (
                      <HStack
                        key={idx}
                        align="start"
                        gap={3}
                        p={2}
                        bg="gray.50"
                        borderRadius="md"
                        width="full"
                      >
                        <Text fontSize="xs" color="gray.700">
                          • {tip}
                        </Text>
                      </HStack>
                    ),
                  )}
                </VStack>
              </>
            )}
        </VStack>
      </Box>

      <Text fontSize="2xs" color="gray.400" textAlign="center" px={10}>
        This information is synthesized by AI based on anonymized community
        reviews. Raw comments are never shown to you to prevent retaliation and
        maintain a safe environment.
      </Text>
    </VStack>
  )
}

export default ReputationOverview
