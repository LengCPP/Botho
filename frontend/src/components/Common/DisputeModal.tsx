import {
  Button,
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  type ApiError,
  ReviewsService,
  type UserReviewPublic,
} from "../../client"
import useCustomToast from "../../hooks/useCustomToast"

interface DisputeModalProps {
  review: UserReviewPublic
  isOpen: boolean
  onClose: () => void
}

const DisputeModal = ({ review, isOpen, onClose }: DisputeModalProps) => {
  const [reason, setReason] = useState("")
  const queryClient = useQueryClient()
  const showToast = useCustomToast()

  const mutation = useMutation({
    mutationFn: (data: { reason: string }) =>
      ReviewsService.disputeReview({
        reviewId: review.id,
        requestBody: data,
      }),
    onSuccess: () => {
      showToast("Dispute submitted successfully", "success")
      queryClient.invalidateQueries({ queryKey: ["reviews", "me"] })
      onClose()
    },
    onError: (err: ApiError) => {
      const errDetail = (err.body as any)?.detail
      showToast("Failed to submit dispute", "error", errDetail)
    },
  })

  const handleSubmit = () => {
    if (reason.length < 10) {
      showToast(
        "Reason is too short",
        "error",
        "Please provide at least 10 characters.",
      )
      return
    }
    mutation.mutate({ reason })
  }

  return (
    <DialogRoot open={isOpen} onOpenChange={onClose} placement="center">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispute Review</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <VStack gap={4} align="stretch">
            <VStack align="start" gap={1}>
              <Text fontSize="sm" color="gray.600">
                Please explain why you believe this review is unfair or violates
                our community guidelines. Your dispute will be reviewed by a
                moderator.
              </Text>
            </VStack>
            <Textarea
              placeholder="Reason for dispute (min 10 chars)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minH="120px"
            />
          </VStack>
        </DialogBody>
        <DialogFooter>
          <DialogActionTrigger asChild>
            <Button variant="outline">Cancel</Button>
          </DialogActionTrigger>
          <Button
            colorPalette="red"
            onClick={handleSubmit}
            loading={mutation.isPending}
            disabled={reason.length < 10}
          >
            Submit Dispute
          </Button>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default DisputeModal
