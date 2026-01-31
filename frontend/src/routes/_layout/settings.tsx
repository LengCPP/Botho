import {
  Box,
  Heading,
  Tabs,
  Text,
  useBreakpointValue,
} from "@chakra-ui/react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { FiAlertTriangle, FiLock, FiSettings } from "react-icons/fi"
import { z } from "zod"

import ChangePassword from "@/components/UserSettings/ChangePassword"
import DeleteAccount from "@/components/UserSettings/DeleteAccount"
import UserPreferences from "@/components/UserSettings/UserPreferences"
import useAuth from "@/hooks/useAuth"

const settingsSearchSchema = z.object({
  tab: z.enum(["preferences", "password", "danger-zone"]).optional(),
})

export const Route = createFileRoute("/_layout/settings")({
  component: UserSettings,
  validateSearch: (search) => settingsSearchSchema.parse(search),
})

function UserSettings() {
  const { user: currentUser } = useAuth()
  const isMobile = useBreakpointValue({ base: true, md: false })
  const navigate = useNavigate({ from: Route.fullPath })
  const { tab } = Route.useSearch()

  if (!currentUser) {
    return null
  }

  const handleTabChange = (value: string) => {
    navigate({
      search: (prev: any) => ({ ...prev, tab: value }),
      replace: true,
    })
  }

  return (
    <Box maxW="100vw" overflowX="hidden" py={8} px={{ base: 2, md: 4 }}>
      <Heading size="lg" mb={8} px={2}>
        Settings
      </Heading>

      <Tabs.Root
        value={tab || "preferences"}
        onValueChange={(e) => handleTabChange(e.value)}
        orientation={isMobile ? "horizontal" : "vertical"}
        variant="line"
        colorPalette="teal"
      >
        <Tabs.List
          width={isMobile ? "full" : "250px"}
          borderRightWidth={isMobile ? 0 : "1px"}
          borderBottomWidth={isMobile ? "1px" : 0}
          mr={isMobile ? 0 : 8}
          mb={isMobile ? 8 : 0}
          display="flex"
          flexDirection={isMobile ? "row" : "column"}
          whiteSpace="nowrap"
          justifyContent="space-around"
        >
          <Text
            fontWeight="bold"
            fontSize="xs"
            color="gray.500"
            mb={2}
            px={4}
            textTransform="uppercase"
            display={isMobile ? "none" : "block"}
          >
            Configuration
          </Text>
          <Tabs.Trigger
            value="preferences"
            justifyContent={isMobile ? "center" : "flex-start"}
            flex="1"
            flexDirection={isMobile ? "column" : "row"}
            gap={isMobile ? 1 : 2}
            fontSize={isMobile ? "10px" : "sm"}
            px={isMobile ? 1 : 4}
            py={isMobile ? 3 : 2}
          >
            <FiSettings size={isMobile ? "18px" : "16px"} />
            <Text>Preferences</Text>
          </Tabs.Trigger>
          <Tabs.Trigger
            value="password"
            justifyContent={isMobile ? "center" : "flex-start"}
            flex="1"
            flexDirection={isMobile ? "column" : "row"}
            gap={isMobile ? 1 : 2}
            fontSize={isMobile ? "10px" : "sm"}
            px={isMobile ? 1 : 4}
            py={isMobile ? 3 : 2}
          >
            <FiLock size={isMobile ? "18px" : "16px"} />
            <Text>{isMobile ? "Security" : "Security"}</Text>
          </Tabs.Trigger>
          <Tabs.Trigger
            value="danger-zone"
            justifyContent={isMobile ? "center" : "flex-start"}
            color="red.500"
            flex="1"
            flexDirection={isMobile ? "column" : "row"}
            gap={isMobile ? 1 : 2}
            fontSize={isMobile ? "10px" : "sm"}
            px={isMobile ? 1 : 4}
            py={isMobile ? 3 : 2}
          >
            <FiAlertTriangle size={isMobile ? "18px" : "16px"} />
            <Text>{isMobile ? "Danger" : "Danger Zone"}</Text>
          </Tabs.Trigger>
        </Tabs.List>

        <Box flex="1" width="full" overflow="hidden">
          <Tabs.Content value="preferences" p={0}>
            <UserPreferences />
          </Tabs.Content>
          <Tabs.Content value="password" p={0}>
            <ChangePassword />
          </Tabs.Content>
          <Tabs.Content value="danger-zone" p={0}>
            <DeleteAccount />
          </Tabs.Content>
        </Box>
      </Tabs.Root>
    </Box>
  )
}
