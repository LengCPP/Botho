import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Separator,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FaThumbsDown, FaThumbsUp } from "react-icons/fa"
import { FiChevronDown } from "react-icons/fi"

import { type ItemPublic, ItemsService } from "@/client"
import { Rating } from "@/components/Common/Rating"
import { useColorModeValue } from "@/components/ui/color-mode"
import AddReview from "./AddReview"
import EditItem from "./EditItem"
import EditTags from "./EditTags"

interface ItemExtendedInfoProps {
  item: ItemPublic
  isOwner: boolean
  showAddReview?: boolean
}

const ItemExtendedInfo = ({
  item,
  isOwner,
  showAddReview = false,
}: ItemExtendedInfoProps) => {
  const [limit, setLimit] = useState(5)
  const itemInfo = (item.info as any) || {}
  const queryClient = useQueryClient()

  // Color mode values
  const cardBg = useColorModeValue("white", "gray.700")
  const borderColor = useColorModeValue("gray.200", "gray.600")

  const { data: reviewsData, isLoading: isLoadingReviews } = useQuery({
    queryKey: ["reviews", item.author, item.title],
    queryFn: () =>
      ItemsService.readReviews({
        author: item.author || "",
        title: item.title,
        limit: 20,
      }),
    enabled: !!item.author && !!item.title,
  })

  const voteMutation = useMutation({
    mutationFn: ({ reviewId, vote }: { reviewId: string; vote: number }) =>
      ItemsService.voteReview({ reviewId, vote }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["reviews", item.author, item.title],
      })
    },
  })

  const handleVote = (e: React.MouseEvent, reviewId: string, vote: number) => {
    e.stopPropagation()
    voteMutation.mutate({ reviewId, vote })
  }

  const sortedReviews =
    reviewsData?.data.sort(
      (a, b) =>
        (b.vote_score || 0) - (a.vote_score || 0) || b.rating - a.rating,
    ) || []
  const visibleReviews = sortedReviews.slice(0, limit)
  const hasMore = sortedReviews.length > limit

  const averageCondition = Number(
    itemInfo.average_condition_grade || itemInfo.grade || 0,
  )
  const physicalNotes = itemInfo.physical_notes || []

  return (
    <VStack
      align="stretch"
      gap={4}
      width="full"
      height="full"
      overflowY="auto"
      pb={4}
      css={{
        "&::-webkit-scrollbar": { display: "none" },
        scrollbarWidth: "none",
      }}
    >
      {/* 1. Classification */}
      {(item.work_metadata?.category ||
        item.work_metadata?.genre ||
        (item as any).category ||
        (item as any).genre) && (
        <Box>
          <Text
            fontSize="xs"
            fontWeight="bold"
            color="fg.muted"
            textTransform="uppercase"
            mb={2}
          >
            Classification
          </Text>
          <HStack gap={2} mb={3}>
            {(item.work_metadata?.category || (item as any).category) && (
              <Badge variant="solid" colorPalette="blue" size="sm">
                {item.work_metadata?.category || (item as any).category}
              </Badge>
            )}
            {(item.work_metadata?.genre || (item as any).genre) && (
              <Badge variant="outline" colorPalette="teal" size="sm">
                {item.work_metadata?.genre || (item as any).genre}
              </Badge>
            )}
          </HStack>
          <Separator />
        </Box>
      )}

      {/* 2. Description */}
      {(item.description || item.work_metadata?.description) && (
        <Box>
          <Text
            fontSize="xs"
            fontWeight="bold"
            color="fg.muted"
            textTransform="uppercase"
            mb={2}
          >
            Description
          </Text>
          <Text
            fontSize="sm"
            color="inherit"
            opacity={0.9}
            lineHeight="relaxed"
          >
            {item.description || item.work_metadata?.description}
          </Text>
          <Separator mt={3} />
        </Box>
      )}

      {/* 3. Subject */}
      {(item.work_metadata?.tags?.length || item.author) && (
        <Box>
          <HStack justify="space-between" mb={1}>
            <Text
              fontSize="xs"
              fontWeight="bold"
              color="fg.muted"
              textTransform="uppercase"
            >
              Subject
            </Text>
            {item.author && <EditTags item={item} />}
          </HStack>
          <Flex wrap="wrap" gap={1}>
            {item.work_metadata?.tags?.map((tag) => (
              <Badge key={tag} variant="subtle" colorPalette="cyan" size="sm">
                {tag}
              </Badge>
            ))}
            {(!item.work_metadata?.tags ||
              item.work_metadata.tags.length === 0) && (
              <Text fontSize="xs" color="fg.muted" fontStyle="italic">
                No subject tags.
              </Text>
            )}
          </Flex>
          <Separator mt={3} />
        </Box>
      )}

      {/* 2. Copy Specifics */}
      <Box>
        <Flex justify="space-between" align="center" mb={2}>
          <Text
            fontSize="xs"
            fontWeight="bold"
            color="fg.muted"
            textTransform="uppercase"
          >
            Copy Specifics
          </Text>
          {isOwner && (
            <EditItem
              item={item}
              onlyInfo={true}
              variant="ghost"
              size="xs"
              iconOnly={true}
            />
          )}
        </Flex>
        <VStack align="stretch" gap={3}>
          <HStack justify="space-between">
            <Text fontSize="sm">Averaged Condition Grade</Text>
            <Badge
              size="md"
              colorPalette={
                averageCondition >= 8
                  ? "green"
                  : averageCondition >= 5
                    ? "yellow"
                    : "red"
              }
            >
              {averageCondition > 0
                ? `${averageCondition.toFixed(1)}/10`
                : "N/A"}
            </Badge>
          </HStack>

          <Box>
            <Text fontSize="sm" fontWeight="medium" mb={1}>
              Physical Notes:
            </Text>
            {physicalNotes.length > 0 ? (
              <VStack align="stretch" gap={2}>
                {physicalNotes.map((note: any, idx: number) => (
                  <Box
                    key={idx}
                    p={2}
                    bg={cardBg}
                    borderRadius="sm"
                    borderWidth="1px"
                    borderColor={borderColor}
                  >
                    <Text fontSize="xs" fontStyle="italic" color="fg.muted">
                      "{note.note}"
                    </Text>
                  </Box>
                ))}
              </VStack>
            ) : (
              <Text fontSize="sm" fontStyle="italic" color="fg.muted">
                {itemInfo.physical_description || "No specific notes provided."}
              </Text>
            )}
          </Box>
        </VStack>
        <Separator mt={3} />
      </Box>

      {/* 3. Reviews */}
      <Box flex="1">
        <HStack justify="space-between" mb={2}>
          <Text
            fontSize="xs"
            fontWeight="bold"
            color="fg.muted"
            textTransform="uppercase"
          >
            Community Reviews
          </Text>
          <HStack>
            {showAddReview && item.author && <AddReview item={item} />}
            <Text fontSize="xs" color="fg.muted">
              {reviewsData?.count || 0} reviews
            </Text>
          </HStack>
        </HStack>

        {isLoadingReviews ? (
          <Flex justify="center" py={4}>
            <Spinner size="sm" />
          </Flex>
        ) : visibleReviews.length > 0 ? (
          <VStack align="stretch" gap={3}>
            {visibleReviews.map((review) => (
              <Box
                key={review.id}
                p={3}
                borderRadius="md"
                borderWidth="1px"
                borderColor={borderColor}
                bg={cardBg}
              >
                <Flex justify="space-between" align="start" mb={1}>
                  <Text fontSize="sm" fontWeight="bold">
                    {review.title}
                  </Text>
                  <Rating value={review.rating} size={12} />
                </Flex>
                <Text fontSize="xs" color="fg.muted" mb={2}>
                  by {review.user.full_name || "Unknown"}
                </Text>
                <Text fontSize="sm" mb={2}>
                  {review.comment}
                </Text>

                <HStack justify="flex-end" gap={1}>
                  <IconButton
                    aria-label="Upvote"
                    variant="ghost"
                    size="xs"
                    colorPalette={
                      review.current_user_vote === 1 ? "green" : "gray"
                    }
                    onClick={(e) => handleVote(e, review.id, 1)}
                  >
                    <FaThumbsUp />
                  </IconButton>
                  <Text
                    fontSize="xs"
                    fontWeight="bold"
                    color={
                      (review.vote_score || 0) > 0
                        ? "green.500"
                        : (review.vote_score || 0) < 0
                          ? "red.500"
                          : "fg.muted"
                    }
                  >
                    {review.vote_score || 0}
                  </Text>
                  <IconButton
                    aria-label="Downvote"
                    variant="ghost"
                    size="xs"
                    colorPalette={
                      review.current_user_vote === -1 ? "red" : "gray"
                    }
                    onClick={(e) => handleVote(e, review.id, -1)}
                  >
                    <FaThumbsDown />
                  </IconButton>
                </HStack>
              </Box>
            ))}

            {hasMore && (
              <Button
                size="xs"
                variant="ghost"
                width="full"
                onClick={(e) => {
                  e.stopPropagation()
                  setLimit((prev) => prev + 5)
                }}
              >
                View More <FiChevronDown />
              </Button>
            )}
          </VStack>
        ) : (
          <Text fontSize="sm" color="fg.muted" fontStyle="italic">
            No reviews yet.
          </Text>
        )}
      </Box>
    </VStack>
  )
}

export default ItemExtendedInfo
