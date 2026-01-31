import { Box, Flex, IconButton, Text } from "@chakra-ui/react"
import {
  Outlet,
  Link as RouterLink,
  createFileRoute,
  redirect,
} from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { FaBars } from "react-icons/fa"
import { FiSettings } from "react-icons/fi"

import Navbar from "@/components/Common/Navbar"
import NotFound from "@/components/Common/NotFound"
import Sidebar from "@/components/Common/Sidebar"
import SidebarItems from "@/components/Common/SidebarItems"
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerRoot,
  DrawerTrigger,
} from "@/components/ui/drawer"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import useInactivityLogout from "@/hooks/useInactivityLogout"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }
  },
  notFoundComponent: () => <NotFound />,
})

function Layout() {
  useInactivityLogout()
  const { user: currentUser } = useAuth()
  const [open, setOpen] = useState(false)

  const [isVisible, setIsVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      // Hide if scrolling down and past a threshold, show if scrolling up
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false)
      } else {
        setIsVisible(true)
      }
      setLastScrollY(currentScrollY)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [lastScrollY])

  return (
    <Flex direction="column" minH="100dvh">
      <Navbar />

      {/* Mobile Burger Menu Trigger */}
      <Box
        display={{ base: "block", md: "none" }}
        px={4}
        py={2}
        bg="bg.subtle"
        borderBottomWidth="1px"
        position="sticky"
        top="52px" // Navbar height approx
        zIndex="docked" // Stay below Navbar (sticky)
        transition="transform 0.3s ease-in-out, opacity 0.2s"
        transform={isVisible ? "translateY(0)" : "translateY(-100%)"}
        opacity={isVisible ? 1 : 0}
        pointerEvents={isVisible ? "auto" : "none"}
      >
        <DrawerRoot
          placement="start"
          open={open}
          onOpenChange={(e) => setOpen(e.open)}
        >
          <DrawerBackdrop />
          <DrawerTrigger asChild>
            <IconButton variant="ghost" aria-label="Open Menu">
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
      </Box>

      <Flex flex="1">
        <Sidebar />
        <Box flex="1" p={4}>
          <Outlet />
        </Box>
      </Flex>
    </Flex>
  )
}

export default Layout
