import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Input,
  Separator,
  Tabs,
  Text,
  Textarea,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react"
import { useEffect, useRef, useState } from "react"
import { FaPlus } from "react-icons/fa"
import { FiCamera } from "react-icons/fi"

import {
  type Body_items_create_item,
  CommunitiesService,
  ItemsService,
  UtilsService,
} from "@/client"
import type { ApiError } from "@/client/core/ApiError"
import { BookSearchInput } from "@/components/BookSearchInput"
import BarcodeScanner from "@/components/Common/BarcodeScanner"
import { useColorModeValue } from "@/components/ui/color-mode"
import { BOOK_CLASSIFICATION } from "@/constants"
import useAuth from "@/hooks/useAuth"
import { type BookResult, useIsbnSearch } from "@/hooks/useBookSearch"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"
import {
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog"
import { Field } from "../ui/field"

interface ItemCreate {
  title: string
  description?: string
  item_type?: string
  author?: string
  isbn?: string
  category?: string
  genre?: string
  subject?: string
  info?: {
    grade?: number
    physical_description?: string
  }
  work_info?: {
    tags?: string
  }
  image_url?: string
}

const MAX_FILE_SIZE = 1 * 1024 * 1024 // 1MB

const AddItem = ({
  communityId,
  isAdmin,
}: {
  communityId?: string
  collectionId?: string
  isAdmin?: boolean
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false)
  const [mode, setMode] = useState<"create" | "pool">("pool")
  const [searchQuery, setSearchQuery] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [scannedIsbn, setScannedIsbn] = useState("")

  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const isMobile = useBreakpointValue({ base: true, md: false })

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
    setValue,
    formState: { errors, isValid, isSubmitting },
  } = useForm<ItemCreate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      title: "",
      description: "",
      item_type: "",
      author: "",
      isbn: "",
      category: "",
      genre: "",
      subject: "",
      extra_data: {},
      info: {
        grade: 10,
        physical_description: "",
      },
      work_info: {
        tags: "",
      },
      image_url: "",
    },
  })

  const itemType = watch("item_type")
  const description = watch("description") || ""
  const selectedCategory = watch("category")

  const { data: myItems } = useQuery({
    queryKey: ["my-items-for-community"],
    queryFn: () =>
      ItemsService.readItems({
        ownerId: currentUser?.id,
      }),
    enabled: isOpen && !!communityId && mode === "pool" && !!currentUser,
  })

  const { data: isbnResults, isLoading: isSearchingIsbn } =
    useIsbnSearch(scannedIsbn)

  useEffect(() => {
    if (isbnResults && isbnResults.length > 0) {
      handleBookSelect(isbnResults[0])
      setScannedIsbn("")
      showSuccessToast("Book details populated from barcode!")
    } else if (scannedIsbn && !isSearchingIsbn && isbnResults?.length === 0) {
      showErrorToast(`Could not find book with ISBN: ${scannedIsbn}`)
      setScannedIsbn("")
    }
  }, [isbnResults, isSearchingIsbn])

  const poolMutation = useMutation({
    mutationFn: (itemId: string) =>
      CommunitiesService.addItemToCommunity({ id: communityId!, itemId }),
    onSuccess: () => {
      showSuccessToast("Item added to community pool!")
      queryClient.invalidateQueries({
        queryKey: ["communityItems", communityId],
      })
    },
    onError: () => showErrorToast("Failed to add item"),
  })

  const handleBookSelect = async (book: BookResult) => {
    setValue("title", book.title, { shouldValidate: true })
    setValue("description", book.description.substring(0, 2000))
    setValue("author", book.authors.join(", "))
    setValue("isbn", book.isbn)
    setValue("image_url", book.thumbnail)
    setValue("item_type", "book")

    // Map classification via backend
    if (book.categories && book.categories.length > 0) {
      try {
        const mapping = (await UtilsService.mapClassification({
          q: book.categories[0],
        })) as { category?: string; genre?: string; subject?: string }

        if (mapping.category) {
          setValue("category", mapping.category)
          if (mapping.genre) {
            setValue("genre", mapping.genre)
          }
        } else if (mapping.subject) {
          setValue("subject", mapping.subject)
          const currentTags = watch("work_info.tags")
          const newTags = currentTags
            ? `${currentTags}, ${mapping.subject}`
            : mapping.subject
          setValue("work_info.tags", newTags)
        }
      } catch (e) {
        console.error("Failed to map classification:", e)
      }
    }
  }

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
    mutationFn: async (data: any) => {
      const newItem = await ItemsService.createItem({ formData: data.formData })

      // If work info is provided, update work metadata
      if (data.workInfo && newItem.author) {
        await ItemsService.updateWorkMetadata({
          author: newItem.author,
          title: newItem.title,
          requestBody: data.workInfo,
        })
      }

      return newItem
    },
    onSuccess: (_newItem) => {
      showSuccessToast(
        communityId
          ? "Community item created successfully."
          : "Item created successfully.",
      )

      reset()
      setImageFile(null)
      setIsOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] })
      if (communityId) {
        queryClient.invalidateQueries({
          queryKey: ["communityItems", communityId],
        })
      }
    },
  })

  const onSubmit: SubmitHandler<ItemCreate> = async (data) => {
    const itemData: Body_items_create_item = {
      title: data.title,
      description: data.description,
      author: data.author,
      item_type: data.item_type as any,
      isbn: data.isbn,
      category: data.category,
      genre: data.genre,
      subject: data.subject,
      extra_data: JSON.stringify(data.extra_data || {}),
      info: JSON.stringify(data.info || {}),
      image: imageFile,
      image_url: data.image_url,
      community_owner_id: communityId,
    }

    const formattedWorkInfo = data.work_info?.tags
      ? {
          tags: data.work_info.tags
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t),
        }
      : null

    mutation.mutate({
      formData: itemData,
      workInfo: formattedWorkInfo,
    })
  }

  const filteredItems = myItems?.data.filter((item: any) => {
    const matchesSearch = item.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
    const alreadyInCommunity = item.communities?.some(
      (c: any) => c.id === communityId,
    )
    return matchesSearch && !alreadyInCommunity
  })

  const selectStyle = {
    width: "100%",
    padding: "8px",
    borderRadius: "4px",
    border: `1px solid ${selectBorder}`,
    backgroundColor: selectBg,
    color: selectColor,
  }

  const creationFormContent = (
    <form onSubmit={handleSubmit(onSubmit)}>
      <VStack gap={4} align="stretch">
        {isScanning && (
          <BarcodeScanner
            onScan={(code) => {
              setScannedIsbn(code)
              setIsScanning(false)
            }}
            onClose={() => setIsScanning(false)}
          />
        )}
        <Text fontSize="sm" color="fg.muted">
          {communityId
            ? "Create an item that is directly owned by the community itself."
            : "Fill in the details to add a new item."}
        </Text>
        <Field
          label="Item Type"
          required
          invalid={!!errors.item_type}
          errorText={errors.item_type?.message}
        >
          <HStack width="full">
            <select
              id="item_type"
              {...register("item_type", { required: "Item type is required" })}
              style={selectStyle}
            >
              <option value="" style={{ backgroundColor: selectBg }}>
                -- select item type --
              </option>
              <option value="general" style={{ backgroundColor: selectBg }}>
                General
              </option>
              <option value="book" style={{ backgroundColor: selectBg }}>
                Book
              </option>
            </select>
            {itemType === "book" && (
              <IconButton
                aria-label="Scan Barcode"
                variant="outline"
                colorPalette="accent"
                onClick={() => setIsScanning(true)}
                flexShrink={0}
              >
                <FiCamera />
              </IconButton>
            )}
          </HStack>
        </Field>

        <Field
          required
          invalid={!!errors.title}
          errorText={errors.title?.message}
          label="Title"
        >
          {itemType === "book" ? (
            <BookSearchInput
              id="title"
              name="title"
              value={watch("title")}
              onChange={(val) =>
                setValue("title", val, { shouldValidate: true })
              }
              onSelect={handleBookSelect}
            />
          ) : (
            <Input
              id="title"
              {...register("title", {
                required: "Title is required.",
              })}
              placeholder="Title"
              type="text"
            />
          )}
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
                color={description.length > 2000 ? "red.500" : "inherit"}
              >
                {description.length}/2000
              </Text>
            </HStack>
          }
        >
          <Textarea
            id="description"
            {...register("description", {
              maxLength: {
                value: 2000,
                message: "Maximum 2000 characters",
              },
            })}
            placeholder="Description"
            rows={3}
          />
        </Field>

        {itemType === "book" && (
          <>
            <Field label="Author">
              <Input id="author" placeholder="Author" {...register("author")} />
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
                id="subjects"
                placeholder="love, war, peace"
                {...register("work_info.tags" as any)}
              />
            </Field>

            <Separator />

            {!showAdditionalInfo ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAdditionalInfo(true)}
                width="full"
              >
                Add Additional Info (Condition, Notes)
              </Button>
            ) : (
              <VStack align="stretch" gap={4} animation="fade-in 0.2s">
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
                    id="grade"
                    type="number"
                    min={1}
                    max={10}
                    {...register("info.grade" as any)}
                  />
                </Field>

                <Field label="Condition / Physical Description">
                  <Textarea
                    id="physical_description"
                    placeholder="Explain the physical state of your copy (e.g. 'Signed by author', 'Slightly torn cover')"
                    {...register("info.physical_description" as any)}
                    rows={2}
                  />
                </Field>
              </VStack>
            )}

            <Field label="ISBN">
              <Input id="isbn" placeholder="ISBN" {...register("isbn")} />
            </Field>
            <HStack width="full" gap={4}>
              <Field label="Category" flex={1}>
                <select
                  id="category"
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
                  id="genre"
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

        <Field label="Upload Image">
          <Input
            id="image_file"
            name="image_file"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            ref={fileInputRef}
          />
        </Field>

        <Field label="Image URL (alternative)">
          <Input
            id="image_url"
            placeholder="https://example.com/image.jpg"
            {...register("image_url")}
          />
        </Field>

        <Flex width="full" justify="flex-end" gap={3} mt={4}>
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
            colorPalette="accent"
            disabled={!isValid || description.length > 2000}
            loading={isSubmitting}
          >
            Add Item
          </Button>
        </Flex>
      </VStack>
    </form>
  )

  return (
    <DialogRoot
      size={
        communityId || itemType === "book" ? "lg" : { base: "xs", md: "md" }
      }
      placement="center"
      open={isOpen}
      onOpenChange={({ open }) => setIsOpen(open)}
      scrollBehavior="inside"
    >
      <DialogTrigger asChild>
        <Button value="add-item" my={4}>
          <FaPlus fontSize="16px" />
          {isMobile ? "Item" : "New Item"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Item</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {communityId ? (
            <Tabs.Root
              value={mode}
              onValueChange={(e) => setMode(e.value as any)}
              variant="plain"
            >
              <Tabs.List mb={4} gap={4}>
                <Tabs.Trigger value="pool">From My Collection</Tabs.Trigger>
                {(isAdmin || !communityId) && (
                  <Tabs.Trigger value="create">New Item</Tabs.Trigger>
                )}
              </Tabs.List>

              <Tabs.Content value="pool">
                <VStack gap={4} align="stretch">
                  <Text fontSize="sm" color="fg.muted">
                    Make your own items available for community members to
                    borrow.
                  </Text>
                  <Input
                    id="search-my-items"
                    name="search-query"
                    placeholder="Search your items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <Box maxH="300px" overflowY="auto">
                    {filteredItems?.length === 0 ? (
                      <Text p={4} textAlign="center" color="fg.muted">
                        No items found.
                      </Text>
                    ) : (
                      <VStack align="stretch" gap={2}>
                        {filteredItems?.map((item) => (
                          <Flex
                            key={item.id}
                            p={3}
                            borderWidth="1px"
                            rounded="md"
                            justify="space-between"
                            align="center"
                          >
                            <Text fontWeight="medium">{item.title}</Text>
                            <Button
                              size="xs"
                              colorPalette="accent"
                              onClick={() => poolMutation.mutate(item.id)}
                              loading={poolMutation.isPending}
                            >
                              Pool Item
                            </Button>
                          </Flex>
                        ))}
                      </VStack>
                    )}
                  </Box>
                </VStack>
              </Tabs.Content>

              <Tabs.Content value="create">{creationFormContent}</Tabs.Content>
            </Tabs.Root>
          ) : (
            creationFormContent
          )}
        </DialogBody>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default AddItem
