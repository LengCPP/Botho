import {
  Button,
  Container,
  EmptyState,
  Flex,
  Grid,
  Heading,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react"
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { FiGlobe, FiUsers } from "react-icons/fi"
import { z } from "zod"

import { CommunitiesService } from "@/client"
import ConfirmationModal from "@/components/Common/ConfirmationModal"
import AddCommunity from "@/components/Communities/AddCommunity"
import CommunityCard from "@/components/Communities/CommunityCard"
import type { CommunityPublicExtended } from "@/customTypes"
import useCustomToast from "@/hooks/useCustomToast"

const communitiesSearchSchema = z.object({
  page: z.number().catch(1),
})

const PER_PAGE = 12

export const Route = createFileRoute("/_layout/communities")({
  component: Communities,
  validateSearch: (search) => communitiesSearchSchema.parse(search),
})

function CommunitySection({
  title,
  communities,
  onJoinRequest,
  onDisbandRequest,
}: {
  title: string
  communities: CommunityPublicExtended[]
  onJoinRequest: (c: CommunityPublicExtended) => void
  onDisbandRequest: (c: CommunityPublicExtended) => void
}) {
  if (communities.length === 0) return null
  return (
    <VStack align="stretch" gap={4}>
      <Heading size="sm" color="fg.muted">
        {title}
      </Heading>
      <Grid templateColumns="repeat(auto-fill, minmax(300px, 1fr))" gap={6}>
        {communities.map((community) => (
          <CommunityCard
            key={community.id}
            community={community}
            onJoinRequest={onJoinRequest}
            onDisbandRequest={onDisbandRequest}
          />
        ))}
      </Grid>
    </VStack>
  )
}

function Communities() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [selectedCommunityForJoin, setSelectedCommunityForJoin] =
    useState<CommunityPublicExtended | null>(null)
  const [selectedCommunityForDisband, setSelectedCommunityForDisband] =
    useState<CommunityPublicExtended | null>(null)

  // My communities (member_only=true)
  const {
    data: myData,
    isLoading: myLoading,
    fetchNextPage: myFetchNext,
    hasNextPage: myHasNext,
    isFetchingNextPage: myFetchingNext,
  } = useInfiniteQuery({
    queryKey: ["communitiesInfinite"],
    queryFn: ({ pageParam = 0 }) =>
      CommunitiesService.readCommunities({
        memberOnly: true,
        skip: pageParam as number,
        limit: PER_PAGE,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.length * PER_PAGE
      return loadedCount < lastPage.count ? loadedCount : undefined
    },
    initialPageParam: 0,
  })

  // Browse all public communities (member_only=false)
  const {
    data: browseData,
    isLoading: browseLoading,
    fetchNextPage: browseFetchNext,
    hasNextPage: browseHasNext,
    isFetchingNextPage: browseFetchingNext,
  } = useInfiniteQuery({
    queryKey: ["browseCommunitiesInfinite"],
    queryFn: ({ pageParam = 0 }) =>
      CommunitiesService.readCommunities({
        browse: true,
        skip: pageParam as number,
        limit: PER_PAGE,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.length * PER_PAGE
      return loadedCount < lastPage.count ? loadedCount : undefined
    },
    initialPageParam: 0,
  })

  const joinMutation = useMutation({
    mutationFn: (id: string) => CommunitiesService.joinCommunity({ id }),
    onSuccess: () => {
      showSuccessToast("Application sent to admins!")
      setSelectedCommunityForJoin(null)
      queryClient.invalidateQueries({ queryKey: ["communitiesInfinite"] })
      queryClient.invalidateQueries({ queryKey: ["browseCommunitiesInfinite"] })
    },
    onError: () => showErrorToast("Failed to join community"),
  })

  const disbandMutation = useMutation({
    mutationFn: (id: string) => CommunitiesService.deleteCommunity({ id }),
    onSuccess: () => {
      showSuccessToast("Community disbanded")
      setSelectedCommunityForDisband(null)
      queryClient.invalidateQueries({ queryKey: ["communitiesInfinite"] })
      queryClient.invalidateQueries({ queryKey: ["browseCommunitiesInfinite"] })
    },
    onError: () => showErrorToast("Failed to disband community"),
  })

  const allMyCommunities =
    (myData?.pages.flatMap((p) => p.data) as CommunityPublicExtended[]) || []
  const myTotalCount = myData?.pages[0]?.count || 0

  const allBrowseCommunities =
    (browseData?.pages.flatMap((p) => p.data) as CommunityPublicExtended[]) ||
    []
  const browseTotalCount = browseData?.pages[0]?.count || 0

  // Split my communities into sections
  const favorites = allMyCommunities.filter((c) => c.is_favorited)
  const managedByMe = allMyCommunities.filter(
    (c) => c.current_user_role === "ADMIN",
  )
  const otherJoined = allMyCommunities.filter(
    (c) => !c.is_favorited && c.current_user_role !== "ADMIN",
  )

  return (
    <Container maxW="full">
      <Flex pt={12} justify="space-between" align="center">
        <Heading size="lg">Communities</Heading>
        <AddCommunity />
      </Flex>

      <Tabs.Root defaultValue="mine" mt={6}>
        <Tabs.List>
          <Tabs.Trigger value="mine">
            <FiUsers />
            My Communities
          </Tabs.Trigger>
          <Tabs.Trigger value="browse">
            <FiGlobe />
            Browse
          </Tabs.Trigger>
        </Tabs.List>

        {/* My Communities tab */}
        <Tabs.Content value="mine">
          {myLoading ? (
            <Text mt={6}>Loading...</Text>
          ) : allMyCommunities.length === 0 ? (
            <EmptyState.Root mt={6}>
              <EmptyState.Content>
                <EmptyState.Indicator>
                  <FiUsers />
                </EmptyState.Indicator>
                <VStack textAlign="center">
                  <EmptyState.Title>No communities yet</EmptyState.Title>
                  <EmptyState.Description>
                    Join or create a community to get started!
                  </EmptyState.Description>
                </VStack>
              </EmptyState.Content>
            </EmptyState.Root>
          ) : (
            <VStack align="stretch" gap={10} mt={6}>
              <CommunitySection
                title="Favorites"
                communities={favorites}
                onJoinRequest={setSelectedCommunityForJoin}
                onDisbandRequest={setSelectedCommunityForDisband}
              />
              <CommunitySection
                title="Managed by Me"
                communities={managedByMe}
                onJoinRequest={setSelectedCommunityForJoin}
                onDisbandRequest={setSelectedCommunityForDisband}
              />
              <CommunitySection
                title="Joined"
                communities={otherJoined}
                onJoinRequest={setSelectedCommunityForJoin}
                onDisbandRequest={setSelectedCommunityForDisband}
              />

              {myHasNext && (
                <Flex justify="center" mb={4}>
                  <Button
                    variant="ghost"
                    colorPalette="accent"
                    onClick={() => myFetchNext()}
                    loading={myFetchingNext}
                  >
                    Load More (Showing {allMyCommunities.length} of{" "}
                    {myTotalCount})
                  </Button>
                </Flex>
              )}
            </VStack>
          )}
        </Tabs.Content>

        {/* Browse tab */}
        <Tabs.Content value="browse">
          {browseLoading ? (
            <Text mt={6}>Loading...</Text>
          ) : allBrowseCommunities.length === 0 ? (
            <EmptyState.Root mt={6}>
              <EmptyState.Content>
                <EmptyState.Indicator>
                  <FiGlobe />
                </EmptyState.Indicator>
                <VStack textAlign="center">
                  <EmptyState.Title>No communities found</EmptyState.Title>
                  <EmptyState.Description>
                    Create one to get started!
                  </EmptyState.Description>
                </VStack>
              </EmptyState.Content>
            </EmptyState.Root>
          ) : (
            <VStack align="stretch" gap={8} mt={6}>
              <Grid
                templateColumns="repeat(auto-fill, minmax(300px, 1fr))"
                gap={6}
              >
                {allBrowseCommunities.map((community) => (
                  <CommunityCard
                    key={community.id}
                    community={community}
                    onJoinRequest={setSelectedCommunityForJoin}
                    onDisbandRequest={setSelectedCommunityForDisband}
                  />
                ))}
              </Grid>

              {browseHasNext && (
                <Flex justify="center" mb={10}>
                  <Button
                    variant="ghost"
                    colorPalette="accent"
                    onClick={() => browseFetchNext()}
                    loading={browseFetchingNext}
                  >
                    Load More Communities (Showing {allBrowseCommunities.length}{" "}
                    of {browseTotalCount})
                  </Button>
                </Flex>
              )}
            </VStack>
          )}
        </Tabs.Content>
      </Tabs.Root>

      {selectedCommunityForJoin && (
        <ConfirmationModal
          isOpen={!!selectedCommunityForJoin}
          onClose={() => setSelectedCommunityForJoin(null)}
          onConfirm={() => joinMutation.mutate(selectedCommunityForJoin.id)}
          title="Apply to Join Community"
          message={`By applying to join ${selectedCommunityForJoin.name}, please be aware that your personal privacy settings will not apply within this community. All accepted members will be able to see your full profile details.`}
          isLoading={joinMutation.isPending}
        />
      )}

      {selectedCommunityForDisband && (
        <ConfirmationModal
          isOpen={!!selectedCommunityForDisband}
          onClose={() => setSelectedCommunityForDisband(null)}
          onConfirm={() =>
            disbandMutation.mutate(selectedCommunityForDisband.id)
          }
          title="Disband Community"
          message={`Are you sure you want to disband ${selectedCommunityForDisband.name}? This action is permanent and cannot be undone.`}
          isLoading={disbandMutation.isPending}
        />
      )}
    </Container>
  )
}
