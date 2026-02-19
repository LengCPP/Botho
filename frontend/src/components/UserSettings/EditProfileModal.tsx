import {
  Button,
  Heading,
  Input,
  Separator,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"

import { OpenAPI, UsersService } from "@/client"
import { request as apiRequest } from "@/client/core/request"
import type {
  UserProfileUpdate,
  UserPublicExtended,
  UserUpdateMe,
} from "@/customTypes"
import useCustomToast from "@/hooks/useCustomToast"
import {
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "../ui/dialog"
import { Field } from "../ui/field"
import InterestsSelect from "./InterestsSelect"

interface EditProfileModalProps {
  user: UserPublicExtended
  isOpen: boolean
  onClose: () => void
}

type EditProfileFormValues = UserUpdateMe & UserProfileUpdate

const EditProfileModal = ({ user, isOpen, onClose }: EditProfileModalProps) => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<EditProfileFormValues>({
    mode: "onBlur",
    defaultValues: {
      full_name: user.full_name || "",
      email: user.email || "",
      bio: user.profile?.bio || "",
      alias: user.profile?.alias || "",
      interest_ids: user.interests?.map((i) => i.id) || [],
    },
  })

  const selectedInterests = watch("interest_ids") || []

  const mutation = useMutation({
    mutationFn: async (data: EditProfileFormValues) => {
      const userUpdate: UserUpdateMe = {
        full_name: data.full_name,
        email: data.email,
      }
      const profileUpdate: UserProfileUpdate = {
        bio: data.bio,
        alias: data.alias,
        interest_ids: data.interest_ids,
      }

      await Promise.all([
        UsersService.updateUserMe({ requestBody: userUpdate }),
        apiRequest(OpenAPI, {
          method: "PATCH",
          url: "/api/v1/users/me/profile",
          body: profileUpdate,
          mediaType: "application/json",
        }),
      ])
    },
    onSuccess: () => {
      showSuccessToast("Profile updated successfully.")
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      onClose()
    },
    onError: () => {
      showErrorToast("Failed to update profile.")
    },
  })

  const onSubmit = (data: EditProfileFormValues) => {
    mutation.mutate(data)
  }

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={(details) => !details.open && onClose()}
      size="lg"
      scrollBehavior="inside"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger />
        <DialogBody>
          <VStack
            as="form"
            id="edit-profile-form"
            gap={4}
            align="stretch"
            onSubmit={handleSubmit(onSubmit)}
          >
            <Heading size="xs" mt={2}>
              General Info
            </Heading>
            <Field
              id="full_name"
              label="Name"
              invalid={!!errors.full_name}
              errorText={errors.full_name?.message as string}
            >
              <Input
                id="full_name"
                {...register("full_name")}
                placeholder="Full Name"
              />
            </Field>
            <Field
              id="alias"
              label="Alias"
              invalid={!!errors.alias}
              errorText={errors.alias?.message as string}
            >
              <Input
                id="alias"
                {...register("alias")}
                placeholder="Nickname / Alias"
              />
            </Field>
            <Field
              id="bio"
              label="Bio"
              invalid={!!errors.bio}
              errorText={errors.bio?.message as string}
            >
              <Textarea
                id="bio"
                {...register("bio")}
                placeholder="Tell us about yourself"
              />
            </Field>

            <Separator my={2} />
            <Heading size="xs">Contact Details</Heading>
            <Field
              id="email"
              label="Email"
              invalid={!!errors.email}
              errorText={errors.email?.message as string}
            >
              <Input
                id="email"
                {...register("email")}
                type="email"
                placeholder="Email Address"
              />
            </Field>

            <Separator my={2} />
            <Heading size="xs">Interests</Heading>
            <InterestsSelect
              selectedIds={selectedInterests}
              onChange={(ids) =>
                setValue("interest_ids", ids, { shouldDirty: true })
              }
            />
          </VStack>
        </DialogBody>
        <DialogFooter gap={3}>
          <DialogActionTrigger asChild>
            <Button variant="subtle" colorPalette="gray" onClick={onClose}>
              Cancel
            </Button>
          </DialogActionTrigger>
          <Button
            type="submit"
            form="edit-profile-form"
            colorPalette="accent"
            loading={isSubmitting}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}

export default EditProfileModal
