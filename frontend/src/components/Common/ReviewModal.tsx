import {
  type LoanPublic,
  ReviewsService,
  type UserReviewCreate,
} from "@/client"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { Button, Field, Text, Textarea, VStack } from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "../ui/dialog"
import { Rating } from "./Rating"

interface ReviewModalProps {
  loan: LoanPublic
  isOpen: boolean
  onClose: () => void
}

const ReviewModal = ({ loan, isOpen, onClose }: ReviewModalProps) => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { user } = useAuth()

  const { register, handleSubmit, setValue, watch, reset } =
    useForm<UserReviewCreate>({
      defaultValues: {
        loan_id: loan.id,
        rating: 5,
        comment: "",
      },
    })

  const ratingValue = watch("rating")
  const isOwner = loan.owner_id === user?.id
  const revieweeName = isOwner
    ? loan.requester.full_name || loan.requester.email
    : loan.owner?.full_name || loan.owner?.email || "Owner"

  const mutation = useMutation({
    mutationFn: (data: UserReviewCreate) =>
      ReviewsService.createReview({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Review submitted successfully!")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["reputation"] })
      reset()
      onClose()
    },
    onError: (err: any) => {
      showErrorToast(err.body?.detail || "Failed to submit review")
    },
  })

  const onSubmit = (data: UserReviewCreate) => {
    mutation.mutate(data)
  }

  return (
    <DialogRoot open={isOpen} onOpenChange={(e) => !e.open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rate your experience with {revieweeName}</DialogTitle>
        </DialogHeader>
        <DialogBody pb={6}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <VStack gap={4} align="stretch">
              <Text fontSize="sm" color="gray.600">
                {isOwner
                  ? `How was the return process for '${loan.item.title}'? Did the borrower take good care of it?`
                  : `How was your experience borrowing '${loan.item.title}' from the owner?`}
              </Text>

              <Field.Root>
                <Field.Label>Rating</Field.Label>
                <Rating
                  value={ratingValue}
                  onChange={(val) => setValue("rating", val)}
                />
              </Field.Root>

              <Field.Root>
                <Field.Label>Comments (Private to Owners/Admins)</Field.Label>
                <Textarea
                  {...register("comment")}
                  placeholder="Share your experience... (optional)"
                  rows={3}
                />
                <Field.HelperText>
                  Your raw comments are only visible to the item owner or
                  community admins. The user will only see an anonymized AI
                  summary.
                </Field.HelperText>
              </Field.Root>

              <Button
                type="submit"
                colorPalette="main"
                loading={mutation.isPending}
                width="full"
              >
                Submit Review
              </Button>
            </VStack>
          </form>
        </DialogBody>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default ReviewModal
