import {
  Box,
  Button,
  Container,
  Flex,
  Grid,
  Heading,
  Icon,
  SimpleGrid,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { FiBook, FiPlus, FiUserPlus } from "react-icons/fi"

import {
  CommunitiesService,
  DashboardService,
  ItemsService,
} from "@/client"
import CommunityCard from "@/components/Communities/CommunityCard"
import { LoanCalendar } from "@/components/Dashboard/LoanCalendar"
import { QuickSearch } from "@/components/Dashboard/QuickSearch"
import ItemCard from "@/components/Items/ItemCard"
import { ItemListItem } from "@/components/Items/ItemListItem"
import { useColorModeValue } from "@/components/ui/color-mode"
import useAuth from "@/hooks/useAuth"
import { groupItems } from "@/utils"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
})

function Dashboard() {
  const { user: currentUser } = useAuth()
  
  const cardBg = useColorModeValue("white", "gray.700")

  // --- Queries ---

  // 1. Dashboard Stats
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => DashboardService.getDashboardStats(),
  })

  // 2. Recent Activity (New Items)
  const { data: recentActivity, isLoading: isLoadingActivity } = useQuery({
    queryKey: ["recent-activity"],
    queryFn: () => DashboardService.getRecentActivity({ limit: 5 }),
  })

  // 3. Communities (Fallback/Sidebar)
  const { data: communities } = useQuery({
    queryKey: ["browse-communities"],
    queryFn: () => CommunitiesService.readCommunities({ limit: 3 }),
  })

  // 4. Recommendations
  const { data: books, isLoading: isLoadingBooks } = useQuery({
    queryKey: ["recommended-books"],
    queryFn: () => ItemsService.recommendItems({ limit: 4 }),
  })

  return (
    <>
      <Container maxW="full">
        <Box pt={8} m={4}>
          <Flex justify="space-between" align="center" mb={6} wrap="wrap" gap={4}>
            <Box>
              <Text fontSize="2xl" fontWeight="bold">
                Hi, {currentUser?.full_name || currentUser?.email} 👋🏼
              </Text>
              <Text color="gray.500">Here's what's happening in your library.</Text>
            </Box>
            <Flex gap={3}>
              <Button leftIcon={<FiPlus />} colorScheme="ui" as={Link} to="/items">
                Add Item
              </Button>
              <Button leftIcon={<FiUserPlus />} variant="outline" as={Link} to="/search">
                Find Friends
              </Button>
            </Flex>
          </Flex>
          
          {/* Quick Search */}
          <Box mb={8} maxW="600px">
             <QuickSearch placeholder="Search books, people, communities..." />
          </Box>

          {/* Stats Row */}
          <SimpleGrid columns={{ base: 1, md: 3 }} gap={6} mb={10}>
            <Box p={5} shadow="md" rounded="lg" bg={cardBg} borderLeft="4px solid" borderColor="ui.main">
              <Box>
                <Text fontSize="sm" color="gray.500">Honor Score</Text>
                <Flex align="baseline" gap={2}>
                  <Text fontSize="3xl" fontWeight="bold">
                    {isLoadingStats ? "-" : stats?.honor_score.toFixed(1)}
                  </Text>
                  <Text fontSize="sm" color="gray.400">/ 100</Text>
                </Flex>
                <Box w="100%" h="2" bg="gray.200" borderRadius="full" mt={3} overflow="hidden">
                  <Box 
                    h="100%" 
                    bg="green.500" 
                    width={`${stats?.honor_score || 0}%`} 
                    borderRadius="full"
                  />
                </Box>
              </Box>
            </Box>

            <Box p={5} shadow="md" rounded="lg" bg={cardBg}>
              <Box>
                <Text fontSize="sm" color="gray.500">Active Loans</Text>
                <Text fontSize="3xl" fontWeight="bold">
                  {isLoadingStats ? "-" : stats?.active_loans_count}
                </Text>
                <Text fontSize="sm" color="gray.500" mt={1}>
                  Books you are currently borrowing
                </Text>
              </Box>
            </Box>

            <Box p={5} shadow="md" rounded="lg" bg={cardBg}>
              <Box>
                <Text fontSize="sm" color="gray.500">Pending Actions</Text>
                <Text fontSize="3xl" fontWeight="bold" color={stats?.pending_actions_count ? "orange.500" : "inherit"}>
                  {isLoadingStats ? "-" : stats?.pending_actions_count}
                </Text>
                <Text fontSize="sm" color="gray.500" mt={1}>
                  Requests awaiting your approval
                </Text>
              </Box>
            </Box>
          </SimpleGrid>

          {/* Main Content Layout */}
          <Grid templateColumns={{ base: "1fr", xl: "2fr 1fr" }} gap={8}>
            {/* Main Column */}
            <VStack align="stretch" gap={10}>
              {/* New Arrivals (List View) */}
              <Box>
                <Flex justify="space-between" align="center" mb={4}>
                  <Heading size="md" display="flex" alignItems="center" gap={2}>
                     <Icon as={FiBook} /> New Arrivals
                  </Heading>
                </Flex>
                
                {isLoadingActivity ? (
                  <Spinner />
                ) : recentActivity?.data.length === 0 ? (
                  <Box p={6} bg={cardBg} rounded="lg" textAlign="center">
                    <Text color="gray.500">No new items from your network recently.</Text>
                    <Button as={Link} to="/communities" size="sm" mt={4} variant="link" color="ui.main">
                      Join a Community
                    </Button>
                  </Box>
                ) : (
                   <VStack align="stretch" gap={3}>
                      {groupItems(recentActivity?.data || []).map((group: any) => (
                        <ItemListItem key={group[0].id} item={group} />
                      ))}
                   </VStack>
                )}
              </Box>

              {/* Recommended Books (Grid View) */}
              <Box>
                <Heading size="md" mb={4}>Recommended For You</Heading>
                {isLoadingBooks ? (
                  <Spinner />
                ) : books?.data.length === 0 ? (
                  <Text color="gray.500">Start rating books or join communities to get recommendations!</Text>
                ) : (
                  <SimpleGrid columns={{ base: 2, sm: 3, md: 4 }} gap={4}>
                    {groupItems(books?.data || []).map((group: any) => (
                      <ItemCard key={group[0].id} item={group} />
                    ))}
                  </SimpleGrid>
                )}
              </Box>
            </VStack>

            {/* Sidebar Column */}
            <VStack align="stretch" gap={8}>
              {/* Loan Calendar */}
              <Box>
                  <Heading size="sm" mb={4}>Loan Schedule</Heading>
                  <LoanCalendar />
              </Box>

              {/* Communities Widget */}
              <Box>
                <Flex justify="space-between" align="center" mb={4}>
                  <Heading size="sm">Your Communities</Heading>
                  <Link to="/communities" style={{ fontSize: "0.875rem", color: "gray" }}>View All</Link>
                </Flex>
                <VStack align="stretch" gap={3}>
                   {communities?.data.slice(0, 3).map((community: any) => (
                     <CommunityCard key={community.id} community={community} />
                   ))}
                </VStack>
              </Box>
              
              {/* Quick Tips / Gamification */}
              <Box p={5} bg="blue.50" _dark={{ bg: "blue.900" }} rounded="lg">
                  <Heading size="sm" mb={2} color="blue.600" _dark={{ color: "blue.200" }}>Did you know?</Heading>
                  <Text fontSize="sm" mb={4}>
                      Maintaining a high Honor Score increases your visibility and borrowing limits.
                  </Text>
                  <Button size="sm" colorScheme="blue" variant="outline" w="full" as={Link} to="/settings">
                      View My Profile
                  </Button>
              </Box>
            </VStack>
          </Grid>
        </Box>
      </Container>
    </>
  )
}
