import { Button } from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FiTrash2 } from "react-icons/fi"

import { Items } from "@/client"
import useCustomToast from "@/hooks/useCustomToast"
import ConfirmationModal from "../Common/ConfirmationModal"

interface DeleteItemProps {
  id: string
  width?: string
  justifyContent?: string
  size?: "xs" | "sm" | "md" | "lg"
  variant?: string
}

const DeleteItem = ({
  id,
  width,
  justifyContent,
  size = "sm",
  variant,
}: DeleteItemProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const deleteItem = async (id: string) => {
    await Items.deleteItem({ id: id })
  }

  const mutation = useMutation({
    mutationFn: deleteItem,
    onSuccess: () => {
      showSuccessToast("The item was deleted successfully")
      setIsOpen(false)
    },
    onError: () => {
      showErrorToast("An error occurred while deleting the item")
    },
    onSettled: () => {
      queryClient.invalidateQueries()
    },
  })

  const handleDelete = () => {
    const dontShow = localStorage.getItem("skipConfirm_delete") === "true"
    if (dontShow) {
      mutation.mutate(id)
    } else {
      setIsOpen(true)
    }
  }

  const onConfirm = (dontShowAgain?: boolean) => {
    if (dontShowAgain) {
      localStorage.setItem("skipConfirm_delete", "true")
    }
    mutation.mutate(id)
  }

  return (
    <>
      <Button
        variant={(variant || "dangerSecondary") as any}
        size={size}
        width={width}
        justifyContent={justifyContent}
        onClick={(e) => {
          e.stopPropagation()
          handleDelete()
        }}
        disabled={mutation.isPending}
      >
        <FiTrash2 fontSize="16px" />
        Delete Item
      </Button>

      <ConfirmationModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={onConfirm}
        title="Delete Item"
        message="This item will be permanently deleted. Are you sure? You will not be able to undo this action."
        isLoading={mutation.isPending}
        colorPalette="red"
      />
    </>
  )
}

export default DeleteItem
