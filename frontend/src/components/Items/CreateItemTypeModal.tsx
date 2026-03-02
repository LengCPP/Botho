import {
  Button,
  Grid,
  HStack,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { Types } from "@/client"
import useCustomToast from "@/hooks/useCustomToast"
import { Checkbox } from "@/components/ui/checkbox"
import { Field } from "@/components/ui/field"
import {
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog"

// All available fields users can enable for a custom type
const AVAILABLE_FIELDS: { key: string; label: string; group: string }[] = [
  // Identity / Description
  { key: "description", label: "Description", group: "Identity" },
  { key: "brand", label: "Brand", group: "Identity" },
  { key: "publisher", label: "Publisher", group: "Identity" },
  { key: "series", label: "Series", group: "Identity" },
  { key: "model_number", label: "Model Number", group: "Identity" },
  { key: "edition", label: "Edition", group: "Identity" },
  { key: "year", label: "Year", group: "Identity" },
  // Physical
  { key: "weight", label: "Weight", group: "Physical" },
  { key: "dimensions", label: "Dimensions", group: "Physical" },
  { key: "color", label: "Color", group: "Physical" },
  { key: "material", label: "Material", group: "Physical" },
  { key: "pieces_count", label: "Pieces Count", group: "Physical" },
  { key: "format", label: "Format", group: "Physical" },
  // Audience / Use
  { key: "age_group", label: "Age Group", group: "Audience" },
  { key: "player_count", label: "Player Count", group: "Audience" },
  { key: "platform", label: "Platform", group: "Audience" },
  { key: "language", label: "Language", group: "Audience" },
  // Condition / Tags
  { key: "condition_notes", label: "Condition Notes", group: "Condition" },
  { key: "category", label: "Category", group: "Condition" },
  { key: "genre", label: "Genre", group: "Condition" },
  { key: "subject", label: "Subject Tags", group: "Condition" },
]

const LABEL_FIELD_OPTIONS = [
  "title",
  "brand",
  "model_number",
  "series",
]

interface CreateItemTypeModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: (slug: string) => void
}


export function CreateItemTypeModal({
  isOpen,
  onClose,
  onCreated,
}: CreateItemTypeModalProps) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [name, setName] = useState("")
  const [enabledFields, setEnabledFields] = useState<string[]>([])
  const [labelField, setLabelField] = useState("title")

  const mutation = useMutation({
    mutationFn: (body: { name: string; enabled_fields: string[]; label_field: string }) =>
      Types.createItemType({ itemTypeDefinitionCreate: body }),
    onSuccess: (data) => {
      showSuccessToast(`Item type "${data.name}" created.`)
      queryClient.invalidateQueries({ queryKey: ["item-type-definitions"] })
      onCreated?.(data.slug)
      handleClose()
    },
    onError: (err: Error) => {
      showErrorToast(err.message)
    },
  })

  const handleClose = () => {
    setName("")
    setEnabledFields([])
    setLabelField("title")
    onClose()
  }

  const handleSubmit = () => {
    if (!name.trim()) {
      showErrorToast("Type name is required")
      return
    }
    mutation.mutate({ name: name.trim(), enabled_fields: enabledFields, label_field: labelField })
  }

  const groups = Array.from(new Set(AVAILABLE_FIELDS.map((f) => f.group)))

  return (
    <DialogRoot
      size="lg"
      placement="center"
      open={isOpen}
      onOpenChange={({ open }) => !open && handleClose()}
      scrollBehavior="inside"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Item Type</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <VStack gap={5} align="stretch">
            <Field id="type-name" label="Type Name" required>
              <Input
                id="type-name"
                placeholder='e.g. "Board Game", "Power Tool"'
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <VStack align="stretch" gap={1}>
              <Text fontSize="sm" fontWeight="medium">Primary Label Field</Text>
              <Text fontSize="xs" color="fg.muted">
                Which field should serve as the main identifier for this type?
              </Text>
              <select
                id="label-field"
                value={labelField}
                onChange={(e) => setLabelField(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                }}
              >
                {LABEL_FIELD_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </VStack>

            <VStack align="stretch" gap={2}>
              <Text fontSize="sm" fontWeight="medium">Enabled Fields</Text>
              <Text fontSize="xs" color="fg.muted">
                Select which fields apply to this item type. Title is always included.
              </Text>
              <VStack align="stretch" gap={3}>
                {groups.map((group) => (
                  <VStack key={group} align="stretch" gap={1}>
                    <Text fontSize="xs" fontWeight="bold" color="fg.muted">
                      {group}
                    </Text>
                    <Grid templateColumns="repeat(2, 1fr)" gap={2}>
                      {AVAILABLE_FIELDS.filter((f) => f.group === group).map((field) => (
                        <Checkbox
                          key={field.key}
                          checked={enabledFields.includes(field.key)}
                          onCheckedChange={({ checked }) => {
                            if (checked) {
                              setEnabledFields((prev) => [...prev, field.key])
                            } else {
                              setEnabledFields((prev) =>
                                prev.filter((f) => f !== field.key),
                              )
                            }
                          }}
                        >
                          {field.label}
                        </Checkbox>
                      ))}
                    </Grid>
                  </VStack>
                ))}
              </VStack>
            </VStack>
          </VStack>
        </DialogBody>
        <DialogFooter>
          <HStack gap={3}>
            <DialogActionTrigger asChild>
              <Button variant="subtle" colorPalette="gray" onClick={handleClose}>
                Cancel
              </Button>
            </DialogActionTrigger>
            <Button
              colorPalette="accent"
              onClick={handleSubmit}
              loading={mutation.isPending}
              disabled={!name.trim()}
            >
              Create Type
            </Button>
          </HStack>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}
