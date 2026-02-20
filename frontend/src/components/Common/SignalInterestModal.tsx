import { LoansService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog"
import useCustomToast from "@/hooks/useCustomToast"
import { Text } from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FiBell } from "react-icons/fi"

interface SignalInterestModalProps {
  isOpen: boolean
  onClose: () => void
  itemId: string
  notificationMessage: string
}

const SignalInterestModal = ({
  isOpen,
  onClose,
  itemId,
  notificationMessage,
}: SignalInterestModalProps) => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const signalInterestMutation = useMutation({
    mutationFn: () => LoansService.signalItemInterest({ itemId }),
    onSuccess: () => {
      showSuccessToast("You'll be notified when this item becomes available.")
      queryClient.invalidateQueries({ queryKey: ["my-interest-signals"] })
      onClose()
    },
    onError: (err: any) => {
      const detail = err?.body?.detail || "Could not signal interest."
      showErrorToast(detail)
      onClose()
    },
  })

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={({ open }) => !open && onClose()}
      placement="center"
    >
      <DialogContent
        backdropProps={{ backdropFilter: "blur(10px)" }}
        borderRadius="xl"
      >
        <DialogHeader>
          <DialogTitle>Item is Out — Stay in the Loop?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Text color="fg.muted" mb={3}>
            {notificationMessage}
          </Text>
          <Text fontSize="sm">
            Signal interest to be notified the moment this item is returned and
            available to borrow again.
          </Text>
        </DialogBody>
        <DialogFooter gap={3}>
          <Button variant="subtle" colorPalette="gray" onClick={onClose}>
            Dismiss
          </Button>
          <Button
            colorPalette="accent"
            onClick={() => signalInterestMutation.mutate()}
            loading={signalInterestMutation.isPending}
          >
            <FiBell /> Signal Interest
          </Button>
        </DialogFooter>
        <DialogCloseTrigger onClick={onClose} />
      </DialogContent>
    </DialogRoot>
  )
}

export default SignalInterestModal
