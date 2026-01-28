import { Box, Flex, Text } from "@chakra-ui/react"
import { Link as RouterLink } from "@tanstack/react-router"
import { FiSettings } from "react-icons/fi"

import useAuth from "@/hooks/useAuth"
import SidebarItems from "./SidebarItems"

const Sidebar = () => {
  const { user: currentUser } = useAuth()

  return (
    <Box
      display={{ base: "none", md: "flex" }}
      position="sticky"
      bg="bg.subtle"
      top={0}
      minW="280px"
      h="100vh"
      p={4}
    >
      <Flex w="100%" direction="column" justify="space-between">
        <Box>
          <SidebarItems />
        </Box>
        <Box>
          {currentUser?.full_name && (
            <Flex alignItems="center">
              <Text fontSize="sm" fontWeight="bold" px={4} pt={2}>
                {currentUser.full_name}
              </Text>
            </Flex>
          )}
          {currentUser?.email && (
            <Flex alignItems="center">
              <Text fontSize="xs" px={4} pb={2} color="gray.500">
                {currentUser.email}
              </Text>
            </Flex>
          )}
        </Box>
      </Flex>
    </Box>
  )
}

export default Sidebar
