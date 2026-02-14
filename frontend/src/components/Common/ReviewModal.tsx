import {
  type LoanPublic,
  ReviewsService,
  type UserReviewCreate,
} from "@/client"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import {
  Box,
  Button,
  Input,
  Separator,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "../ui/dialog"
import { Field } from "../ui/field"
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

  const { register, handleSubmit, control, setValue, watch, reset } =
    useForm<UserReviewCreate>({
      defaultValues: {
        loan_id: loan.id,
        rating: 5,
        comment: "",
        condition_grade: 10,
        condition_notes: "",
      },
    })

  const ratingValue = watch("rating")
  const isOwner = loan.owner_id === user?.id
  const isBorrower = loan.requester_id === user?.id
  const isCommunityLoan = !loan.owner_id

  const revieweeName = isOwner
    ? loan.requester.full_name || loan.requester.email
    : isCommunityLoan && !isBorrower
      ? loan.requester.full_name || loan.requester.email
      : loan.owner?.full_name || loan.owner?.email || "Owner"

  // Show general review (rating/comment) if it's a personal loan OR
  // if it's a community loan and the user is NOT the borrower (Admin reviewing member)
  const showGeneralReview = !isCommunityLoan || !isBorrower

  const mutation = useMutation({
    mutationFn: (data: UserReviewCreate) =>
      ReviewsService.createReview({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Review submitted successfully!")
      // Invalidate all loan and item related queries to update UI state immediately
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
      queryClient.invalidateQueries({ queryKey: ["items"] })
      queryClient.invalidateQueries({ queryKey: ["communityItems"] })
      queryClient.invalidateQueries({ queryKey: ["reputation"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      queryClient.invalidateQueries({ queryKey: ["recent-activity"] })

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
    <DialogRoot
      open={isOpen}
      onOpenChange={(e) => !e.open && onClose()}
      scrollBehavior="inside"
      size="md"
      placement="center"
    >
      <DialogContent
        backdropProps={{ backdropFilter: "blur(10px)" }}
        borderRadius="xl"
      >
        <DialogHeader>
          <DialogTitle>
            {isCommunityLoan && !isOwner
              ? `Update Condition for '${loan.item.title}'`
              : `Rate your experience with ${revieweeName}`}
          </DialogTitle>
        </DialogHeader>
        <DialogBody pb={6}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <VStack gap={4} align="stretch">
              <Text fontSize="sm" color="gray.600">
                {isOwner
                  ? `How was the return process for '${loan.item.title}'? Did the borrower take good care of it?`
                  : isCommunityLoan
                    ? `Please update the physical state of '${loan.item.title}' after borrowing it from the community.`
                    : `How was your experience borrowing '${loan.item.title}' from the owner?`}
              </Text>

              {showGeneralReview && (
                <Box>
                  <Text
                    fontWeight="bold"
                    fontSize="sm"
                    mb={3}
                    color="ui.hover"
                    textTransform="uppercase"
                  >
                    General Review
                  </Text>
                  <VStack gap={4} align="stretch">
                    <Field label="Rating">
                      <Rating
                        value={ratingValue}
                        onChange={(val) => setValue("rating", val)}
                        readOnly={false}
                        size={24}
                      />
                    </Field>

                    <Field
                      label="Comments (Private to Owners/Admins)"
                      helperText="Your raw comments are only visible to the item owner or community admins. The user will only see an anonymized AI summary."
                    >
                      <Textarea
                        id="review_comment"
                        {...register("comment")}
                        placeholder="Share your experience... (optional)"
                        rows={3}
                      />
                    </Field>
                  </VStack>
                </Box>
              )}

              {!isOwner && (
                <>
                  {showGeneralReview && <Separator />}
                  <Box>
                    <Text
                      fontWeight="bold"
                      fontSize="sm"
                      mb={3}
                      color="ui.hover"
                      textTransform="uppercase"
                    >
                      Physical Condition (This Copy)
                    </Text>
                    <VStack gap={4} align="stretch">
                      <Field
                        label="Condition Grade (1-10)"
                        helperText="10 = Brand New, 1 = Heavily Damaged"
                      >
                        <Controller
                          name="condition_grade"
                          control={control}
                          render={({ field }) => (
                            <Input
                              id="review_condition_grade"
                              name="condition_grade"
                              type="number"
                              min={1}
                              max={10}
                              value={field.value || 10}
                              onChange={(e) =>
                                field.onChange(Number(e.target.value))
                              }
                            />
                          )}
                        />
                      </Field>
                      <Field label="Condition Notes">
                        <Textarea
                          id="review_condition_notes"
                          {...register("condition_notes")}
                          placeholder="Any specific damage or unique physical features observed?"
                          rows={2}
                        />
                      </Field>
                    </VStack>
                  </Box>
                </>
              )}

              <Button
                type="submit"
                colorPalette="main"
                loading={mutation.isPending}
                width="full"
              >
                {showGeneralReview ? "Submit Review" : "Update Condition"}
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
