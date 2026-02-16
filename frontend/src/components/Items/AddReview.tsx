import {
  Box,
  Button,
  Input,
  Separator,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { FaPen } from "react-icons/fa"

import { type ItemPublic, type ItemReviewCreate, ItemsService } from "@/client"
import { Rating } from "@/components/Common/Rating"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"

interface AddReviewProps {
  item: ItemPublic
}

interface CombinedReviewForm extends ItemReviewCreate {
  condition_grade?: number
  condition_notes?: string
}

const AddReview = ({ item }: AddReviewProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // 1. Fetch all reviews to find current user's one
  const { data: reviewsData } = useQuery({
    queryKey: ["reviews", item.author, item.title],
    queryFn: () =>
      ItemsService.readReviews({
        author: item.author || "",
        title: item.title,
      }),
    enabled: !!item.author && !!item.title,
  })

  const existingReview = reviewsData?.data.find((r) => r.user_id === user?.id)

  // 2. Fetch all condition ratings to find current user's one
  const { data: conditionData } = useQuery({
    queryKey: ["condition-ratings", item.id],
    queryFn: () =>
      ItemsService.readItemConditionRatings({
        itemId: item.id,
      }),
    enabled: !!item.had_possession,
  })

  const existingCondition = conditionData?.find((r) => r.user_id === user?.id)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting },
  } = useForm<CombinedReviewForm>({
    defaultValues: {
      rating: 5,
      comment: "",
      author: item.author || "",
      title: item.title,
      condition_grade: 10,
      condition_notes: "",
    },
  })

  // Pre-fill form when existing data is found
  useEffect(() => {
    if (isOpen) {
      reset({
        rating: existingReview?.rating || 5,
        comment: existingReview?.comment || "",
        author: item.author || "",
        title: item.title,
        condition_grade: existingCondition?.grade || 10,
        condition_notes: existingCondition?.notes || "",
      })
    }
  }, [isOpen, existingReview, existingCondition, reset, item])

  const mutation = useMutation({
    mutationFn: async (data: CombinedReviewForm) => {
      // Create/Update Review
      const reviewPromise = ItemsService.createReview({
        requestBody: {
          author: data.author,
          title: data.title,
          rating: data.rating,
          comment: data.comment,
        },
      })

      // Create/Update Condition Rating if possessed
      if (item.had_possession && data.condition_grade) {
        await ItemsService.createConditionRating({
          requestBody: {
            item_id: item.id,
            grade: data.condition_grade,
            notes: data.condition_notes,
          },
        })
      }

      return reviewPromise
    },
    onSuccess: () => {
      showSuccessToast(existingReview ? "Review updated!" : "Review added!")
      setIsOpen(false)
      queryClient.invalidateQueries({
        queryKey: ["reviews", item.author, item.title],
      })
      queryClient.invalidateQueries({
        queryKey: ["condition-ratings", item.id],
      })
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
    onError: () => showErrorToast("Failed to submit review"),
  })

  const onSubmit = (data: CombinedReviewForm) => {
    mutation.mutate(data)
  }

  return (
    <DialogRoot open={isOpen} onOpenChange={(e) => setIsOpen(e.open)} size="md">
      <DialogTrigger asChild>
        <Button size="xs" variant="outline" colorPalette="accent">
          <FaPen /> {existingReview ? "Edit Review" : "Write Review"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existingReview ? "Update Your Review" : "Write a Review"}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form id="add-review-form" onSubmit={handleSubmit(onSubmit)}>
            <VStack gap={6} align="stretch">
              <Box>
                <Text fontWeight="bold" fontSize="sm" mb={3} color="ui.hover">
                  BOOK REVIEW (CONTENT)
                </Text>
                <VStack gap={4} align="stretch">
                  <Field
                    label="How would you rate the content of this book?"
                    required
                  >
                    <Controller
                      name="rating"
                      control={control}
                      rules={{ required: true, min: 1, max: 5 }}
                      render={({ field }) => (
                        <Rating
                          value={field.value}
                          onChange={field.onChange}
                          readOnly={false}
                          size={24}
                        />
                      )}
                    />
                  </Field>
                  <Field label="Comment">
                    <Textarea
                      id="comment"
                      placeholder="Share your thoughts on the writing, story, or themes..."
                      rows={3}
                      {...register("comment")}
                    />
                  </Field>
                </VStack>
              </Box>

              {item.had_possession && (
                <>
                  <Separator />
                  <Box>
                    <Text
                      fontWeight="bold"
                      fontSize="sm"
                      mb={3}
                      color="ui.hover"
                    >
                      PHYSICAL CONDITION (THIS COPY)
                    </Text>
                    <Text fontSize="xs" color="fg.muted" mb={4}>
                      Since you had possession of this item, please rate its
                      physical state.
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
                              id="condition_grade"
                              name="condition_grade"
                              type="number"
                              min={1}
                              max={10}
                              value={field.value}
                              onChange={(e) =>
                                field.onChange(Number(e.target.value))
                              }
                            />
                          )}
                        />
                      </Field>
                      <Field label="Physical Notes">
                        <Textarea
                          id="condition_notes"
                          placeholder="Any specific damage or unique physical features?"
                          rows={2}
                          {...register("condition_notes")}
                        />
                      </Field>
                    </VStack>
                  </Box>
                </>
              )}
            </VStack>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-review-form"
            loading={isSubmitting}
            colorPalette="accent"
          >
            {existingReview ? "Update" : "Submit"}
          </Button>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default AddReview
