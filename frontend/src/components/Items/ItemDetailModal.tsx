import {
  Badge,
  Box,
  Flex,
  HStack,
  Heading,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { FaStar } from "react-icons/fa"

import { type ItemPublic, ItemsService } from "@/client"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog"

interface ItemDetailModalProps {
  item: ItemPublic | null
  isOpen: boolean
  onClose: () => void
}

function ReviewSection({ author, title }: { author: string; title: string }) {
  const { data: reviews, isLoading } = useQuery({
    queryKey: ["itemReviews", author, title],
    queryFn: () => ItemsService.readReviews({ author, title }),
  })

  return (
    <VStack align="stretch" gap={4} width="full" mt={6}>
      <Heading size="md">Reviews</Heading>

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

  const averageCondition = Number(
    info.average_condition_grade || info.grade || 0,
  )
  const physicalNotes = info.physical_notes || []

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
                  Subjects
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
                Condition & Copy Details
              </Heading>
              <VStack align="start" gap={3} width="full">
                <HStack justify="space-between" width="full">
                  <Text fontSize="xs" fontWeight="bold" color="fg.subtle">
                    AVERAGED CONDITION GRADE:
                  </Text>
                  <Badge
                    colorPalette={
                      averageCondition > 7
                        ? "green"
                        : averageCondition > 4
                          ? "yellow"
                          : "red"
                    }
                  >
                    {averageCondition > 0
                      ? `${averageCondition.toFixed(1)}/10`
                      : "?"}
                  </Badge>
                </HStack>

                {physicalNotes.length > 0 ? (
                  <Box width="full">
                    <Text
                      fontSize="xs"
                      fontWeight="bold"
                      color="fg.subtle"
                      mb={2}
                    >
                      PHYSICAL NOTES:
                    </Text>
                    <VStack align="stretch" gap={2}>
                      {physicalNotes.map((note: any, idx: number) => (
                        <Box
                          key={idx}
                          p={2}
                          bg="bg.subtle"
                          rounded="sm"
                          borderLeft="4px solid"
                          borderColor="ui.hover"
                        >
                          <Text fontSize="sm" fontStyle="italic">
                            "{note.note}"
                          </Text>
                        </Box>
                      ))}
                    </VStack>
                  </Box>
                ) : (
                  <Box>
                    {info.physical_description && (
                      <>
                        <Text fontSize="xs" fontWeight="bold" color="fg.subtle">
                          OWNER DESCRIPTION:
                        </Text>
                        <Text fontSize="sm">{info.physical_description}</Text>
                      </>
                    )}
                    {!info.physical_description && (
                      <Text fontSize="xs" color="fg.muted" fontStyle="italic">
                        No extra description provided by owner.
                      </Text>
                    )}
                  </Box>
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
