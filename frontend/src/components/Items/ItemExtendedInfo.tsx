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
  useDisclosure,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FaThumbsDown, FaThumbsUp } from "react-icons/fa"
import { FiChevronDown } from "react-icons/fi"

import { type ItemPublic, ItemsService } from "@/client"
import { Rating } from "@/components/Common/Rating"
import { useColorModeValue } from "@/components/ui/color-mode"
import useCustomToast from "@/hooks/useCustomToast"
import AddReview from "./AddReview"
import EditItem from "./EditItem"
import EditTags from "./EditTags"

interface ItemExtendedInfoProps {
  item: ItemPublic
  isOwner: boolean
}

const ItemExtendedInfo = ({ item, isOwner }: ItemExtendedInfoProps) => {
  const [limit, setLimit] = useState(5)
  const itemInfo = (item.info as any) || {}
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()

  // Color mode values
  const cardBg = useColorModeValue("white", "gray.700")
  const borderColor = useColorModeValue("gray.200", "gray.600")

  const { data: reviewsData, isLoading: isLoadingReviews } = useQuery({
    queryKey: ["reviews", item.author, item.title],
    queryFn: () =>
      ItemsService.readReviews({
        author: item.author || "",
        title: item.title,
        limit: 20, // Fetch more to handle client-side sort/limit for now or mock
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

  // Mock sort by "top" since backend doesn't support voting yet
  const sortedReviews =
    reviewsData?.data.sort(
      (a, b) => (b.vote_score || 0) - (a.vote_score || 0) || b.rating - a.rating,
    ) || []
  const visibleReviews = sortedReviews.slice(0, limit)
  const hasMore = sortedReviews.length > limit

  return (
    <VStack
      align="stretch"
      gap={4}
      width="full"
      height="full"
      overflowY="auto"
      pb={4}
    >
      {/* 1. Tags */}
      {(item.work_metadata?.tags?.length || item.author) && (
        <Box>
          <HStack justify="space-between" mb={1}>
            <Text
              fontSize="xs"
              fontWeight="bold"
              color="fg.muted"
              textTransform="uppercase"
            >
              Tags
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
                No tags.
              </Text>
            )}
          </Flex>
          <Separator mt={3} />
        </Box>
      )}

      {/* 2. Copy Specifics */}
      <Box>
        <Text
          fontSize="xs"
          fontWeight="bold"
          color="fg.muted"
          mb={2}
          textTransform="uppercase"
        >
          Copy Specifics
        </Text>
        <VStack align="stretch" gap={2}>
          <HStack justify="space-between">
            <Text fontSize="sm">Condition Grade</Text>
            <Badge
              size="md"
              colorPalette={
                itemInfo.grade >= 8
                  ? "green"
                  : itemInfo.grade >= 5
                    ? "yellow"
                    : "red"
              }
            >
              {itemInfo.grade ? `${itemInfo.grade}/10` : "N/A"}
            </Badge>
          </HStack>
          <Box>
            <Text fontSize="sm" fontWeight="medium">
              Notes:
            </Text>
            <Text fontSize="sm" fontStyle="italic" color="fg.muted">
              {itemInfo.physical_description || "No specific notes provided."}
            </Text>
          </Box>
        </VStack>
        {isOwner && (
          <Box mt={2}>
            <EditItem
              item={item}
              width="full"
              justifyContent="flex-start"
              onlyInfo={true}
            />
          </Box>
        )}
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
            {item.author && <AddReview item={item} />}
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
