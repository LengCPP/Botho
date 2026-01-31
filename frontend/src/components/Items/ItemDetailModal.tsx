import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Heading,
  Input,
  Separator,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FaStar } from "react-icons/fa"

import { type ItemPublic, ItemsService } from "@/client"
import { useColorModeValue } from "@/components/ui/color-mode"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"

interface ItemDetailModalProps {
  item: ItemPublic | null
  isOpen: boolean
  onClose: () => void
}

function ReviewSection({ author, title }: { author: string; title: string }) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState("")
  const { user: currentUser } = useAuth()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const queryClient = useQueryClient()

  const { data: reviews, isLoading } = useQuery({
    queryKey: ["itemReviews", author, title],
    queryFn: () => ItemsService.readReviews({ author, title }),
  })

  const mutation = useMutation({
    mutationFn: () =>
      ItemsService.createReview({
        requestBody: { author, title, rating, comment },
      }),
    onSuccess: () => {
      showSuccessToast("Review submitted!")
      setComment("")
      queryClient.invalidateQueries({
        queryKey: ["itemReviews", author, title],
      })
      queryClient.invalidateQueries({
        queryKey: ["workMetadata", author, title],
      })
    },
    onError: () => showErrorToast("Failed to submit review"),
  })

  return (
    <VStack align="stretch" gap={4} width="full" mt={6}>
      <Heading size="md">Reviews</Heading>

      {currentUser && (
        <Box p={4} borderWidth="1px" rounded="md" bg="bg.muted">
          <Text fontWeight="bold" mb={2}>
            Write a Review
          </Text>
          <VStack align="stretch" gap={3}>
            <HStack>
              <Text fontSize="sm">Rating:</Text>
              {[1, 2, 3, 4, 5].map((num) => (
                <FaStar
                  key={num}
                  cursor="pointer"
                  color={num <= rating ? "#fb6635" : "gray"}
                  onClick={() => setRating(num)}
                />
              ))}
            </HStack>
            <Field label="Comment">
              <Textarea
                placeholder="What did you think of the content?"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                size="sm"
              />
            </Field>
            <Button
              size="sm"
              colorPalette="accent"
              alignSelf="flex-end"
              onClick={() => mutation.mutate()}
              loading={mutation.isPending}
            >
              Submit Review
            </Button>
          </VStack>
        </Box>
      )}

      <VStack align="stretch" gap={3}>
        {isLoading ? (
          <Text fontSize="sm">Loading reviews...</Text>
        ) : reviews?.data.length === 0 ? (
          <Text fontSize="sm" color="fg.muted" fontStyle="italic">
            No reviews yet.
          </Text>
        ) : (
          reviews?.data.map((rev) => (
            <Box key={rev.id} p={3} borderWidth="1px" rounded="md">
              <Flex justify="space-between" align="center" mb={1}>
                <Text fontWeight="bold" fontSize="xs">
                  {rev.user.full_name || rev.user.email}
                </Text>
                <HStack gap={1}>
                  {[1, 2, 3, 4, 5].map((num) => (
                    <FaStar
                      key={num}
                      size="10px"
                      color={num <= rev.rating ? "#fb6635" : "gray"}
                    />
                  ))}
                </HStack>
              </Flex>
              <Text fontSize="sm">{rev.comment}</Text>
              <Text fontSize="2xs" color="fg.subtle" mt={1}>
                {new Date(rev.created_at).toLocaleDateString()}
              </Text>
            </Box>
          ))
        )}
      </VStack>
    </VStack>
  )
}

export const ItemDetailModal = ({
  item,
  isOpen,
  onClose,
}: ItemDetailModalProps) => {
  if (!item) return null

  const isBook = item.item_type === "book"
  const extraData = (item.extra_data as any) || {}
  const info = (item.info as any) || {}
  const workMeta = item.work_metadata

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={(e) => !e.open && onClose()}
      size={{ base: "full", md: "xl" }}
      placement="center"
      scrollBehavior="inside"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.title}</DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger />
        <DialogBody pb={6}>
          <VStack align="start" gap={4} width="full">
            <HStack gap={2} wrap="wrap">
              <Badge colorPalette="teal" variant="solid">
                {String(item.item_type || "General")}
              </Badge>
              {isBook && extraData.category && (
                <Badge variant="outline" colorPalette="main">
                  {extraData.category}
                </Badge>
              )}
              {isBook && extraData.genre && (
                <Badge variant="outline" colorPalette="purple">
                  {extraData.genre}
                </Badge>
              )}
            </HStack>

            {isBook && item.author && (
              <Text fontSize="md" fontWeight="bold">
                Author:{" "}
                <Text as="span" fontWeight="normal" fontStyle="italic">
                  {item.author}
                </Text>
              </Text>
            )}

            {workMeta && workMeta.review_count > 0 && (
              <HStack gap={1} align="center">
                <FaStar color="#fb6635" />
                <Text fontWeight="bold">
                  {workMeta.average_rating.toFixed(1)}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  ({workMeta.review_count} reviews)
                </Text>
              </HStack>
            )}

            <Box width="full">
              <Heading size="sm" mb={2}>
                Description
              </Heading>
              <Text fontSize="md" whiteSpace="pre-wrap" color="fg.muted">
                {item.description || "No description provided."}
              </Text>
            </Box>

            {isBook && workMeta?.tags && workMeta.tags.length > 0 && (
              <Box width="full">
                <Text
                  fontSize="xs"
                  fontWeight="bold"
                  color="ui.hover"
                  textTransform="uppercase"
                  mb={1}
                >
                  Subjects / Tags
                </Text>
                <HStack gap={2} wrap="wrap">
                  {workMeta.tags.map((tag: string) => (
                    <Badge
                      key={tag}
                      size="xs"
                      colorPalette="orange"
                      variant="outline"
                    >
                      {tag}
                    </Badge>
                  ))}
                </HStack>
              </Box>
            )}

            <Separator />

            <Box width="full">
              <Heading size="sm" mb={3} color="ui.hover">
                This Copy Details
              </Heading>
              <VStack align="start" gap={3}>
                <HStack>
                  <Text fontSize="xs" fontWeight="bold" color="fg.subtle">
                    CONDITION GRADE:
                  </Text>
                  <Badge
                    colorPalette={
                      Number(info.grade) > 7
                        ? "green"
                        : Number(info.grade) > 4
                          ? "yellow"
                          : "red"
                    }
                  >
                    {info.grade || "?"}/10
                  </Badge>
                </HStack>

                {info.physical_description && (
                  <Box>
                    <Text fontSize="xs" fontWeight="bold" color="fg.subtle">
                      OWNER DESCRIPTION:
                    </Text>
                    <Text fontSize="sm">{info.physical_description}</Text>
                  </Box>
                )}

                {!info.physical_description && (
                  <Text fontSize="xs" color="fg.muted" fontStyle="italic">
                    No extra description provided by owner.
                  </Text>
                )}
              </VStack>
            </Box>

            {isBook && extraData.isbn && (
              <Text fontSize="2xs" color="fg.subtle" fontFamily="mono" mt={2}>
                ISBN: {String(extraData.isbn)}
              </Text>
            )}

            <Separator />

            {isBook && item.author && (
              <ReviewSection author={item.author} title={item.title} />
            )}
          </VStack>
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  )
}
