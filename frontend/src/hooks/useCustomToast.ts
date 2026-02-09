"use client"

import { toaster } from "@/components/ui/toaster"

const useCustomToast = () => {
  const showSuccessToast = (description: string) => {
    toaster.create({
      title: "Success",
      description,
      type: "success",
      duration: 4000,
      meta: {
        closable: true,
      },
    })
  }

  const showErrorToast = (description: string) => {
    toaster.create({
      title: "Error",
      description,
      type: "error",
      duration: 6000,
      meta: {
        closable: true,
      },
    })
  }

  return { showSuccessToast, showErrorToast }
}

export default useCustomToast
