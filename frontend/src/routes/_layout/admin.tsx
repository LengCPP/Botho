import {
  Badge,
  Box,
  Container,
  Flex,
  Heading,
  Spinner,
  Table,
  Text,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"

import { Users } from "@/client"
import AddUser from "@/components/Admin/AddUser"
import { UserActionsMenu } from "@/components/Common/UserActionsMenu"
import { useColorModeValue } from "@/components/ui/color-mode"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination"

const adminSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/admin")({
  component: Admin,
  validateSearch: (search) => adminSearchSchema.parse(search),
})

const PER_PAGE = 12

function Admin() {
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const setPage = (page: number) =>
    navigate({ search: (prev: any) => ({ ...prev, page }) })

  const { data: users, isLoading } = useQuery({
    queryKey: ["users", { page }],
    queryFn: () =>
      Users.readUsers({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
  })

  const bgColor = useColorModeValue("main.50", "gray.900")
  const borderColor = useColorModeValue("main.200", "gray.700")
  const headerBg = useColorModeValue("main.100", "gray.800")
  const headerTextColor = useColorModeValue("gray.800", "gray.100")
  const rowHoverBg = useColorModeValue("main.100/50", "gray.800/50")

  return (
    <Container maxW="full">
      <Flex pt={12} justify="space-between" align="center">
        <Heading size="lg">User Management</Heading>
        <AddUser />
      </Flex>

      <Box
        mt={6}
        overflowX="auto"
        borderRadius="lg"
        borderWidth="1px"
        borderColor={borderColor}
        bg={bgColor}
        boxShadow="sm"
      >
        <Table.Root size="md" variant="line" interactive width="full">
          <Table.Header>
            <Table.Row bg={headerBg}>
              <Table.ColumnHeader color={headerTextColor}>
                Full Name
              </Table.ColumnHeader>
              <Table.ColumnHeader color={headerTextColor}>
                Email
              </Table.ColumnHeader>
              <Table.ColumnHeader color={headerTextColor}>
                Role
              </Table.ColumnHeader>
              <Table.ColumnHeader color={headerTextColor}>
                Status
              </Table.ColumnHeader>
              <Table.ColumnHeader color={headerTextColor}>
                Actions
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {isLoading ? (
              <Table.Row>
                <Table.Cell colSpan={5} textAlign="center" py={10}>
                  <Spinner color="ui.primary" />
                </Table.Cell>
              </Table.Row>
            ) : users?.data.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={5} textAlign="center" py={10}>
                  <Text color="fg.muted">No users found.</Text>
                </Table.Cell>
              </Table.Row>
            ) : (
              users?.data.map((user) => (
                <Table.Row key={user.id} _hover={{ bg: rowHoverBg }}>
                  <Table.Cell fontWeight="medium">
                    {user.full_name || "N/A"}
                  </Table.Cell>
                  <Table.Cell color="fg.muted">{user.email}</Table.Cell>
                  <Table.Cell>
                    {user.is_superuser ? "Superuser" : "User"}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge colorPalette={user.is_active ? "teal" : "red"}>
                      {user.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <UserActionsMenu user={user} />
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table.Root>
      </Box>

      <Flex justify="center" mt={6} mb={10}>
        <PaginationRoot
          count={users?.count || 0}
          pageSize={PER_PAGE}
          page={page}
          onPageChange={(details) => setPage(details.page)}
          variant="subtle"
        >
          <Flex gap={2}>
            <PaginationPrevTrigger />
            <PaginationItems />
            <PaginationNextTrigger />
          </Flex>
        </PaginationRoot>
      </Flex>
    </Container>
  )
}
