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
    watch,
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

  const collectionType = watch("collection_type")
  const isBucket = collectionType === "BUCKET"

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
              <Field
                label="Type"
                required
                invalid={!!errors.collection_type}
                errorText={errors.collection_type?.message}
              >
                <select
                  {...register("collection_type", {
                    required: "Collection type is required",
                  })}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: `1px solid ${selectBorder}`,
                    backgroundColor: selectBg,
                    color: selectColor,
                  }}
                  disabled={isBucket}
                >
                  <option value="" style={{ backgroundColor: selectBg }}>
                    -- select collection type --
                  </option>
                  <option value="LIBRARY" style={{ backgroundColor: selectBg }}>
                    Library (e.g. for Books)
                  </option>
                  <option value="GENERAL" style={{ backgroundColor: selectBg }}>
                    General Collection
                  </option>
                  <option value="BUCKET" style={{ backgroundColor: selectBg }}>
                    Community Bucket (Pool)
                  </option>
                </select>
              </Field>

              <Field
                required={!isBucket}
                invalid={!!errors.title}
                errorText={errors.title?.message}
                label="Title"
              >
                <Input
                  id="title"
                  {...register("title", {
                    required: isBucket ? false : "Title is required.",
                  })}
                  placeholder={isBucket ? "Auto-generated" : "My Book Library"}
                  type="text"
                  disabled={isBucket}
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
                  placeholder={isBucket ? "Auto-generated" : "A collection of my favorite books"}
                  type="text"
                  disabled={isBucket}
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
              disabled={!isValid}
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
