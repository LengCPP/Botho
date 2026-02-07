import {
  Badge,
  Box,
  Container,
  Heading,
  Separator,
  SimpleGrid,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import {
  FiAlertCircle,
  FiArrowDownLeft,
  FiArrowUpRight,
  FiCheckCircle,
  FiClock,
  FiFileText,
  FiLayers,
  FiShare2,
} from "react-icons/fi"

import { type ItemPublic, type LoanPublic, LoansService } from "@/client"
import ReviewModal from "@/components/Common/ReviewModal"
import { CompactItemCard } from "@/components/Items/CompactItemCard"
import ItemCard from "@/components/Items/ItemCard"
import { ItemDetailModal } from "@/components/Items/ItemDetailModal"
import { ItemsViewOptions } from "@/components/Items/ItemsViewOptions"
import { LoanCard } from "@/components/Items/LoanCard"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/loans")({
  component: LoansPage,
})

function LoansPage() {
  const { user } = useAuth()
  const [viewMode, setViewMode] = useState<"card" | "list">("card")
  const [sortBy, setSortBy] = useState("created_at")
  const [sortOrder, setSortOrder] = useState("desc")
  const [selectedItem, setSelectedItem] = useState<ItemPublic | null>(null)
  const [selectedLoanForReview, setSelectedLoanForReview] =
    useState<LoanPublic | null>(null)

  const { data: incoming, isLoading: isLoadingIn } = useQuery({
    queryKey: ["loans", "incoming"],
    queryFn: () => LoansService.readIncomingLoanRequests({}),
  })

  const { data: outgoing, isLoading: isLoadingOut } = useQuery({
    queryKey: ["loans", "outgoing"],
    queryFn: () => LoansService.readOutgoingLoanRequests({}),
  })

  const isLoading = isLoadingIn || isLoadingOut

  const borrowedItems = useMemo(
    () =>
      outgoing?.data.filter(
        (l) => l.status === "ACTIVE" || l.status === "RETURN_PENDING",
      ) || [],
    [outgoing],
  )

  const pendingOutgoing = useMemo(
    () =>
      outgoing?.data.filter(
        (l) =>
          l.status === "PENDING" ||
          l.status === "ACCEPTED" ||
          l.status === "REJECTED",
      ) || [],
    [outgoing],
  )

  const pendingIncoming = useMemo(
    () =>
      incoming?.data.filter(
        (l) =>
          l.status === "PENDING" ||
          l.status === "RETURN_PENDING" ||
          l.status === "REJECTED",
      ) || [],
    [incoming],
  )

  const approvedIncoming = useMemo(
    () => incoming?.data.filter((l) => l.status === "ACCEPTED") || [],
    [incoming],
  )

  const auditTrail = useMemo(() => {
    const combined = [
      ...(incoming?.data || []),
      ...(outgoing?.data || []),
    ].filter((l) => ["CANCELLED", "RETURNED"].includes(l.status))
    return combined.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  }, [incoming, outgoing])

  const overdueLoans = useMemo(() => {
    const now = new Date()
    return [...(incoming?.data || []), ...(outgoing?.data || [])].filter(
      (l) =>
        (l.status === "ACTIVE" || l.status === "RETURN_PENDING") &&
        new Date(l.end_date) < now,
    )
  }, [incoming, outgoing])

  const activeLending = useMemo(
    () =>
      incoming?.data.filter(
        (l) => l.status === "ACTIVE" || l.status === "RETURN_PENDING",
      ) || [],
    [incoming],
  )

  // Client-side sorting for borrowed items
  const sortedBorrowedItems = useMemo(() => {
    return [...borrowedItems].sort((a, b) => {
      let valA: any
      let valB: any

      if (sortBy === "title") {
        valA = a.item.title.toLowerCase()
        valB = b.item.title.toLowerCase()
      } else {
        valA = new Date(a.created_at).getTime()
        valB = new Date(b.created_at).getTime()
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1
      if (valA > valB) return sortOrder === "asc" ? 1 : -1
      return 0
    })
  }, [borrowedItems, sortBy, sortOrder])

  if (isLoading) {
    return (
      <Container maxW="full" pt={12}>
        <Text>Loading loans...</Text>
      </Container>
    )
  }

  return (
    <Container maxW="full" pb={20}>
      <VStack align="stretch" gap={8} pt={12}>
        <Heading size="lg">Loans & Possession</Heading>

        <Tabs.Root defaultValue="active" variant="enclosed">
          <Tabs.List>
            <Tabs.Trigger value="active">
              <FiLayers /> Active & Requests
            </Tabs.Trigger>
            <Tabs.Trigger value="audit">
              <FiFileText /> Audit Trail ({auditTrail.length})
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="active" pt={8}>
            <VStack align="stretch" gap={12}>
              {/* Borrowed Items */}
              <Box>
                <Heading
                  size="md"
                  mb={6}
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
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
                        : { base: 3, sm: 3, md: 4, lg: 5, xl: 6 }
                    }
                    gap={viewMode === "list" ? 2 : { base: 2, md: 6 }}
                  >
                    {sortedBorrowedItems.map((loan) =>
                      viewMode === "list" ? (
                        <CompactItemCard
                          key={loan.id}
                          item={loan.item}
                          loan={loan}
                          onShowDetails={() => setSelectedItem(loan.item)}
                          onReview={(l) => setSelectedLoanForReview(l)}
                        />
                      ) : (
                        <VStack key={loan.id} align="stretch" gap={2}>
                          <ItemCard
                            item={loan.item}
                            loan={loan}
                            onShowDetails={() => setSelectedItem(loan.item)}
                            onReview={(l) => setSelectedLoanForReview(l)}
                          />
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

              {/* Items I Approved Section */}
              {approvedIncoming.length > 0 && (
                <Box>
                  <Heading
                    size="md"
                    mb={6}
                    display="flex"
                    alignItems="center"
                    gap={2}
                  >
                    <FiCheckCircle color="green.500" /> Loans I've Approved
                    (Waiting for Borrower)
                  </Heading>
                  <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
                    {approvedIncoming.map((loan) => (
                      <LoanCard
                        key={loan.id}
                        loan={loan}
                        type="incoming"
                        onReview={(l) => setSelectedLoanForReview(l)}
                      />
                    ))}
                  </SimpleGrid>
                  <Separator mt={12} />
                </Box>
              )}

              {/* Overdue Section */}
              {overdueLoans.length > 0 && (
                <Box>
                  <Heading
                    size="md"
                    mb={6}
                    display="flex"
                    alignItems="center"
                    gap={2}
                  >
                    <FiAlertCircle color="red.500" /> Overdue Items
                  </Heading>
                  <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
                    {overdueLoans.map((loan) => (
                      <LoanCard
                        key={loan.id}
                        loan={loan}
                        type={
                          loan.requester_id === user?.id
                            ? "outgoing"
                            : "incoming"
                        }
                        onReview={(l) => setSelectedLoanForReview(l)}
                      />
                    ))}
                  </SimpleGrid>
                  <Separator mt={12} />
                </Box>
              )}

              {/* Active Lending Section */}
              {activeLending.length > 0 && (
                <Box>
                  <Heading
                    size="md"
                    mb={6}
                    display="flex"
                    alignItems="center"
                    gap={2}
                  >
                    <FiShare2 color="blue.500" /> Items I'm Lending
                  </Heading>
                  <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
                    {activeLending.map((loan) => (
                      <LoanCard
                        key={loan.id}
                        loan={loan}
                        type="incoming"
                        onReview={(l) => setSelectedLoanForReview(l)}
                      />
                    ))}
                  </SimpleGrid>
                  <Separator mt={12} />
                </Box>
              )}

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
                    <FiArrowDownLeft color="accent.500" /> Incoming Requests &
                    Returns
                  </Heading>
                  {pendingIncoming.length === 0 ? (
                    <Text fontSize="sm" color="fg.muted">
                      No pending requests or returns for your items.
                    </Text>
                  ) : (
                    <VStack align="stretch" gap={4}>
                      {pendingIncoming.map((loan) => (
                        <LoanCard
                          key={loan.id}
                          loan={loan}
                          type="incoming"
                          onReview={(l) => setSelectedLoanForReview(l)}
                        />
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
                        <LoanCard
                          key={loan.id}
                          loan={loan}
                          type="outgoing"
                          onReview={(l) => setSelectedLoanForReview(l)}
                        />
                      ))}
                    </VStack>
                  )}
                </Box>
              </SimpleGrid>
            </VStack>
          </Tabs.Content>

          <Tabs.Content value="audit" pt={8}>
            <VStack align="stretch" gap={6}>
              <Heading size="md">Transaction History</Heading>
              {auditTrail.length === 0 ? (
                <Box
                  p={8}
                  textAlign="center"
                  borderWidth="1px"
                  borderRadius="lg"
                  borderStyle="dashed"
                >
                  <Text color="fg.muted" fontStyle="italic">
                    Audit trail is empty.
                  </Text>
                </Box>
              ) : (
                <VStack align="stretch" gap={4}>
                  {auditTrail.map((loan) => (
                    <LoanCard
                      key={loan.id}
                      loan={loan}
                      type={
                        loan.requester_id === user?.id ? "outgoing" : "incoming"
                      }
                      onReview={(l) => setSelectedLoanForReview(l)}
                    />
                  ))}
                </VStack>
              )}
            </VStack>
          </Tabs.Content>
        </Tabs.Root>
      </VStack>

      <ItemDetailModal
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {selectedLoanForReview && (
        <ReviewModal
          loan={selectedLoanForReview}
          isOpen={!!selectedLoanForReview}
          onClose={() => setSelectedLoanForReview(null)}
        />
      )}
    </Container>
  )
}
