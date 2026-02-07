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
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { FiAlertCircle, FiAward, FiStar, FiTrendingUp } from "react-icons/fi"
import MyReviewsList from "./MyReviewsList"

const ReputationDashboard = () => {
  const { data: reputation, isLoading } = useQuery({
    queryKey: ["reputation", "me"],
    queryFn: () => UsersService.readUserReputationMe(),
  })

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
    reputation.honor_score >= 4.5
      ? "Pillar of Community"
      : reputation.honor_score >= 3.5
        ? "Trusted Member"
        : reputation.honor_score >= 2.0
          ? "Reliable Neighbor"
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
                  {(reputation.honor_score).toFixed(0)}
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
                  {reputation.reliability_rate.toFixed(0)}%
                </Text>
                <Icon as={FiTrendingUp} color="green.500" />
              </HStack>
            </VStack>
          </HStack>
        </HStack>

        <Box mt={4} pt={4} borderTopWidth="1px" borderColor={borderColor}>
          <Text fontSize="xs" color="gray.500">
            <strong>How to improve:</strong> Fulfill loan requests promptly,
            return items on time, and earn positive reviews to boost your Honor
            Score.
          </Text>
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

          <Text
            fontSize="sm"
            fontStyle="italic"
            color="gray.600"
            lineHeight="tall"
          >
            {reputation.ai_honor_summary ||
              "We're still gathering feedback to generate your personal summary. Keep engaging with the community to see your mirror!"}
          </Text>

          {reputation.ai_improvement_tips &&
            reputation.ai_improvement_tips.length > 0 && (
              <>
                <Separator />
                <VStack align="start" gap={2} width="full">
                  <HStack gap={2}>
                    <Icon as={FiAlertCircle} color="ui.hover" />
                    <Text fontSize="xs" fontWeight="bold">
                      Path to Growth
                    </Text>
                  </HStack>
                  {reputation.ai_improvement_tips.map((tip, idx) => (
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
                  ))}
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

      <MyReviewsList />
    </VStack>
  )
}

export default ReputationDashboard
