import {
  Badge,
  Box,
  Button,
  Flex,
  Icon,
  IconButton,
  Input,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FiPlus, FiX } from "react-icons/fi"

import { InterestsService } from "@/client"
import {
  PopoverBody,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from "@/components/ui/popover"
import useCustomToast from "@/hooks/useCustomToast"

interface Interest {
  id: string
  name: string
  category?: string | null
}

interface InterestsSelectProps {
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

const InterestsSelect = ({ selectedIds, onChange }: InterestsSelectProps) => {
  const [searchTerm, setSearchTerm] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()

  const { data: interests = [], isLoading } = useQuery({
    queryKey: ["interests", searchTerm],
    queryFn: () => InterestsService.readInterests({ q: searchTerm }),
    enabled: isOpen,
  })

  // Fetch full details of selected interests to display them
  // We can optimize this by maintaining a local cache or passing full objects
  // But for now, let's fetch all interests initially or assume we have them.
  // Actually, readInterests returns filtered list.
  // Let's rely on a separate query for ALL known interests to map IDs to names?
  // Or just use the ones we have.
  // Better: Fetch details for selectedIds. But backend doesn't support bulk get by IDs.
  // Workaround: We'll assume the parent component might pass initial data or we fetch all.
  // Let's just fetch all interests once for mapping.
  const { data: allInterests = [] } = useQuery({
    queryKey: ["interests-all"],
    queryFn: () => InterestsService.readInterests({ limit: 1000 }),
  })

  const createInterestMutation = useMutation({
    mutationFn: (name: string) =>
      InterestsService.createInterest({ requestBody: { name } }),
    onSuccess: (newInterest) => {
      showSuccessToast("Interest added!")
      onChange([...selectedIds, newInterest.id])
      setSearchTerm("")
      queryClient.invalidateQueries({ queryKey: ["interests"] })
      queryClient.invalidateQueries({ queryKey: ["interests-all"] })
    },
  })

  const handleSelect = (interest: Interest) => {
    if (!selectedIds.includes(interest.id)) {
      onChange([...selectedIds, interest.id])
    }
    setSearchTerm("")
  }

  const handleRemove = (id: string) => {
    onChange(selectedIds.filter((i) => i !== id))
  }

  const handleCreate = () => {
    if (searchTerm.trim()) {
      createInterestMutation.mutate(searchTerm.trim())
    }
  }

  const selectedInterestsDetails = allInterests.filter((i) =>
    selectedIds.includes(i.id),
  )

  // Merge selected with searched to ensure we can display them if searched
  // But strictly we rely on allInterests for display.

  return (
    <VStack align="stretch" gap={3}>
      <Flex wrap="wrap" gap={2}>
        {selectedInterestsDetails.map((interest) => (
          <Badge
            key={interest.id}
            size="lg"
            variant="solid"
            colorPalette="teal"
            display="flex"
            alignItems="center"
            gap={1}
            px={2}
            py={1}
          >
            {interest.name}
            <Icon
              as={FiX}
              cursor="pointer"
              onClick={() => handleRemove(interest.id)}
            />
          </Badge>
        ))}
      </Flex>

      <PopoverRoot
        open={isOpen}
        onOpenChange={(e) => setIsOpen(e.open)}
        positioning={{ sameWidth: true }}
      >
        <PopoverTrigger asChild>
          <Input
            placeholder="Search or add interests..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              if (!isOpen) setIsOpen(true)
            }}
            onClick={() => setIsOpen(true)}
          />
        </PopoverTrigger>
        <PopoverContent width="auto" minW="300px">
          <PopoverBody p={0}>
            {isLoading ? (
              <Box p={4} textAlign="center">
                <Spinner size="sm" />
              </Box>
            ) : (
              <VStack align="stretch" gap={0} maxH="200px" overflowY="auto">
                {interests.map((interest) => {
                  const isSelected = selectedIds.includes(interest.id)
                  return (
                    <Box
                      key={interest.id}
                      p={2}
                      cursor={isSelected ? "default" : "pointer"}
                      bg={isSelected ? "gray.100" : "transparent"}
                      _hover={{ bg: isSelected ? "gray.100" : "gray.50" }}
                      opacity={isSelected ? 0.6 : 1}
                      onClick={() => !isSelected && handleSelect(interest)}
                    >
                      <Text fontSize="sm">{interest.name}</Text>
                    </Box>
                  )
                })}
                {searchTerm &&
                  !interests.some(
                    (i) =>
                      i.name.toLowerCase() === searchTerm.trim().toLowerCase(),
                  ) && (
                    <Button
                      variant="ghost"
                      justifyContent="start"
                      width="full"
                      borderRadius={0}
                      onClick={handleCreate}
                      loading={createInterestMutation.isPending}
                    >
                      <Icon as={FiPlus} mr={2} />
                      Create "{searchTerm}"
                    </Button>
                  )}
                {interests.length === 0 && !searchTerm && (
                  <Box p={4} textAlign="center">
                    <Text fontSize="sm" color="gray.500">
                      Type to search...
                    </Text>
                  </Box>
                )}
              </VStack>
            )}
          </PopoverBody>
        </PopoverContent>
      </PopoverRoot>
    </VStack>
  )
}

export default InterestsSelect
