import {
  Box,
  Button,
  Flex,
  HStack,
  Image,
  Input,
  Separator,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"
import { FaExchangeAlt, FaPen } from "react-icons/fa"

import {
  type ApiError,
  type Body_items_update_item,
  type ItemPublic,
  ItemsService,
} from "@/client"
import { useColorModeValue } from "@/components/ui/color-mode"
import { BOOK_CLASSIFICATION } from "@/constants"
import useCustomToast from "@/hooks/useCustomToast"
import { getImageUrl, handleError } from "@/utils"
import {
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog"
import { Field } from "../ui/field"

interface EditItemProps {
  item: ItemPublic
  width?: string
  justifyContent?: string
  onlyInfo?: boolean
  size?: "xs" | "sm" | "md" | "lg"
  variant?: "ghost" | "outline" | "solid" | "subtle"
  iconOnly?: boolean
}

interface FormValues {
  title: string
  description?: string
  author?: string
  item_type?: string
  isbn?: string
  category?: string
  genre?: string
  extra_data: Record<string, any>
  info: {
    grade?: number
    physical_description?: string
    [key: string]: any
  }
  image_url?: string
  work_info?: {
    tags?: string
  }
}

const MAX_FILE_SIZE = 1 * 1024 * 1024 // 1MB

const EditItem = ({
  item,
  width,
  justifyContent,
  onlyInfo = false,
  size = "sm",
  variant = "ghost",
  iconOnly = false,
}: EditItemProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [imageFile, setImageFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Color mode responsive styles for raw HTML elements
  const selectBg = useColorModeValue("white", "gray.800")
  const selectColor = useColorModeValue("black", "white")
  const selectBorder = useColorModeValue("#ccc", "gray.600")

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      title: item.title,
      description: item.description ?? "",
      author: item.author ?? "",
      item_type: item.item_type as any,
      isbn: item.isbn || (item.extra_data as any)?.isbn || "",
      category: item.category || (item.extra_data as any)?.category || "",
      genre: item.genre || (item.extra_data as any)?.genre || "",
      extra_data: (() => {
        const { isbn, category, genre, ...rest } =
          (item.extra_data as any) || {}
        return rest
      })(),
      info: (item.info as any) || { grade: 10, physical_description: "" },
      image_url: item.image_url ?? "",
      work_info: {
        tags: item.subject || item.work_metadata?.tags?.join(", ") || "",
      },
    },
  })

  const itemType = watch("item_type")
  const description = watch("description") || ""
  const selectedCategory = watch("category")

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    if (file && file.size > MAX_FILE_SIZE) {
      showErrorToast("Image size exceeds the 1MB limit.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }
    setImageFile(file)
  }

  const mutation = useMutation({
    mutationFn: async (data: {
      formData: Body_items_update_item
      workInfo: any
    }) => {
      const updatedItem = await ItemsService.updateItem({
        id: item.id,
        formData: data.formData,
      })

      // Update work metadata if author/title are present and tags were modified
      if (data.workInfo && updatedItem.author) {
        await ItemsService.updateWorkMetadata({
          author: updatedItem.author,
          title: updatedItem.title,
          requestBody: data.workInfo,
        })
      }
      return updatedItem
    },
    onSuccess: () => {
      showSuccessToast("Item updated successfully.")
      setImageFile(null)
      setIsOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
  })

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    const itemData: Body_items_update_item = {
      title: data.title,
      description: data.description,
      author: data.author,
      item_type: data.item_type as any,
      isbn: data.isbn,
      category: data.category,
      genre: data.genre,
      subject: data.work_info?.tags,
      extra_data: JSON.stringify(data.extra_data || {}),
      info: JSON.stringify(data.info || {}),
      image: imageFile,
      image_url: data.image_url,
    } as any

    const formattedWorkInfo = data.work_info?.tags
      ? {
          tags: data.work_info.tags
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t),
        }
      : null

    mutation.mutate({ formData: itemData, workInfo: formattedWorkInfo })
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
      size={itemType === "book" && !onlyInfo ? "lg" : { base: "xs", md: "md" }}
      placement="center"
      open={isOpen}
      onOpenChange={({ open }) => setIsOpen(open)}
      scrollBehavior="inside"
    >
      <DialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          width={width}
          justifyContent={justifyContent}
          onClick={(e) => e.stopPropagation()}
        >
          {onlyInfo ? (
            <FaPen fontSize="16px" />
          ) : (
            <FaExchangeAlt fontSize="16px" />
          )}
          {!iconOnly && (onlyInfo ? "Update Info" : "Edit Item")}
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>
            {onlyInfo ? "Update Copy Specifics" : "Edit Item"}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <VStack
            as="form"
            id="edit-item-form"
            gap={4}
            align="stretch"
            onSubmit={handleSubmit(onSubmit)}
          >
            <Text mb={2}>
              {onlyInfo
                ? "Update the condition and notes for your copy."
                : "Update the item details below."}
            </Text>

            {!onlyInfo && (
              <>
                <Field
                  label="Item Type"
                  required
                  invalid={!!errors.item_type}
                  errorText={errors.item_type?.message}
                >
                  <select
                    id="edit_item_type"
                    {...register("item_type", {
                      required: "Item type is required",
                    })}
                    style={selectStyle}
                  >
                    <option value="" style={{ backgroundColor: selectBg }}>
                      -- select item type --
                    </option>
                    <option
                      value="general"
                      style={{ backgroundColor: selectBg }}
                    >
                      General
                    </option>
                    <option value="book" style={{ backgroundColor: selectBg }}>
                      Book
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
                    id="edit_title"
                    {...register("title", {
                      required: "Title is required",
                    })}
                    placeholder="Title"
                    type="text"
                  />
                </Field>

                <Field
                  invalid={!!errors.description}
                  errorText={errors.description?.message}
                  label="Description"
                  helperText={
                    <HStack justify="space-between" width="full">
                      <Text fontSize="xs">Brief summary of the item.</Text>
                      <Text
                        fontSize="xs"
                        color={
                          description.length > 2000 ? "red.500" : "inherit"
                        }
                      >
                        {description.length}/2000
                      </Text>
                    </HStack>
                  }
                >
                  <Textarea
                    id="edit_description"
                    {...register("description", {
                      maxLength: {
                        value: 2000,
                        message: "Maximum 2000 characters",
                      },
                    })}
                    placeholder="Description"
                    rows={5}
                  />
                </Field>
              </>
            )}

            {itemType === "book" && !onlyInfo && (
              <>
                <Field label="Author">
                  <Input
                    id="edit_author"
                    placeholder="Author"
                    {...register("author")}
                  />
                </Field>

                <Separator />
                <Text fontWeight="bold" fontSize="sm" color="ui.hover">
                  Universal Work Info
                </Text>
                <Field
                  label="Subjects"
                  helperText="Comma separated (e.g. love, war, peace)"
                >
                  <Input
                    id="edit_subjects"
                    placeholder="love, war, peace"
                    {...register("work_info.tags")}
                  />
                </Field>

                <Separator />

                <Field label="ISBN">
                  <Input
                    id="edit_isbn"
                    placeholder="ISBN"
                    {...register("isbn")}
                  />
                </Field>
                <HStack width="full" gap={4}>
                  <Field label="Category" flex={1}>
                    <select
                      id="edit_category"
                      {...register("category")}
                      style={selectStyle}
                    >
                      <option value="" style={{ backgroundColor: selectBg }}>
                        Select Category
                      </option>
                      {Object.keys(BOOK_CLASSIFICATION).map((cat) => (
                        <option
                          key={cat}
                          value={cat}
                          style={{ backgroundColor: selectBg }}
                        >
                          {cat}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Genre" flex={1}>
                    <select
                      id="edit_genre"
                      {...register("genre")}
                      style={selectStyle}
                      disabled={!selectedCategory}
                    >
                      <option value="" style={{ backgroundColor: selectBg }}>
                        Select Genre
                      </option>
                      {selectedCategory &&
                        BOOK_CLASSIFICATION[selectedCategory]?.map((genre) => (
                          <option
                            key={genre}
                            value={genre}
                            style={{ backgroundColor: selectBg }}
                          >
                            {genre}
                          </option>
                        ))}
                    </select>
                  </Field>
                </HStack>
              </>
            )}

            {/* Conditional Rendering for Copy Specifics */}
            {onlyInfo ? (
              <VStack align="stretch" gap={4} width="full">
                <Field
                  label="Condition Grade (1-10)"
                  helperText="10 = Brand New, 1 = Very Poor"
                >
                  <Input
                    id="edit_grade"
                    type="number"
                    min={1}
                    max={10}
                    {...register("info.grade")}
                  />
                </Field>

                <Field label="Condition / Physical Description">
                  <Textarea
                    id="edit_physical_description"
                    placeholder="Explain the physical state of your copy (e.g. 'Signed by author', 'Slightly torn cover')"
                    {...register("info.physical_description")}
                    rows={4}
                  />
                </Field>
              </VStack>
            ) : (
              <>
                {/* Toggle for Full Mode */}
                {!showAdditionalInfo ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAdditionalInfo(true)}
                    width="full"
                    mt={2}
                  >
                    Update Additional Info (Condition, Notes)
                  </Button>
                ) : (
                  <VStack
                    align="stretch"
                    gap={4}
                    animation="fade-in 0.2s"
                    width="full"
                  >
                    <Flex justify="space-between" align="center">
                      <Text fontWeight="bold" fontSize="sm" color="ui.hover">
                        Your Copy Specifics
                      </Text>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setShowAdditionalInfo(false)}
                        color="fg.muted"
                      >
                        Hide
                      </Button>
                    </Flex>

                    <Field
                      label="Condition Grade (1-10)"
                      helperText="10 = Brand New, 1 = Very Poor"
                    >
                      <Input
                        id="edit_grade_full"
                        type="number"
                        min={1}
                        max={10}
                        {...register("info.grade")}
                      />
                    </Field>

                    <Field label="Condition / Physical Description">
                      <Textarea
                        id="edit_physical_description_full"
                        placeholder="Explain the physical state of your copy (e.g. 'Signed by author', 'Slightly torn cover')"
                        {...register("info.physical_description")}
                        rows={2}
                      />
                    </Field>
                  </VStack>
                )}
              </>
            )}

            {!onlyInfo && (
              <>
                <Field label="Upload New Image">
                  {item.image_url && !imageFile && (
                    <Box mb={2}>
                      <Image
                        src={getImageUrl(item.image_url)}
                        alt="Current"
                        height="100px"
                        objectFit="cover"
                        borderRadius="md"
                      />
                    </Box>
                  )}
                  <Input
                    id="edit_image_file"
                    name="edit_image_file"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    ref={fileInputRef}
                  />
                </Field>

                <Field label="Image URL">
                  <Input
                    id="edit_image_url"
                    placeholder="https://example.com/image.jpg"
                    {...register("image_url")}
                  />
                </Field>
              </>
            )}
          </VStack>
        </DialogBody>
        <DialogFooter gap={3}>
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
            type="submit"
            form="edit-item-form"
            colorPalette="accent"
            loading={isSubmitting}
            disabled={description.length > 2000}
          >
            Save Changes
          </Button>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default EditItem
