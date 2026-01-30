import {
  Box,
  Flex,
  HStack,
  Image,
} from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"

import Logo from "/assets/images/botho-logo.png"
import { ColorModeButton } from "../ui/color-mode"
import NotificationsMenu from "./NotificationsMenu"
import UserMenu from "./UserMenu"

function Navbar() {
  return (
    <Box
      position="sticky"
      top={0}
      zIndex={1200} // Higher than docked (10) and default sticky (1100)
      bg="bg.muted"
      color="white"
      w="100%"
    >
      <Flex
        justify="space-between"
        align="center"
        px={4}
        py={2}
      >
        <Link to="/">
          <Image
            src={Logo}
            alt="botho logo"
            w={{ base: "80px", md: "140px" }}
            maxW="150px"
          />
        </Link>

        {/* Right Side: Theme Toggle, Notifications, User Avatar */}
        <HStack gap={2} display="flex" flexShrink={0}>
          <ColorModeButton />
          <Box display={{ base: "none", md: "block" }}>
            <NotificationsMenu />
          </Box>
          <UserMenu />
        </HStack>
      </Flex>
    </Box>
  )
}

export default Navbar
