import {
  Box,
  Flex,
  HStack,
  IconButton,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react"
import { Link, Link as RouterLink } from "@tanstack/react-router"
import { useState } from "react"
import { FaBars } from "react-icons/fa"
import { FiSettings } from "react-icons/fi"

import useAuth from "@/hooks/useAuth"
import Logo from "/assets/images/botho-logo.png"
import { ColorModeButton } from "../ui/color-mode"
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerRoot,
  DrawerTrigger,
} from "../ui/drawer"
import NotificationsMenu from "./NotificationsMenu"
import SidebarItems from "./SidebarItems"
import UserMenu from "./UserMenu"

function Navbar() {
  const { user: currentUser } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <Flex
      justify="space-between"
      align="center"
      position="sticky"
      top={0}
      zIndex="sticky"
      bg="bg.muted"
      color="white"
      w="100%"
      px={4}
      py={2}
    >
      {/* Left Side: Hamburger & Logo */}
      <HStack gap={4}>
        <DrawerRoot
          placement="start"
          open={open}
          onOpenChange={(e) => setOpen(e.open)}
        >
          <DrawerBackdrop />
          <DrawerTrigger asChild>
            <IconButton
              display={{ base: "flex", md: "none" }}
              variant="ghost"
              color="inherit"
              aria-label="Open Menu"
            >
              <FaBars />
            </IconButton>
          </DrawerTrigger>
          <DrawerContent maxW="280px" h="full">
            <DrawerCloseTrigger />
            <DrawerBody pt={12}>
              <Flex flexDir="column" h="full" justify="space-between">
                <Box>
                  <SidebarItems onClose={() => setOpen(false)} />
                </Box>
                <Box mb={4}>
                  <RouterLink to="/settings" onClick={() => setOpen(false)}>
                    <Flex
                      alignItems="center"
                      gap={4}
                      px={4}
                      py={2}
                      _hover={{
                        background: "gray.subtle",
                      }}
                      w="full"
                      fontSize="sm"
                    >
                      <FiSettings />
                      <Text>Settings</Text>
                    </Flex>
                  </RouterLink>
                  {currentUser?.email && (
                    <Flex alignItems="center">
                      <Text fontSize="xs" px={4} py={2} color="gray.500">
                        Logged in as: {currentUser.email}
                      </Text>
                    </Flex>
                  )}
                </Box>
              </Flex>
            </DrawerBody>
          </DrawerContent>
        </DrawerRoot>

        <Link to="/">
          <Image
            src={Logo}
            alt="botho logo"
            w={{ base: "80px", md: "140px" }}
            maxW="150px"
          />
        </Link>
      </HStack>

      {/* Right Side: Theme Toggle, Notifications, User Avatar */}
      <HStack gap={2} display="flex" flexShrink={0}>
        <ColorModeButton />
        <NotificationsMenu />
        <UserMenu />
      </HStack>
    </Flex>
  )
}

export default Navbar
