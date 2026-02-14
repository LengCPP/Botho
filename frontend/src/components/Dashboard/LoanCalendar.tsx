import { LoansService } from "@/client"
import {
  Box,
  Flex,
  Grid,
  Heading,
  IconButton,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  isToday,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns"
import { useState } from "react"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"

export const LoanCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date())

  const { data: loansData, isLoading } = useQuery({
    queryKey: ["loans", "outgoing"],
    queryFn: () => LoansService.readOutgoingLoanRequests({ limit: 100 }),
  })

  // Filter for active loans
  const activeLoans =
    (loansData as any)?.data.filter((loan: any) =>
      ["ACTIVE", "RETURN_PENDING"].includes(loan.status),
    ) || []

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1))
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1))

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)

  // Create grid days (padding for start of week)
  const startDayOfWeek = getDay(monthStart) // 0 (Sun) - 6 (Sat)
  const emptyDays = Array.from({ length: startDayOfWeek })

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const getLoansForDate = (date: Date) => {
    return activeLoans.filter((loan: any) =>
      isSameDay(parseISO(loan.end_date), date),
    )
  }

  return (
    <Box
      bg="bg.panel"
      borderRadius="lg"
      border="1px solid"
      borderColor="border.subtle"
      overflow="hidden"
    >
      {/* Header */}
      <Flex
        p={4}
        justify="space-between"
        align="center"
        borderBottomWidth="1px"
        borderColor="border.subtle"
      >
        <Heading size="sm">{format(currentDate, "MMMM yyyy")}</Heading>
        <Flex gap={2}>
          <IconButton
            aria-label="Previous Month"
            size="xs"
            variant="ghost"
            onClick={prevMonth}
          >
            <FiChevronLeft />
          </IconButton>
          <IconButton
            aria-label="Next Month"
            size="xs"
            variant="ghost"
            onClick={nextMonth}
          >
            <FiChevronRight />
          </IconButton>
        </Flex>
      </Flex>

      {/* Days Header */}
      <Grid templateColumns="repeat(7, 1fr)" bg="bg.muted" py={2}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <Text
            key={day}
            textAlign="center"
            fontSize="xs"
            color="fg.muted"
            fontWeight="bold"
          >
            {day}
          </Text>
        ))}
      </Grid>

      {/* Calendar Grid */}
      <Grid templateColumns="repeat(7, 1fr)" autoRows="1fr">
        {emptyDays.map((_, i) => (
          <Box key={`empty-${i}`} p={2} />
        ))}

        {days.map((day) => {
          const loansDue = getLoansForDate(day)
          const hasLoans = loansDue.length > 0
          const isTodayDate = isToday(day)

          return (
            <Box
              key={day.toISOString()}
              p={2}
              minH="60px"
              borderTopWidth="1px"
              borderRightWidth="1px" // Simplified borders, might need adjustment
              borderColor="border.subtle"
              position="relative"
              bg={isTodayDate ? "blue.50" : "transparent"}
              _dark={{ bg: isTodayDate ? "blue.900" : "transparent" }}
            >
              <Text
                fontSize="xs"
                color={isTodayDate ? "blue.500" : "fg.subtle"}
                fontWeight={isTodayDate ? "bold" : "normal"}
              >
                {format(day, "d")}
              </Text>

              {hasLoans && (
                <PopoverRoot positioning={{ placement: "top" }}>
                  <PopoverTrigger asChild>
                    <Box
                      mt={1}
                      p={1}
                      bg="orange.100"
                      _dark={{ bg: "orange.800" }}
                      color="orange.700"
                      borderRadius="sm"
                      fontSize="2xs"
                      cursor="pointer"
                      textAlign="center"
                      overflow="hidden"
                      textOverflow="ellipsis"
                      whiteSpace="nowrap"
                    >
                      {loansDue.length} Due
                    </Box>
                  </PopoverTrigger>
                  <PopoverContent>
                    <PopoverArrow />
                    <PopoverBody fontSize="xs">
                      <Text fontWeight="bold" mb={2}>
                        Due on {format(day, "MMM d")}:
                      </Text>
                      <VStack align="start" gap={1}>
                        {loansDue.map((loan: any) => (
                          <Text key={loan.id} lineClamp={1}>
                            • {loan.item.title}
                          </Text>
                        ))}
                      </VStack>
                    </PopoverBody>
                  </PopoverContent>
                </PopoverRoot>
              )}
            </Box>
          )
        })}
      </Grid>

      {activeLoans.length === 0 && !isLoading && (
        <Box p={4} textAlign="center">
          <Text fontSize="xs" color="fg.muted">
            No active loans.
          </Text>
        </Box>
      )}
    </Box>
  )
}
