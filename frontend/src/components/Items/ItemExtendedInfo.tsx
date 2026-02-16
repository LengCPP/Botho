import { Badge, Box, Flex, HStack, Text, VStack } from "@chakra-ui/react"

import type { ItemPublic } from "@/client"
import { useColorModeValue } from "@/components/ui/color-mode"
import EditItem from "./EditItem"

interface ItemExtendedInfoProps {
  item: ItemPublic
  isOwner: boolean
  showAddReview?: boolean
}

const ItemExtendedInfo = ({ item, isOwner }: ItemExtendedInfoProps) => {
  const itemInfo = (item.info as any) || {}

  // Color mode values
  const cardBg = useColorModeValue("white", "gray.700")
  const borderColor = useColorModeValue("gray.200", "gray.600")

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
      </Box>
    </VStack>
  )
}

export default ItemExtendedInfo
