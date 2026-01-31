import {
  Button,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { FaPen } from "react-icons/fa"

import { ItemsService, type ItemReviewCreate, type ItemPublic } from "@/client"
import { Rating } from "@/components/Common/Rating"
import useCustomToast from "@/hooks/useCustomToast"
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

interface AddReviewProps {
  item: ItemPublic
}

const AddReview = ({ item }: AddReviewProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting },
  } = useForm<ItemReviewCreate>({
    defaultValues: {
      rating: 5,
      comment: "",
      author: item.author || "",
      title: item.title,
    },
  })

  const mutation = useMutation({
    mutationFn: (data: ItemReviewCreate) =>
      ItemsService.createReview({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Review added!")
      setIsOpen(false)
      reset()
      queryClient.invalidateQueries({
        queryKey: ["reviews", item.author, item.title],
      })
    },
    onError: () => showErrorToast("Failed to add review"),
  })

  const onSubmit = (data: ItemReviewCreate) => {
    mutation.mutate({
      ...data,
      author: item.author || "", // Ensure these are set
      title: item.title,
    })
  }

  return (
    <DialogRoot open={isOpen} onOpenChange={(e) => setIsOpen(e.open)}>
      <DialogTrigger asChild>
        <Button size="xs" variant="outline" colorPalette="accent">
          <FaPen /> Write Review
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Write a Review</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form id="add-review-form" onSubmit={handleSubmit(onSubmit)}>
            <VStack gap={4} align="stretch">
              <Field label="Rating" required>
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
                  placeholder="Share your thoughts..."
                  rows={4}
                  {...register("comment")}
                />
              </Field>
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
            Submit
          </Button>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default AddReview
