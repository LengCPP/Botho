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
      position="fixed"
      left={0}
      top="52px" // Navbar height approx
      bg="bg.subtle"
      minW="280px"
      w="280px"
      h="calc(100vh - 52px)"
      p={4}
      zIndex="sticky"
      borderRightWidth="1px"
    >
      <Flex w="100%" direction="column" justify="space-between">
        <Box>
          <SidebarItems />
        </Box>
      </Flex>
    </Box>
  )
}

export default Sidebar
