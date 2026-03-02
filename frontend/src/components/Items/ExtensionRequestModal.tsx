import { Loans } from "@/client"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import useCustomToast from "@/hooks/useCustomToast"
import { Button, Input as ChakraInput, Text, VStack } from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { useState } from "react"

interface ExtensionRequestModalProps {
  loanId: string
  itemTitle: string
  currentEndDate: string
  isOpen: boolean
  onClose: () => void
}

export function ExtensionRequestModal({
  loanId,
  itemTitle,
  currentEndDate,
  isOpen,
  onClose,
}: ExtensionRequestModalProps) {
  const [newEndDate, setNewEndDate] = useState("")
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (date: string) =>
      Loans.createExtensionRequest({
        id: loanId,
        new_end_date: date,
      }),
    onSuccess: () => {
      showSuccessToast("Extension request sent!")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      onClose()
    },
    onError: (err: any) => {
      showErrorToast(err.body?.detail || "Failed to send extension request")
    },
  })

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={(e) => !e.open && onClose()}
      placement="center"
      size="md"
    >
      <DialogContent
        backdropProps={{ backdropFilter: "blur(10px)" }}
        borderRadius="xl"
      >
        <DialogHeader>
          <DialogTitle>Request Extension: {itemTitle}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <VStack gap={4} align="stretch">
            <Text fontSize="sm">
              Current end date:{" "}
              <strong>{format(new Date(currentEndDate), "MMM d, yyyy")}</strong>
            </Text>
            <Field label="New End Date">
              <ChakraInput
                type="date"
                value={newEndDate}
                min={format(new Date(currentEndDate), "yyyy-MM-dd")}
                onChange={(e) => setNewEndDate(e.target.value)}
              />
            </Field>
          </VStack>
        </DialogBody>
        <DialogFooter gap={3}>
          <Button variant="subtle" colorPalette="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button
            colorPalette="accent"
            onClick={() => mutation.mutate(newEndDate)}
            loading={mutation.isPending}
            disabled={!newEndDate}
          >
            Send Request
          </Button>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}
