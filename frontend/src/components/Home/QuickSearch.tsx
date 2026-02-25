import { SearchService } from "@/client"
import { InputGroup } from "@/components/ui/input-group"
import useAuth from "@/hooks/useAuth"
import {
  Box,
  Flex,
  HStack,
  Heading,
  Icon,
  Input,
  Spinner,
  Stack,
  Text,
  IconButton,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { FiBook, FiSearch, FiUsers, FiX } from "react-icons/fi"

interface QuickSearchProps {
  placeholder?: string
}

export const QuickSearch = ({
  placeholder = "Quick Search...",
}: QuickSearchProps) => {
  const { user: currentUser } = useAuth()
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedTerm, setDebouncedTerm] = useState("")
  const [showResults, setShowResults] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const { data: results, isLoading } = useQuery({
    queryKey: ["quick-search", debouncedTerm],
    queryFn: () => SearchService.search({ q: debouncedTerm, limit: 5 }),
    enabled: debouncedTerm.length > 0,
  })

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const hasResults =
    results &&
    (results.users.length > 0 ||
      results.items.length > 0 ||
      results.communities.length > 0)

  return (
    <Box position="relative" width="100%" ref={containerRef} zIndex={100}>
      <InputGroup
        startElement={<FiSearch />}
        endElement={
          searchTerm && (
            <IconButton
              size="xs"
              variant="ghost"
              aria-label="Clear search"
              onClick={() => {
                setSearchTerm("")
                setShowResults(false)
              }}
            >
              <FiX />
            </IconButton>
          )
        }
        width="100%"
      >
        <Input
          id="quick-search-input"
          name="quick-search"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            setShowResults(true)
          }}
          onFocus={() => setShowResults(true)}
          variant="subtle"
          bg="bg.panel"
          _focus={{ bg: "bg.panel", borderColor: "ui.main" }}
        />
      </InputGroup>

      {showResults && debouncedTerm.length > 0 && (
        <Box
          position="absolute"
          top="100%"
          left={0}
          right={0}
          mt={2}
          bg="bg.panel"
          boxShadow="xl"
          borderRadius="lg"
          overflowY="auto"
          maxH="60vh"
          border="1px solid"
          borderColor="border.subtle"
        >
          {isLoading ? (
            <Flex p={6} justify="center" align="center" gap={3}>
              <Spinner size="sm" color="ui.main" />
              <Text color="fg.muted">Searching...</Text>
            </Flex>
          ) : !hasResults ? (
            <Box p={6} textAlign="center">
              <Text color="fg.muted">
                No results found for "{debouncedTerm}"
              </Text>
            </Box>
          ) : (
            <Stack gap={0}>
              {/* Users */}
              {results.users.length > 0 && (
                <Box p={4}>
                  <Heading
                    size="xs"
                    mb={3}
                    color="fg.muted"
                    textTransform="uppercase"
                    letterSpacing="wider"
                  >
                    Users
                  </Heading>
                  <Stack gap={2}>
                    {results.users.map((user) => (
                      <Link
                        key={user.id}
                        to="/users/$userId"
                        params={{ userId: user.id }}
                        onClick={() => setShowResults(false)}
                        style={{ textDecoration: "none" }}
                      >
                        <HStack
                          p={2}
                          _hover={{ bg: "bg.muted" }}
                          borderRadius="md"
                        >
                          {/* Simple User Row */}
                          <Box>
                            <Text fontWeight="medium">
                              {user.full_name || user.email}
                            </Text>
                            {user.profile?.alias && (
                              <Text fontSize="xs" color="fg.muted">
                                @{user.profile.alias}
                              </Text>
                            )}
                          </Box>
                        </HStack>
                      </Link>
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Items */}
              {results.items.length > 0 && (
                <>
                  <Box borderBottomWidth="1px" borderColor="border.subtle" />
                  <Box p={4}>
                    <Heading
                      size="xs"
                      mb={3}
                      color="fg.muted"
                      textTransform="uppercase"
                      letterSpacing="wider"
                    >
                      Items
                    </Heading>
                    <Stack gap={2}>
                      {results.items.map((item) => {
                        const primaryCommunity =
                          item.community_owner || item.communities?.[0]
                        const isOwner = item.owner_id === currentUser?.id

                        let to = "/items"
                        let params: any = {}
                        let search: any = { q: item.title }

                        if (primaryCommunity) {
                          to = "/communities/$communityId"
                          params = { communityId: primaryCommunity.id }
                          search = { tab: "items", q: item.title }
                        } else if (isOwner) {
                          to = "/items"
                          params = {}
                          search = { q: item.title }
                        } else {
                          to = "/users/$userId"
                          params = { userId: item.owner_id }
                          search = { q: item.title }
                        }

                        return (
                          <Link
                            key={item.id}
                            to={to}
                            params={params}
                            search={search}
                            onClick={() => setShowResults(false)}
                          >
                            <HStack
                              p={2}
                              _hover={{ bg: "bg.muted" }}
                              borderRadius="md"
                            >
                              <Icon as={FiBook} color="ui.main" />
                              <Box>
                                <Text fontWeight="medium" lineClamp={1}>
                                  {item.title}
                                </Text>
                                <Text
                                  fontSize="xs"
                                  color="fg.muted"
                                  lineClamp={1}
                                >
                                  by {item.author || "Unknown"}
                                  {item.community_owner
                                    ? ` (in ${item.community_owner.name})`
                                    : ""}
                                </Text>
                              </Box>
                            </HStack>
                          </Link>
                        )
                      })}
                    </Stack>
                  </Box>
                </>
              )}

              {/* Communities */}
              {results.communities.length > 0 && (
                <>
                  <Box borderBottomWidth="1px" borderColor="border.subtle" />
                  <Box p={4}>
                    <Heading
                      size="xs"
                      mb={3}
                      color="fg.muted"
                      textTransform="uppercase"
                      letterSpacing="wider"
                    >
                      Communities
                    </Heading>
                    <Stack gap={2}>
                      {results.communities.map((community) => (
                        <Link
                          key={community.id}
                          to="/communities/$communityId"
                          params={{ communityId: community.id }}
                          onClick={() => setShowResults(false)}
                        >
                          <HStack
                            p={2}
                            _hover={{ bg: "bg.muted" }}
                            borderRadius="md"
                          >
                            <Icon as={FiUsers} color="purple.500" />
                            <Text fontWeight="medium">{community.name}</Text>
                          </HStack>
                        </Link>
                      ))}
                    </Stack>
                  </Box>
                </>
              )}
            </Stack>
          )}
        </Box>
      )}
    </Box>
  )
}
