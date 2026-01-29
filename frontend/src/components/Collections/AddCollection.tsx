import { useColorModeValue } from "@/components/ui/color-mode"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  Button,
  DialogActionTrigger,
  DialogTitle,
  Input,
  Text,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react"
import { useState } from "react"
import { FaPlus } from "react-icons/fa"

import { type CollectionCreate, CollectionsService, CommunitiesService } from "@/client"
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
  DialogTrigger,
} from "../ui/dialog"
import { Field } from "../ui/field"

interface AddCollectionProps {
  communityId?: string
}

interface CollectionCreateExtended extends CollectionCreate {
  target_community_id?: string
}

const AddCollection = ({ communityId }: AddCollectionProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()
  const isMobile = useBreakpointValue({ base: true, md: false })

  const selectBg = useColorModeValue("white", "gray.800")
  const selectColor = useColorModeValue("black", "white")
  const selectBorder = useColorModeValue("gray.300", "gray.600")

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isValid, isSubmitting },
  } = useForm<CollectionCreateExtended>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      title: "",
      description: "",
      collection_type: "" as any,
      target_community_id: communityId || "",
    },
  })

  const collectionType = watch("collection_type")
  const isBucket = collectionType === "BUCKET"

  const { data: myCommunities } = useQuery({
    queryKey: ["my-communities-for-collection"],
    queryFn: () => CommunitiesService.readCommunities({}),
    enabled: isOpen,
  })

  const acceptedCommunities = myCommunities?.data.filter(
    (c) => c.current_user_status === "ACCEPTED"
  ) || []

  const canCreateBucket = acceptedCommunities.length > 0 || !!communityId

  const mutation = useMutation({
    mutationFn: (data: CollectionCreateExtended) =>
      CollectionsService.createCollection({ 
        requestBody: {
          title: data.title,
          description: data.description,
          collection_type: data.collection_type,
        }, 
        communityId: data.target_community_id 
      }),
    onSuccess: () => {
      showSuccessToast("Collection created successfully.")
      reset()
      setIsOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      const targetId = watch("target_community_id")
      if (targetId) {
        queryClient.invalidateQueries({
          queryKey: ["communityCollections", targetId],
        })
      } else {
        queryClient.invalidateQueries({ queryKey: ["collections"] })
      }
    },
  })

  const onSubmit: SubmitHandler<CollectionCreateExtended> = async (data) => {
    const finalData = { ...data }
    if (isBucket) {
      finalData.title = "Bucket" // Placeholder, backend overwrites
    }
    mutation.mutate(finalData)
  }

  const selectStyle = {
    width: "100%",
    padding: "8px",
    borderRadius: "4px",
    border: `1px solid ${selectBorder}`,
    backgroundColor: selectBg,
    color: selectColor,
  }

  return (
    <DialogRoot
      size={{ base: "xs", md: "md" }}
      placement="center"
      open={isOpen}
      onOpenChange={({ open }) => setIsOpen(open)}
    >
      <DialogTrigger asChild>
        <Button variant="outline" my={4} colorPalette="orange">
          <FaPlus fontSize="16px" />
          {isMobile ? "Collection" : "Create Collection"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Create Collection / Library</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Text mb={4}>
              Organize your items into libraries or collections.
            </Text>
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
                  style={selectStyle}
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
                  {canCreateBucket && (
                    <option value="BUCKET" style={{ backgroundColor: selectBg }}>
                      Community Bucket (Pool)
                    </option>
                  )}
                </select>
              </Field>

              {isBucket && !communityId && (
                <Field
                  label="Share with Community"
                  required
                  invalid={!!errors.target_community_id}
                  errorText={errors.target_community_id?.message}
                >
                  <select
                    {...register("target_community_id", {
                      required: isBucket ? "Please select a community to share with" : false,
                    })}
                    style={selectStyle}
                  >
                    <option value="" style={{ backgroundColor: selectBg }}>
                      -- select community --
                    </option>
                    {acceptedCommunities.map((c) => (
                      <option key={c.id} value={c.id} style={{ backgroundColor: selectBg }}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

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
              Create
            </Button>
          </DialogFooter>
        </form>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default AddCollection
