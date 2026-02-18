import {
  Badge,
  Box,
  Flex,
  Grid,
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

  const info = (item.info as any) || {}
  const workMeta = item.work_metadata

  const averageCondition = Number(
    info.average_condition_grade || info.grade || 0,
  )
  const physicalNotes = info.physical_notes || []

  const subjects =
    (workMeta?.tags?.length ? workMeta.tags : null) ||
    item.subject
      ?.split(",")
      .map((s: string) => s.trim())
      .filter(Boolean) ||
    []

  const details = [
    { label: "ISBN", value: item.isbn || workMeta?.isbn },
  ].filter((d) => d.value)

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
              {item.category && (
                <Badge variant="outline" colorPalette="main">
                  {item.category}
                </Badge>
              )}
              {item.genre && (
                <Badge variant="outline" colorPalette="purple">
                  {item.genre}
                </Badge>
              )}
            </HStack>

            {item.author && (
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

            {details.length > 0 && (
              <Box width="full">
                <Grid templateColumns="repeat(2, 1fr)" gap={4}>
                  {details.map((detail) => (
                    <Box key={detail.label}>
                      <Text fontSize="xs" fontWeight="bold" color="fg.subtle" textTransform="uppercase">
                        {detail.label}
                      </Text>
                      <Text fontSize="sm">{detail.value}</Text>
                    </Box>
                  ))}
                </Grid>
              </Box>
            )}

            {(averageCondition > 0 || physicalNotes.length > 0) && (
              <Box
                width="full"
                p={4}
                bg="bg.muted"
                borderRadius="md"
                borderWidth="1px"
                borderColor="border.subtle"
              >
                <Heading size="xs" mb={3} textTransform="uppercase" color="ui.main">
                  Copy Specifics
                </Heading>
                <VStack align="start" gap={3}>
                  {averageCondition > 0 && (
                    <HStack gap={2}>
                      <Text fontSize="sm" fontWeight="bold">
                        Condition Grade:
                      </Text>
                      <Badge
                        colorPalette={
                          averageCondition >= 8
                            ? "green"
                            : averageCondition >= 5
                              ? "yellow"
                              : "red"
                        }
                        variant="solid"
                      >
                        {averageCondition}/10
                      </Badge>
                    </HStack>
                  )}
                  {physicalNotes.length > 0 && (
                    <Box>
                      <Text fontSize="sm" fontWeight="bold" mb={1}>
                        Physical Notes:
                      </Text>
                      <VStack align="start" gap={1} pl={2} borderLeftWidth="2px" borderColor="ui.main">
                        {physicalNotes.map((note: string, idx: number) => (
                          <Text key={idx} fontSize="sm" fontStyle="italic">
                            "{note}"
                          </Text>
                        ))}
                      </VStack>
                    </Box>
                  )}
                </VStack>
              </Box>
            )}

            {subjects.length > 0 && (
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
                <Flex wrap="wrap" gap={2}>
                  {subjects.map((tag: string) => (
                    <Badge
                      key={tag}
                      size="xs"
                      colorPalette="orange"
                      variant="outline"
                    >
                      {tag}
                    </Badge>
                  ))}
                </Flex>
              </Box>
            )}

            <Separator />

            {item.author && (
              <ReviewSection author={item.author} title={item.title} />
            )}
          </VStack>
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  )
}
