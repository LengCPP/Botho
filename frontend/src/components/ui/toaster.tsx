"use client"

import {
  Toaster as ChakraToaster,
  Portal,
  Spinner,
  Stack,
  Toast,
  createToaster,
} from "@chakra-ui/react"
import { FiCheckCircle, FiInfo, FiXCircle } from "react-icons/fi"

export const toaster = createToaster({
  placement: "top-end",
  pauseOnPageIdle: true,
})

export const Toaster = () => {
  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: "4" }}>
        {(toast) => {
          const isSuccess = toast.type === "success"
          const isError = toast.type === "error"
          const baseColor = isSuccess ? "main" : isError ? "accent" : "gray"

          return (
            <Toast.Root 
              width={{ md: "sm" }} 
              bg="bg.panel"
              borderWidth="1px"
              borderColor={`${baseColor}.muted`}
              borderLeftWidth="4px"
              borderLeftColor={`${baseColor}.solid`}
              boxShadow="lg"
              borderRadius="md"
              color="fg"
            >
              {toast.type === "loading" ? (
                <Spinner size="sm" color="main.solid" />
              ) : (
                <Toast.Indicator color={`${baseColor}.solid`}>
                  {isSuccess && <FiCheckCircle />}
                  {isError && <FiXCircle />}
                  {!isSuccess && !isError && <FiInfo />}
                </Toast.Indicator>
              )}
              <Stack gap="1" flex="1" maxWidth="100%">
                {toast.title && (
                  <Toast.Title fontWeight="bold" color={`${baseColor}.fg`}>
                    {toast.title}
                  </Toast.Title>
                )}
                {toast.description && (
                  <Toast.Description color="fg.muted" fontSize="sm">
                    {toast.description}
                  </Toast.Description>
                )}
              </Stack>
              {toast.action && (
                <Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>
              )}
              {toast.meta?.closable && <Toast.CloseTrigger color="fg.muted" />}
            </Toast.Root>
          )
        }}
      </ChakraToaster>
    </Portal>
  )
}
