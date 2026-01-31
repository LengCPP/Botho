import {
  Box,
  Button,
  ButtonGroup,
  DialogActionTrigger,
  Flex,
  HStack,
  Image,
  Input,
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
import useCustomToast from "@/hooks/useCustomToast"
import { getImageUrl, handleError } from "@/utils"
import {
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
}

const BOOK_CLASSIFICATION: Record<string, string[]> = {
  Fiction: [
    "Fantasy",
    "Science Fiction (Sci-Fi)",
    "Mystery & Crime",
    "Thriller & Suspense",
    "Romance",
    "Historical Fiction",
    "Horror",
    "Literary Fiction",
    "Adventure",
    "Dystopian",
    "Graphic Novels & Comics",
    "Westerns",
  ],
  "Non-Fiction": [
    "Biography & Memoir",
    "Self-Help & Personal Development",
    "History",
    "Science & Nature",
    "Business & Money",
    "Health & Fitness",
    "Travel",
    "Cookbooks & Food",
    "Religion & Spirituality",
    "Philosophy",
    "Politics & Social Sciences",
    "True Crime",
    "Art & Photography",
    "Essays & Criticism",
  ],
  "Children's & Young Adult": [
    "Board Books",
    "Picture Books",
    "Early Readers",
    "Middle Grade",
    "Young Adult (YA)",
  ],
  "Academic & Professional": [
    "Textbooks",
    "Reference (Dictionaries, Encyclopedias)",
    "Medical",
    "Law",
    "Computer Science & Technology",
    "Engineering",
  ],
}

const EditItem = ({
  item,
  width,
  justifyContent,
  onlyInfo = false,
}: EditItemProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()

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
  } = useForm<ItemPublic>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      ...item,
      description: item.description ?? undefined,
      image_url: item.image_url ?? "",
      info: item.info || { grade: 10, physical_description: "" },
    },
  })

  const itemType = watch("item_type")
  const description = watch("description") || ""
  const selectedCategory = watch("extra_data.category" as any)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageFile(e.target.files?.[0] || null)
  }

  const mutation = useMutation({
    mutationFn: (data: Body_items_update_item) =>
      ItemsService.updateItem({ id: item.id, formData: data }),
    onSuccess: () => {
      showSuccessToast("Item updated successfully.")
      reset()
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

  const onSubmit: SubmitHandler<ItemPublic> = async (data) => {
    const itemData: Body_items_update_item = {
      title: data.title,
      description: data.description,
      item_type: data.item_type,
      extra_data: JSON.stringify(data.extra_data || {}),
      info: JSON.stringify(data.info || {}),
      image: imageFile,
      image_url: data.image_url,
    }
    mutation.mutate(itemData)
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
        <Button variant="ghost" width={width} justifyContent={justifyContent}>
          {onlyInfo ? (
            <FaPen fontSize="16px" />
          ) : (
            <FaExchangeAlt fontSize="16px" />
          )}
          {onlyInfo ? "Update Info" : "Edit Item"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>
              {onlyInfo ? "Update Copy Specifics" : "Edit Item"}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Text mb={4}>
              {onlyInfo
                ? "Update the condition and notes for your copy."
                : "Update the item details below."}
            </Text>
            <VStack gap={4}>
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
                      <option
                        value="book"
                        style={{ backgroundColor: selectBg }}
                      >
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
                            description.length > 1000 ? "red.500" : "inherit"
                          }
                        >
                          {description.length}/1000
                        </Text>
                      </HStack>
                    }
                  >
                    <Textarea
                      id="edit_description"
                      {...register("description", {
                        maxLength: {
                          value: 1000,
                          message: "Maximum 1000 characters",
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
                      {...register("extra_data.author" as any)}
                    />
                  </Field>
                  <Field label="ISBN">
                    <Input
                      id="edit_isbn"
                      placeholder="ISBN"
                      {...register("extra_data.isbn" as any)}
                    />
                  </Field>
                  <HStack width="full" gap={4}>
                    <Field label="Category" flex={1}>
                      <select
                        id="edit_category"
                        {...register("extra_data.category" as any)}
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
                        {...register("extra_data.genre" as any)}
                        style={selectStyle}
                        disabled={!selectedCategory}
                      >
                        <option value="" style={{ backgroundColor: selectBg }}>
                          Select Genre
                        </option>
                        {selectedCategory &&
                          BOOK_CLASSIFICATION[selectedCategory].map((genre) => (
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
                      type="number"
                      min={1}
                      max={10}
                      {...register("info.grade" as any)}
                    />
                  </Field>

                  <Field label="Condition / Physical Description">
                    <Textarea
                      placeholder="Explain the physical state of your copy (e.g. 'Signed by author', 'Slightly torn cover')"
                      {...register("info.physical_description" as any)}
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
                      mt={2}
                      p={2}
                      borderWidth="1px"
                      borderRadius="md"
                      borderColor={selectBorder}
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
                          type="number"
                          min={1}
                          max={10}
                          {...register("info.grade" as any)}
                        />
                      </Field>

                      <Field label="Condition / Physical Description">
                        <Textarea
                          placeholder="Explain the physical state of your copy (e.g. 'Signed by author', 'Slightly torn cover')"
                          {...register("info.physical_description" as any)}
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

          <DialogFooter gap={2}>
            <ButtonGroup>
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
                loading={isSubmitting}
                disabled={description.length > 1000}
              >
                Save
              </Button>
            </ButtonGroup>
          </DialogFooter>
        </form>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default EditItem
