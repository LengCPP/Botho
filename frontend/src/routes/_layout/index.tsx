import {
  Box,
  Button,
  Container,
  Flex,
  Grid,
  GridItem,
  Heading,
  Icon,
  SimpleGrid,
  Stat,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import {
  FiActivity,
  FiAward,
  FiCheckCircle,
  FiClock,
  FiHeart,
  FiZap,
} from "react-icons/fi"

import { DashboardService, ItemsService } from "@/client"
import { LoanCalendar } from "@/components/Dashboard/LoanCalendar"
import { QuickSearch } from "@/components/Dashboard/QuickSearch"
import { ItemListItem } from "@/components/Items/ItemListItem"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog"
import useAuth from "@/hooks/useAuth"
import { groupItems } from "@/utils"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
})

function Dashboard() {
  const { user } = useAuth()
  const [isArrivalsModalOpen, setIsArrivalsModalOpen] = useState(false)
  const [isRecsModalOpen, setIsRecsModalOpen] = useState(false)

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => DashboardService.getDashboardStats(),
  })

  const { data: recentActivity, isLoading: activityLoading } = useQuery({
    queryKey: ["recent-activity"],
    queryFn: () => DashboardService.getRecentActivity({ limit: 20 }),
  })

  const { data: recommendations, isLoading: recsLoading } = useQuery({
    queryKey: ["recommendations"],
    queryFn: () => ItemsService.recommendItems({ limit: 20 }),
  })

  const groupedArrivals = groupItems(recentActivity?.data || [])
  const initialArrivals = groupedArrivals.slice(0, 4)
  const hasMoreArrivals = groupedArrivals.length > 4

  const groupedRecs = groupItems(recommendations?.data || [])
  const initialRecs = groupedRecs.slice(0, 4)
  const hasMoreRecs = groupedRecs.length > 4

  return (
    <Container maxW="full">
      <VStack align="stretch" gap={8} pt={8}>
        <Box>
          <Heading size="lg">
            Welcome back, {user?.full_name || user?.email}!
          </Heading>
          <Text color="fg.muted">Here's what's happening in your network.</Text>
        </Box>

        <Box>
          <QuickSearch placeholder="Search items, friends, or communities..." />
        </Box>

        {/* Stats Section */}
        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} gap={6}>
          <StatCard
            label="Honor Score"
            value={(stats as any)?.honor_score || 0}
            icon={FiAward}
            color="orange.500"
            helpText="Community standing"
          />
          <StatCard
            label="Reliability"
            value={`${Math.round((stats as any)?.reliability_rate ?? 0)}%`}
            icon={FiCheckCircle}
            color="green.500"
            helpText="Loan return rate"
          />
          <StatCard
            label="Active Loans"
            value={(stats as any)?.active_loans_count || 0}
            icon={FiClock}
            color="blue.500"
            helpText="Items you are borrowing"
          />
          <StatCard
            label="Pending Actions"
            value={(stats as any)?.pending_actions_count || 0}
            icon={FiActivity}
            color="purple.500"
            helpText="Requests needing review"
          />
        </SimpleGrid>

        <Grid templateColumns={{ base: "1fr", xl: "repeat(3, 1fr)" }} gap={8}>
          {/* Main Feed Column */}
          <GridItem colSpan={{ base: 1, xl: 2 }}>
            <VStack align="stretch" gap={10}>
              {/* New Arrivals Feed */}
              <VStack align="stretch" gap={4}>
                <Heading size="md" display="flex" alignItems="center" gap={2}>
                  <FiZap /> New Arrivals
                </Heading>
                {activityLoading ? (
                  <Text>Loading arrivals...</Text>
                ) : groupedArrivals.length === 0 ? (
                  <Box
                    p={10}
                    textAlign="center"
                    bg="bg.muted"
                    borderRadius="lg"
                  >
                    <Text color="fg.muted">
                      No new arrivals from your network.
                    </Text>
                    <Text fontSize="sm">
                      Try joining more communities or adding friends!
                    </Text>
                  </Box>
                ) : (
                  <VStack align="stretch" gap={3}>
                    {initialArrivals.map((group) => (
                      <ItemListItem key={group[0].id} item={group} />
                    ))}
                    {hasMoreArrivals && (
                      <Button
                        variant="ghost"
                        colorPalette="accent"
                        size="sm"
                        onClick={() => setIsArrivalsModalOpen(true)}
                        alignSelf="center"
                      >
                        Show More ({groupedArrivals.length - 4} more)
                      </Button>
                    )}
                  </VStack>
                )}
              </VStack>

              {/* Recommendations Feed */}
              <VStack align="stretch" gap={4}>
                <Heading size="md" display="flex" alignItems="center" gap={2}>
                  <FiHeart /> Recommended for You
                </Heading>
                {recsLoading ? (
                  <Text>Finding matches...</Text>
                ) : groupedRecs.length === 0 ? (
                  <Box
                    p={10}
                    textAlign="center"
                    bg="bg.muted"
                    borderRadius="lg"
                    border="1px dashed"
                    borderColor="border.subtle"
                  >
                    <Text color="fg.muted">No recommendations yet.</Text>
                    <Text fontSize="sm">
                      Try adding interests to your profile!
                    </Text>
                  </Box>
                ) : (
                  <VStack align="stretch" gap={3}>
                    {initialRecs.map((group) => (
                      <ItemListItem key={group[0].id} item={group} />
                    ))}
                    {hasMoreRecs && (
                      <Button
                        variant="ghost"
                        colorPalette="blue"
                        size="sm"
                        onClick={() => setIsRecsModalOpen(true)}
                        alignSelf="center"
                      >
                        See All Matches ({groupedRecs.length - 4} more)
                      </Button>
                    )}
                  </VStack>
                )}
              </VStack>
            </VStack>
          </GridItem>

          {/* Calendar Side Panel */}
          <GridItem>
            <VStack align="stretch" gap={4}>
              <Heading size="md">Loan Calendar</Heading>
              <LoanCalendar />
            </VStack>
          </GridItem>
        </Grid>
      </VStack>

      {/* New Arrivals Modal */}
      <DialogRoot
        open={isArrivalsModalOpen}
        onOpenChange={(e) => setIsArrivalsModalOpen(e.open)}
        size="lg"
        scrollBehavior="inside"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recent Additions</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <VStack align="stretch" gap={3} pb={4}>
              {groupedArrivals.map((group) => (
                <ItemListItem key={group[0].id} item={group} />
              ))}
            </VStack>
          </DialogBody>
          <DialogCloseTrigger />
        </DialogContent>
      </DialogRoot>

      {/* Recommendations Modal */}
      <DialogRoot
        open={isRecsModalOpen}
        onOpenChange={(e) => setIsRecsModalOpen(e.open)}
        size="lg"
        scrollBehavior="inside"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Personalized Matches</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <VStack align="stretch" gap={3} pb={4}>
              {groupedRecs.map((group) => (
                <ItemListItem key={group[0].id} item={group} />
              ))}
            </VStack>
          </DialogBody>
          <DialogCloseTrigger />
        </DialogContent>
      </DialogRoot>
    </Container>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  icon: any
  color: string
  helpText: string
}

function StatCard({ label, value, icon, color, helpText }: StatCardProps) {
  return (
    <Box
      p={5}
      bg="bg.panel"
      borderRadius="lg"
      border="1px solid"
      borderColor="border.subtle"
      boxShadow="sm"
    >
      <Flex justify="space-between" align="start">
        <Stat.Root>
          <Stat.Label color="fg.muted" fontWeight="medium">
            {label}
          </Stat.Label>
          <Stat.ValueText fontSize="2xl" fontWeight="bold">
            {value}
          </Stat.ValueText>
          <Stat.HelpText fontSize="xs" mt={1}>
            {helpText}
          </Stat.HelpText>
        </Stat.Root>
        <Box p={2} bg="bg.muted" borderRadius="md">
          <Icon as={icon} boxSize={5} color={color} />
        </Box>
      </Flex>
    </Box>
  )
}
