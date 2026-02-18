import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog"
import { Text, VStack } from "@chakra-ui/react"
import { useState } from "react"

interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (dontShowAgain?: boolean) => void
  title: string
  message: string
  isLoading?: boolean
  showCheckbox?: boolean
  confirmButtonText?: string
  colorPalette?: string
}

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  isLoading = false,
  showCheckbox = true,
  confirmButtonText = "Confirm",
  colorPalette = "red",
}: ConfirmationModalProps) => {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  const handleConfirm = () => {
    onConfirm(dontShowAgain)
  }

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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <VStack align="stretch" gap={4}>
            <Text color="fg.muted">{message}</Text>
            {showCheckbox && (
              <Checkbox
                checked={dontShowAgain}
                onCheckedChange={(e) => setDontShowAgain(!!e.checked)}
              >
                Don't show this again
              </Checkbox>
            )}
          </VStack>
        </DialogBody>
        <DialogFooter gap={3}>
          <DialogActionTrigger asChild>
            <Button
              variant="subtle"
              colorPalette="gray"
              disabled={isLoading}
              onClick={onClose}
            >
              Cancel
            </Button>
          </DialogActionTrigger>
          <Button
            colorPalette={colorPalette}
            onClick={handleConfirm}
            loading={isLoading}
          >
            {confirmButtonText}
          </Button>
        </DialogFooter>
        <DialogCloseTrigger onClick={onClose} disabled={isLoading} />
      </DialogContent>
    </DialogRoot>
  )
}

export default ConfirmationModal
