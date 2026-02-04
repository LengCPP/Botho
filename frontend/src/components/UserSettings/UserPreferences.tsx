import { Box, Heading, Stack, VStack } from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTheme } from "next-themes"
import { useEffect } from "react"

import { UsersService } from "@/client"
import { Checkbox } from "@/components/ui/checkbox"
import { Radio, RadioGroup } from "@/components/ui/radio"
import type { UserPublicExtended, UserSettingsUpdate } from "@/customTypes"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { usePushNotifications } from "@/hooks/usePushNotifications"

const UserPreferences = () => {
  const { theme, setTheme } = useTheme()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const queryClient = useQueryClient()
  const { user: currentUserData } = useAuth()
  const currentUser = currentUserData as UserPublicExtended
  const {
    isSubscribed,
    subscribe,
    unsubscribe,
    isLoading: isPushLoading,
  } = usePushNotifications()

  const mutation = useMutation({
    mutationFn: (data: UserSettingsUpdate) =>
      UsersService.updateUserSettings({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Preferences updated.")
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    },
    onError: () => {
      showErrorToast("Failed to update preferences.")
    },
  })

  // Sync backend theme to local theme on load if different
  useEffect(() => {
    if (
      currentUser?.settings?.theme_mode &&
      currentUser.settings.theme_mode !== theme
    ) {
      setTheme(currentUser.settings.theme_mode)
    }
  }, [currentUser?.settings?.theme_mode, setTheme, theme])

  const handleThemeChange = (value: string) => {
    setTheme(value)
    mutation.mutate({ theme_mode: value })
  }

  const handleAutocompleteChange = (details: {
    checked: boolean | "indeterminate"
  }) => {
    mutation.mutate({ autocomplete_enabled: !!details.checked })
  }

  const handlePrivacyChange = (details: {
    checked: boolean | "indeterminate"
  }) => {
    mutation.mutate({
      ...currentUser?.settings,
      show_contact_details: !!details.checked,
    })
  }

  const handleShowNameChange = (details: {
    checked: boolean | "indeterminate"
  }) => {
    mutation.mutate({
      ...currentUser?.settings,
      show_full_name: !!details.checked,
    })
  }

  const handlePushChange = async (details: {
    checked: boolean | "indeterminate"
  }) => {
    if (details.checked) {
      await subscribe()
    } else {
      await unsubscribe()
    }
  }

  return (
    <Box width="full" px={2}>
      <Heading size="sm" py={4}>
        Preferences
      </Heading>

      <VStack align="start" gap={6}>
        <VStack align="start" gap={2}>
          <Heading size="xs">Appearance</Heading>
          <RadioGroup
            onValueChange={(e) => handleThemeChange(e.value)}
            value={theme}
            colorPalette="teal"
          >
            <Stack>
              <Radio value="system">System</Radio>
              <Radio value="light">Light Mode</Radio>
              <Radio value="dark">Dark Mode</Radio>
            </Stack>
          </RadioGroup>
        </VStack>

        <VStack align="start" gap={2}>
          <Heading size="xs">Notifications</Heading>
          <Checkbox
            checked={isSubscribed}
            onCheckedChange={handlePushChange}
            disabled={isPushLoading}
          >
            Enable Browser Push Notifications
          </Checkbox>
        </VStack>

        <VStack align="start" gap={2}>
          <Heading size="xs">Privacy</Heading>
          <Checkbox
            checked={currentUser?.settings?.show_full_name ?? false}
            onCheckedChange={handleShowNameChange}
          >
            Show full name to others
          </Checkbox>
          <Checkbox
            checked={currentUser?.settings?.show_contact_details ?? false}
            onCheckedChange={handlePrivacyChange}
          >
            Show contact details (Email) to others
          </Checkbox>
        </VStack>

        <VStack align="start" gap={2}>
          <Heading size="xs">General</Heading>
          <Checkbox
            checked={currentUser?.settings?.autocomplete_enabled ?? true}
            onCheckedChange={handleAutocompleteChange}
          >
            Enable Autocomplete
          </Checkbox>
        </VStack>
      </VStack>
    </Box>
  )
}
export default UserPreferences
