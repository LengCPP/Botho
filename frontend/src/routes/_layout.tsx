import { Box, Flex } from "@chakra-ui/react"
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"

import Navbar from "@/components/Common/Navbar"
import NotFound from "@/components/Common/NotFound"
import Sidebar from "@/components/Common/Sidebar"
import { isLoggedIn } from "@/hooks/useAuth"
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

  return (
    <Flex direction="column" minH="100dvh">
      <Navbar />
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
