import {
  Button,
  Container,
  EmptyState,
  Flex,
  Grid,
  Heading,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { FiGlobe } from "react-icons/fi"
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

function Communities() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [selectedCommunityForJoin, setSelectedCommunityForJoin] = useState<CommunityPublicExtended | null>(null)
  const [selectedCommunityForDisband, setSelectedCommunityForDisband] = useState<CommunityPublicExtended | null>(null)

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
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

  const joinMutation = useMutation({
    mutationFn: (id: string) => CommunitiesService.joinCommunity({ id }),
    onSuccess: () => {
      showSuccessToast("Application sent to admins!")
      setSelectedCommunityForJoin(null)
      queryClient.invalidateQueries({ queryKey: ["communitiesInfinite"] })
    },
    onError: () => showErrorToast("Failed to join community"),
  })

  const disbandMutation = useMutation({
    mutationFn: (id: string) => CommunitiesService.deleteCommunity({ id }),
    onSuccess: () => {
      showSuccessToast("Community disbanded")
      setSelectedCommunityForDisband(null)
      queryClient.invalidateQueries({ queryKey: ["communitiesInfinite"] })
    },
    onError: () => showErrorToast("Failed to disband community"),
  })

  const allCommunities = data?.pages.flatMap((p) => p.data) || []
  const totalCount = data?.pages[0]?.count || 0

  return (
    <Container maxW="full">
      <Flex pt={12} justify="space-between" align="center">
        <Heading size="lg">Communities</Heading>
        <AddCommunity />
      </Flex>

      {isLoading ? (
        <Text mt={6}>Loading...</Text>
      ) : allCommunities.length === 0 ? (
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
          <Grid templateColumns="repeat(auto-fill, minmax(300px, 1fr))" gap={6}>
            {allCommunities.map((community) => (
              <CommunityCard 
                key={community.id} 
                community={community as CommunityPublicExtended} 
                onJoinRequest={setSelectedCommunityForJoin}
                onDisbandRequest={setSelectedCommunityForDisband}
              />
            ))}
          </Grid>

          {hasNextPage && (
            <Flex justify="center" mb={10}>
              <Button
                variant="ghost"
                colorPalette="accent"
                onClick={() => fetchNextPage()}
                loading={isFetchingNextPage}
              >
                Load More Communities (Showing {allCommunities.length} of{" "}
                {totalCount})
              </Button>
            </Flex>
          )}
        </VStack>
      )}

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
          onConfirm={() => disbandMutation.mutate(selectedCommunityForDisband.id)}
          title="Disband Community"
          message={`Are you sure you want to disband ${selectedCommunityForDisband.name}? This action is permanent and cannot be undone.`}
          isLoading={disbandMutation.isPending}
        />
      )}
    </Container>
  )
}
