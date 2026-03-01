import { Box, Flex, IconButton } from "@chakra-ui/react"
import {
  Outlet,
  createFileRoute,
  redirect,
} from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { FaBars } from "react-icons/fa"

import { ItemAvailableBanner } from "@/components/Common/ItemAvailableBanner"
import { LoanReminderBanner } from "@/components/Common/LoanReminderBanner"
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
import { isLoggedIn } from "@/hooks/useAuth"
import useInactivityLogout from "@/hooks/useInactivityLogout"
import { useNotifications } from "@/hooks/useNotifications"

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
  useNotifications()
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
              <SidebarItems onClose={() => setOpen(false)} />
            </DrawerBody>
          </DrawerContent>
        </DrawerRoot>
      </Box>

      <Flex flex="1">
        <Sidebar />
        <Flex
          flex="1"
          direction="column"
          ml={{ base: 0, md: "280px" }}
          minW={0}
        >
          <LoanReminderBanner />
          <ItemAvailableBanner />
          <Box flex="1" p={4}>
            <Outlet />
          </Box>
        </Flex>
      </Flex>
    </Flex>
  )
}

export default Layout
