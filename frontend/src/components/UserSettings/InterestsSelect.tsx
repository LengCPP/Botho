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
import { useEffect, useRef, useState } from "react"
import { FiPlus, FiX } from "react-icons/fi"

import { InterestsService } from "@/client"
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
  const wrapperRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const { data: interests = [], isLoading } = useQuery({
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
      handleCreate()
    }
  }

  const selectedInterestsDetails = allInterests.filter((i) =>
    selectedIds.includes(i.id),
  )

  const showCreateOption =
    searchTerm.trim().length > 0 &&
    !interests.some(
      (i) => i.name.toLowerCase() === searchTerm.trim().toLowerCase(),
    )

  return (
    <VStack align="stretch" gap={3} ref={wrapperRef}>
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

      <Box position="relative">
        <Input
          id="interests-search"
          name="interests-search"
          placeholder="Search or add interests..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            if (!isOpen) setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />

        {isOpen && (
          <Box
            position="absolute"
            top="100%"
            left={0}
            right={0}
            mt={1}
            bg="white"
            _dark={{ bg: "gray.800", borderColor: "gray.700" }}
            borderRadius="md"
            boxShadow="md"
            zIndex={1000}
            maxH="200px"
            overflowY="auto"
            borderWidth="1px"
            borderColor="gray.200"
          >
            {isLoading && !interests.length ? (
              <Box p={4} textAlign="center">
                <Spinner size="sm" />
              </Box>
            ) : (
              <VStack align="stretch" gap={0}>
                {showCreateOption && (
                  <Button
                    variant="ghost"
                    justifyContent="start"
                    width="full"
                    borderRadius={0}
                    height="auto"
                    py={2}
                    onClick={handleCreate}
                    loading={createInterestMutation.isPending}
                  >
                    <Icon as={FiPlus} mr={2} />
                    Create "{searchTerm}"
                  </Button>
                )}

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
                      onClick={() => !isSelected && handleSelect(interest)}
                    >
                      <Text fontSize="sm">{interest.name}</Text>
                    </Box>
                  )
                })}

                {interests.length === 0 && !showCreateOption && !isLoading && (
                  <Box p={4} textAlign="center">
                    <Text fontSize="sm" color="gray.500">
                      Type to add...
                    </Text>
                  </Box>
                )}
              </VStack>
            )}
          </Box>
        )}
      </Box>
    </VStack>
  )
}

export default InterestsSelect
