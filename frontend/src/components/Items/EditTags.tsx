import { Button, Input, VStack } from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { FaPlus } from "react-icons/fa"

import { type ItemPublic, ItemsService } from "@/client"
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
import useCustomToast from "@/hooks/useCustomToast"

interface EditTagsProps {
  item: ItemPublic
}

const EditTags = ({ item }: EditTagsProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<{ tags: string }>({
    defaultValues: {
      tags: item.work_metadata?.tags?.join(", ") || "",
    },
  })

  const mutation = useMutation({
    mutationFn: (tags: string[]) =>
      ItemsService.updateWorkMetadata({
        author: item.author || "",
        title: item.title,
        requestBody: { tags },
      }),
    onSuccess: () => {
      showSuccessToast("Subjects updated!")
      setIsOpen(false)
      queryClient.invalidateQueries({ queryKey: ["items"] })
      // Also invalidate wherever work_metadata is used
    },
    onError: () => showErrorToast("Failed to update subjects"),
  })

  const onSubmit = (data: { tags: string }) => {
    const tagsArray = data.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
    mutation.mutate(tagsArray)
  }

  return (
    <DialogRoot open={isOpen} onOpenChange={(e) => setIsOpen(e.open)}>
      <DialogTrigger asChild>
        <Button
          size="xs"
          variant="ghost"
          colorPalette="gray"
          aria-label="Add Subjects"
          onClick={(e) => e.stopPropagation()}
        >
          <FaPlus />
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Edit Subjects</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form id="edit-tags-form" onSubmit={handleSubmit(onSubmit)}>
            <Field label="Subjects (comma separated)">
              <Input {...register("tags")} placeholder="fantasy, scifi, epic" />
            </Field>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-tags-form"
            loading={isSubmitting}
            colorPalette="accent"
          >
            Save
          </Button>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default EditTags
