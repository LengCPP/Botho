import {
  type ForgivenessReason,
  type ForgivenessRequest,
  type LoanPublic,
  LoansService,
} from "@/client"
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
import { Field } from "@/components/ui/field"
import { Radio, RadioGroup } from "@/components/ui/radio"
import useCustomToast from "@/hooks/useCustomToast"
import { Text, VStack } from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

interface ForgiveModalProps {
  loan: LoanPublic
  isOpen: boolean
  onClose: () => void
}

const ForgiveModal = ({ loan, isOpen, onClose }: ForgiveModalProps) => {
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()
  const [reason, setReason] = useState<ForgivenessReason>("OTHER")

  const forgiveMutation = useMutation({
    mutationFn: (data: ForgivenessRequest) =>
      LoansService.forgiveLoan({ id: loan.id, requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Loan forgiven successfully")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
      onClose()
    },
  })

  const handleConfirm = () => {
    forgiveMutation.mutate({ reason })
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
          <DialogTitle>Forgive Borrower</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <VStack align="stretch" gap={4}>
            <Text fontSize="sm">
              Forgive the default for '{loan.item.title}'? This will remove the
              delinquency penalty from the borrower.
            </Text>

            <Field label="Forgiveness Reason">
              <RadioGroup
                value={reason}
                onValueChange={(details) =>
                  setReason(details.value as ForgivenessReason)
                }
              >
                <VStack align="start" gap={2} mt={2}>
                  <Radio value="GOOD_REASON">Borrower has good reason</Radio>
                  <Radio value="FOUND_AND_RETURNED">
                    Item found and returned
                  </Radio>
                  <Radio value="OTHER">Other / Manual choice</Radio>
                </VStack>
              </RadioGroup>
            </Field>
          </VStack>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={forgiveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            colorPalette="green"
            onClick={handleConfirm}
            loading={forgiveMutation.isPending}
          >
            Confirm Forgiveness
          </Button>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default ForgiveModal
