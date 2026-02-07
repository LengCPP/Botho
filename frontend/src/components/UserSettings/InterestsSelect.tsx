import {
  Badge,
  Box,
  Button,
  Flex,
  Icon,
  Input,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useState } from "react"
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
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const {
    data: interests = [],
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["interests", debouncedSearchTerm],
    queryFn: () => InterestsService.readInterests({ q: debouncedSearchTerm }),
    enabled: isOpen,
    placeholderData: keepPreviousData,
  })

  // Fetch all for mapping names (caching strategy)
  const { data: allInterests = [] } = useQuery({
    queryKey: ["interests-all"],
    queryFn: () => InterestsService.readInterests({ limit: 1000 }),
  })

  const createInterestMutation = useMutation({
    mutationFn: (name: string) =>
      InterestsService.createInterest({ requestBody: { name } }),
    onSuccess: (newInterest) => {
      showSuccessToast("Interest added!")
      if (!selectedIds.includes(newInterest.id)) {
        onChange([...selectedIds, newInterest.id])
      }
      setSearchTerm("")
      // Invalidate to refresh lists
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
    const term = searchTerm.trim()
    if (!term) return

    // Check if it's already in the *current* list as exact match to avoid duplicates
    const existing = interests.find(
      (i) => i.name.toLowerCase() === term.toLowerCase(),
    )
    if (existing) {
      handleSelect(existing)
    } else {
      createInterestMutation.mutate(term)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      // If there is exactly one match, select it? Or just create/select exact?
      // Prefer exact match, then create.
      handleCreate()
    }
  }

  const selectedInterestsDetails = allInterests.filter((i) =>
    selectedIds.includes(i.id),
  )

  // Determine if we should show the create button
  const showCreateOption =
    searchTerm.trim().length > 0 &&
    !interests.some(
      (i) => i.name.toLowerCase() === searchTerm.trim().toLowerCase(),
    )

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
        positioning={{ sameWidth: true, placement: "bottom-start" }}
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
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
        </PopoverTrigger>
        <PopoverContent width="auto" minW="300px" portalled={false}>
          <PopoverBody p={0}>
            {isLoading && !interests.length ? (
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
                      _dark={{
                        bg: isSelected ? "whiteAlpha.200" : "transparent",
                        _hover: {
                          bg: isSelected ? "whiteAlpha.200" : "whiteAlpha.100",
                        },
                      }}
                      opacity={isSelected ? 0.6 : 1}
                      onMouseDown={(e) => e.preventDefault()} // Prevent blur
                      onClick={() => !isSelected && handleSelect(interest)}
                    >
                      <Text fontSize="sm">{interest.name}</Text>
                    </Box>
                  )
                })}

                {showCreateOption && (
                  <Button
                    variant="ghost"
                    justifyContent="start"
                    width="full"
                    borderRadius={0}
                    height="auto"
                    py={2}
                    onMouseDown={(e) => e.preventDefault()} // Prevent blur
                    onClick={handleCreate}
                    loading={createInterestMutation.isPending}
                  >
                    <Icon as={FiPlus} mr={2} />
                    Create "{searchTerm}"
                  </Button>
                )}

                {interests.length === 0 && !showCreateOption && !isLoading && (
                  <Box p={4} textAlign="center">
                    <Text fontSize="sm" color="gray.500">
                      Type to add...
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
