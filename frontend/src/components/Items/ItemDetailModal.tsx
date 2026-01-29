import type { ItemPublic } from "@/client"
import { useColorModeValue } from "@/components/ui/color-mode"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog"
import { getImageUrl } from "@/utils"
import {
  Badge,
  Box,
  HStack,
  Heading,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react"

interface ItemDetailModalProps {
  item: ItemPublic | null
  isOpen: boolean
  onClose: () => void
}

export const ItemDetailModal = ({
  item,
  isOpen,
  onClose,
}: ItemDetailModalProps) => {
  if (!item) return null

  const isBook = item.item_type === "book"
  const extraData = (item.extra_data as any) || {}
  const bgColor = useColorModeValue("orange.50", "gray.800")
  const borderColor = useColorModeValue("orange.200", "gray.600")

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
          <VStack align="start" gap={4}>
            <HStack gap={2}>
              <Badge colorPalette="teal" variant="solid">
                {String(item.item_type || "General")}
              </Badge>
              {isBook && extraData.category && (
                <Badge variant="outline" colorPalette="blue">
                  {extraData.category}
                </Badge>
              )}
              {isBook && extraData.genre && (
                <Badge variant="outline" colorPalette="purple">
                  {extraData.genre}
                </Badge>
              )}
            </HStack>

            {isBook && extraData.author && (
              <Text fontSize="md" fontWeight="bold">
                Author:{" "}
                <Text as="span" fontWeight="normal" fontStyle="italic">
                  {extraData.author}
                </Text>
              </Text>
            )}

            <Box>
              <Heading size="sm" mb={2}>
                Description
              </Heading>
              <Text fontSize="md" whiteSpace="pre-wrap">
                {item.description || "No description provided."}
              </Text>
            </Box>

            {isBook && extraData.isbn && (
              <Text fontSize="xs" color="fg.muted" fontFamily="mono" mt={4}>
                ISBN: {String(extraData.isbn)}
              </Text>
            )}
          </VStack>
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  )
}
