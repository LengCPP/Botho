import { Box } from "@chakra-ui/react"

import SidebarItems from "./SidebarItems"

const Sidebar = () => {
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
      <Box w="100%">
        <Box>
          <SidebarItems />
        </Box>
      </Box>
    </Box>
  )
}

export default Sidebar
