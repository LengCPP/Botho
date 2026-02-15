import { Box, Button, Flex, Text } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { FiAlertCircle, FiClock } from "react-icons/fi"

import { LoansService } from "@/client"

const DISMISS_INTERVAL = 2 * 60 * 60 * 1000 // 2 hours

export const LoanReminderBanner = () => {
  const navigate = useNavigate()
  const [isDismissed, setIsDismissed] = useState(true)
  const [reminderType, setReminderType] = useState<"due_today" | "overdue" | null>(
    null,
  )

  const { data: outgoingLoans } = useQuery({
    queryKey: ["loans", "outgoing", "reminder"],
    queryFn: () => LoansService.readOutgoingLoanRequests({}),
    refetchInterval: 30000, // Re-check loans every 30 seconds
  })

  useEffect(() => {
    if (!outgoingLoans) return

    const now = new Date()
    const activeLoans = outgoingLoans.data.filter(
      (l) =>
        l.status === "ACTIVE" ||
        l.status === "RETURN_PENDING" ||
        l.status === "EXTENSION_PENDING",
    )

    let type: "due_today" | "overdue" | null = null

    for (const loan of activeLoans) {
      const dueDate = new Date(loan.end_date)
      if (dueDate < now) {
        type = "overdue"
        break // Overdue takes priority
      }
      
      // Check if due today
      if (
        dueDate.getDate() === now.getDate() &&
        dueDate.getMonth() === now.getMonth() &&
        dueDate.getFullYear() === now.getFullYear()
      ) {
        type = "due_today"
      }
    }

    setReminderType(type)
  }, [outgoingLoans])

  useEffect(() => {
    const checkDismissal = () => {
      const dismissedAt = localStorage.getItem("loan_reminder_dismissed_at")
      if (!dismissedAt) {
        setIsDismissed(false)
        return
      }

      const lastDismissed = parseInt(dismissedAt, 10)
      if (Date.now() - lastDismissed > DISMISS_INTERVAL) {
        setIsDismissed(false)
      } else {
        setIsDismissed(true)
      }
    }

    checkDismissal()
    const interval = setInterval(checkDismissal, 10000) // Check dismissal state every 10 seconds
    return () => clearInterval(interval)
  }, [])

  const handleDismiss = () => {
    localStorage.setItem("loan_reminder_dismissed_at", Date.now().toString())
    setIsDismissed(true)
  }

  const handleShow = () => {
    navigate({ to: "/loans" })
  }

  if (isDismissed || !reminderType) return null

  const isOverdue = reminderType === "overdue"

  return (
    <Box
      bg={isOverdue ? "red.500" : "orange.500"}
      color="white"
      py={2}
      px={4}
      position="sticky"
      top="52px"
      zIndex="docked"
      boxShadow="md"
    >
      <Flex
        maxW="container.xl"
        mx="auto"
        align="center"
        justify="space-between"
        gap={4}
        direction={{ base: "column", sm: "row" }}
      >
        <Flex align="center" gap={2}>
          {isOverdue ? <FiAlertCircle /> : <FiClock />}
          <Text fontWeight="medium" fontSize="sm">
            {isOverdue
              ? "You have overdue loans that need your attention!"
              : "You have loans due today. Please return or extend them."}
          </Text>
        </Flex>
        <Flex gap={2}>
          <Button
            size="xs"
            variant="subtle"
            bg="whiteAlpha.300"
            color="white"
            _hover={{ bg: "whiteAlpha.400" }}
            onClick={handleShow}
          >
            Show
          </Button>
          <Button
            size="xs"
            variant="ghost"
            color="white"
            _hover={{ bg: "whiteAlpha.200" }}
            onClick={handleDismiss}
          >
            Dismiss
          </Button>
        </Flex>
      </Flex>
    </Box>
  )
}
