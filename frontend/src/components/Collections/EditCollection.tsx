import { useColorModeValue } from "@/components/ui/color-mode"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  Button,
  DialogActionTrigger,
  DialogTitle,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useState } from "react"

import {
  type CollectionPublic,
  type CollectionUpdate,
  CollectionsService,
} from "@/client"
import type { ApiError } from "@/client/core/ApiError"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "../ui/dialog"
import { Field } from "../ui/field"

interface EditCollectionProps {
  collection: CollectionPublic
  isOpen: boolean
  onClose: () => void
}

const EditCollection = ({
  collection,
  isOpen,
  onClose,
}: EditCollectionProps) => {
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()

  const selectBg = useColorModeValue("white", "gray.800")
  const selectColor = useColorModeValue("black", "white")
  const selectBorder = useColorModeValue("gray.300", "gray.600")

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid, isSubmitting },
  } = useForm<CollectionUpdate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      title: collection.title,
      description: collection.description || "",
      collection_type: collection.collection_type,
    },
  })

  const mutation = useMutation({
    mutationFn: (data: CollectionUpdate) =>
      CollectionsService.updateCollection({
        id: collection.id,
        requestBody: data,
      }),
    onSuccess: () => {
      showSuccessToast("Collection updated successfully.")
      onClose()
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] })
      queryClient.invalidateQueries({
        queryKey: ["collections", collection.id],
      })
      if (collection.community_id) {
        queryClient.invalidateQueries({
          queryKey: ["communityCollections", collection.community_id],
        })
      }
    },
  })

  const onSubmit: SubmitHandler<CollectionUpdate> = async (data) => {
    mutation.mutate(data)
  }

  return (
    <DialogRoot
      size={{ base: "xs", md: "md" }}
      placement="center"
      open={isOpen}
      onOpenChange={({ open }) => !open && onClose()}
    >
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Edit Collection / Library</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <VStack gap={4}>
              <Field label="Type">
                <select
                  {...register("collection_type")}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: `1px solid ${selectBorder}`,
                    backgroundColor: selectBg,
                    color: selectColor,
                  }}
                >
                  <option value="library" style={{ backgroundColor: selectBg }}>
                    Library (e.g. for Books)
                  </option>
                  <option value="general" style={{ backgroundColor: selectBg }}>
                    General Collection
                  </option>
                </select>
              </Field>

              <Field
                required
                invalid={!!errors.title}
                errorText={errors.title?.message}
                label="Title"
              >
                <Input
                  id="title"
                  {...register("title", {
                    required: "Title is required.",
                  })}
                  placeholder="My Book Library"
                  type="text"
                />
              </Field>

              <Field
                invalid={!!errors.description}
                errorText={errors.description?.message}
                label="Description"
              >
                <Input
                  id="description"
                  {...register("description")}
                  placeholder="A collection of my favorite books"
                  type="text"
                />
              </Field>
            </VStack>
          </DialogBody>

          <DialogFooter gap={2}>
            <DialogActionTrigger asChild>
              <Button
                variant="subtle"
                colorPalette="gray"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </DialogActionTrigger>
            <Button
              variant="solid"
              type="submit"
              colorPalette="orange"
              disabled={!isValid || !isValid}
              loading={isSubmitting}
            >
              Update
            </Button>
          </DialogFooter>
        </form>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default EditCollection
