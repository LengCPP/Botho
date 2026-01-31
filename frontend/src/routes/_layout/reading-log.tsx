import { Container, Heading, Tabs, Text } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"

import ReadingLogTable from "@/components/ReadingLog/ReadingLogTable"

export const Route = createFileRoute("/_layout/reading-log")({
  component: ReadingLog,
})

function ReadingLog() {
  return (
    <Container maxW="full">
      <Heading size="lg" mb={2}>
        Reading Log
      </Heading>
      <Text color="gray.500" mb={6}>
        Track your reading progress.
      </Text>

      <Tabs.Root defaultValue={"READING"} variant="enclosed">
        <Tabs.List>
          <Tabs.Trigger value={"READING"}>
            Currently Reading
          </Tabs.Trigger>
          <Tabs.Trigger value={"COMPLETED"}>
            Completed
          </Tabs.Trigger>
          <Tabs.Trigger value={"DROPPED"}>Dropped</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value={"READING"}>
          <ReadingLogTable status={"READING"} />
        </Tabs.Content>
        <Tabs.Content value={"COMPLETED"}>
          <ReadingLogTable status={"COMPLETED"} />
        </Tabs.Content>
        <Tabs.Content value={"DROPPED"}>
          <ReadingLogTable status={"DROPPED"} />
        </Tabs.Content>
      </Tabs.Root>
    </Container>
  )
}
