import {
  Badge,
  Box,
  Container,
  Heading,
  Separator,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { FiArrowDownLeft, FiArrowUpRight, FiClock } from "react-icons/fi"

import { LoansService } from "@/client"
import { CompactItemCard } from "@/components/Items/CompactItemCard"
import ItemCard from "@/components/Items/ItemCard"
import { ItemsViewOptions } from "@/components/Items/ItemsViewOptions"
import { LoanCard } from "@/components/Items/LoanCard"

export const Route = createFileRoute("/_layout/loans")({
  component: LoansPage,
})

function LoansPage() {
  const [viewMode, setViewMode] = useState<"card" | "list">("card")
  const [sortBy, setSortBy] = useState("created_at")
  const [sortOrder, setSortOrder] = useState("desc")

  const { data: incoming, isLoading: isLoadingIn } = useQuery({
    queryKey: ["loans", "incoming"],
    queryFn: () => LoansService.readIncomingLoanRequests({}),
  })

  const { data: outgoing, isLoading: isLoadingOut } = useQuery({
    queryKey: ["loans", "outgoing"],
    queryFn: () => LoansService.readOutgoingLoanRequests({}),
  })

  const borrowedItems =
    outgoing?.data.filter(
      (l) => l.status === "ACTIVE" || l.status === "RETURN_PENDING",
    ) || []

  const pendingOutgoing =
    outgoing?.data.filter(
      (l) => l.status === "PENDING" || l.status === "ACCEPTED",
    ) || []
  const pendingIncoming =
    incoming?.data.filter(
      (l) => l.status === "PENDING" || l.status === "RETURN_PENDING",
    ) || []

  // Client-side sorting for borrowed items
  const sortedBorrowedItems = [...borrowedItems].sort((a, b) => {
    let valA: any
    let valB: any

    if (sortBy === "title") {
      valA = a.item.title.toLowerCase()
      valB = b.item.title.toLowerCase()
    } else {
      // Default to created_at (Loan creation date)
      valA = new Date(a.created_at).getTime()
      valB = new Date(b.created_at).getTime()
    }

    if (valA < valB) return sortOrder === "asc" ? -1 : 1
    if (valA > valB) return sortOrder === "asc" ? 1 : -1
    return 0
  })

  return (
    <Container maxW="full" pb={20}>
      <Heading size="lg" py={12}>
        Loans & Possession
      </Heading>

      <VStack align="stretch" gap={12}>
        {/* Borrowed Items (The "New Collection") */}
        <Box>
          <Heading
            size="md"
            mb={6}
            display="flex"
            alignItems="center"
            justify="space-between"
            gap={2}
            flexWrap="wrap"
          >
            <Text display="flex" alignItems="center" gap={2}>
              <FiClock color="teal" /> Items I am Borrowing
            </Text>

            {borrowedItems.length > 0 && (
              <ItemsViewOptions
                viewMode={viewMode}
                onChangeViewMode={setViewMode}
                sortBy={sortBy}
                onChangeSortBy={setSortBy}
                sortOrder={sortOrder}
                onChangeSortOrder={setSortOrder}
                showDisplayToggle={false}
                showLimit={false}
                showFilter={false}
              />
            )}
          </Heading>

          {borrowedItems.length === 0 ? (
            <Box
              p={8}
              textAlign="center"
              borderWidth="1px"
              borderRadius="lg"
              borderStyle="dashed"
            >
              <Text color="fg.muted">
                You are not currently borrowing any items.
              </Text>
            </Box>
          ) : (
            <SimpleGrid
              columns={
                viewMode === "list"
                  ? 1
                  : { base: 1, sm: 2, md: 3, lg: 4, xl: 5 }
              }
              gap={viewMode === "list" ? 2 : 6}
            >
              {sortedBorrowedItems.map((loan) =>
                viewMode === "list" ? (
                  <CompactItemCard
                    key={loan.id}
                    item={loan.item}
                    loan={loan}
                    onShowDetails={() => {}} // TODO: Add details modal if needed
                  />
                ) : (
                  <VStack key={loan.id} align="stretch" gap={2}>
                    <ItemCard item={loan.item} loan={loan} />
                    {loan.status === "RETURN_PENDING" && (
                      <Badge
                        colorPalette="main"
                        variant="subtle"
                        width="full"
                        justifyContent="center"
                      >
                        Waiting for owner
                      </Badge>
                    )}
                  </VStack>
                ),
              )}
            </SimpleGrid>
          )}
        </Box>

        <Separator />

        <SimpleGrid columns={{ base: 1, lg: 2 }} gap={12}>
          {/* Actionable Requests */}
          <Box>
            <Heading
              size="md"
              mb={6}
              display="flex"
              alignItems="center"
              gap={2}
            >
              <FiArrowDownLeft color="accent.500" /> Incoming Requests & Returns
            </Heading>
            {pendingIncoming.length === 0 ? (
              <Text fontSize="sm" color="fg.muted">
                No pending requests or returns for your items.
              </Text>
            ) : (
              <VStack align="stretch" gap={4}>
                {pendingIncoming.map((loan) => (
                  <LoanCard key={loan.id} loan={loan} type="incoming" />
                ))}
              </VStack>
            )}
          </Box>

          <Box>
            <Heading
              size="md"
              mb={6}
              display="flex"
              alignItems="center"
              gap={2}
            >
              <FiArrowUpRight color="main.500" /> My Requests
            </Heading>
            {pendingOutgoing.length === 0 ? (
              <Text fontSize="sm" color="fg.muted">
                You have no pending requests.
              </Text>
            ) : (
              <VStack align="stretch" gap={4}>
                {pendingOutgoing.map((loan) => (
                  <LoanCard key={loan.id} loan={loan} type="outgoing" />
                ))}
              </VStack>
            )}
          </Box>
        </SimpleGrid>
      </VStack>
    </Container>
  )
}
