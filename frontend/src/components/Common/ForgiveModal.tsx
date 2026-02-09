import {
  Button,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  Field,
  VStack,
  Text,
  Input,
  Textarea,
  HStack,
} from "@chakra-ui/react"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { 
  type LoanPublic, 
  LoansService, 
  type ForgivenessReason,
  type ForgivenessRequest 
} from "@/client"
import useCustomToast from "@/hooks/useCustomToast"
import { Radio, RadioGroup as ChakraRadioGroup } from "@/components/ui/radio"

interface ForgiveModalProps {
  loan: LoanPublic
  isOpen: boolean
  onClose: () => void
}

const ForgiveModal = ({ loan, isOpen, onClose }: ForgiveModalProps) => {
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()
  const [reason, setReason] = useState<ForgivenessReason>("OTHER")
  
  // Specs for replacement item
  const [title, setTitle] = useState(loan.item.title)
  const [author, setAuthor] = useState(loan.item.author || "")
  const [description, setDescription] = useState(loan.item.description || "")

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
    const data: ForgivenessRequest = { reason }
    
    if (reason === "REPLACED_ITEM") {
      data.new_item_specs = {
        title,
        author,
        description,
        item_type: loan.item.item_type,
        // Carry over image if same? Maybe not if it's a replacement
      }
    }
    
    forgiveMutation.mutate(data)
  }

  return (
    <DialogRoot open={isOpen} onOpenChange={onClose} size="md">
      <DialogContent bg="bg.panel">
        <DialogHeader>
          <DialogTitle>Forgive Default</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <VStack align="stretch" gap={4}>
            <Text fontSize="sm">
              Select a reason for forgiving this default. This will remove the delinquency status from the borrower's profile.
            </Text>
            
            <Field.Root label="Forgiveness Reason">
              <ChakraRadioGroup 
                value={reason} 
                onValueChange={(details) => setReason(details.value as ForgivenessReason)}
              >
                <VStack align="start" gap={2}>
                  <Radio value="GOOD_REASON">
                    Borrower has good reason for losing item
                  </Radio>
                  <Radio value="FOUND_AND_RETURNED">
                    Found and returned item (Restores inventory)
                  </Radio>
                  <Radio value="REPLACED_ITEM">
                    Borrower replaced item (Adds new item)
                  </Radio>
                  <Radio value="OTHER">
                    My choice (Maintains historical penalty)
                  </Radio>
                </VStack>
              </ChakraRadioGroup>
            </Field.Root>

            {reason === "REPLACED_ITEM" && (
              <VStack align="stretch" gap={3} p={3} borderWidth="1px" borderRadius="md" bg="bg.muted">
                <Text fontWeight="bold" fontSize="xs">REPLACEMENT ITEM SPECS</Text>
                <Field.Root label="Title">
                  <Input 
                    size="sm" 
                    value={title} 
                    onChange={(e) => setTitle(e.target.value)} 
                    placeholder="New item title"
                  />
                </Field.Root>
                <Field.Root label="Author (Optional)">
                  <Input 
                    size="sm" 
                    value={author} 
                    onChange={(e) => setAuthor(e.target.value)} 
                    placeholder="Author"
                  />
                </Field.Root>
                <Field.Root label="Description">
                  <Textarea 
                    size="sm" 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)} 
                    placeholder="Physical condition, etc."
                  />
                </Field.Root>
              </VStack>
            )}
          </VStack>
        </DialogBody>
        <DialogFooter>
          <HStack gap={3}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button 
              colorPalette="green" 
              onClick={handleConfirm}
              loading={forgiveMutation.isPending}
            >
              Confirm Forgiveness
            </Button>
          </HStack>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default ForgiveModal
