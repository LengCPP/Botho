import {
  Container,
  Heading,
  Tabs,
  VStack,
} from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import ReadingLogTable from "@/components/ReadingLog/ReadingLogTable"

export const Route = createFileRoute("/_layout/reading-log")({
  component: ReadingLog,
})

function ReadingLog() {
  return (
    <Container maxW="full">
      <VStack pt={12} align="start" gap={6}>
        <Heading size="lg">My Reading Log</Heading>
        
        <Tabs.Root defaultValue="reading" variant="enclosed" width="full">
          <Tabs.List>
            <Tabs.Trigger value="reading">Currently Reading</Tabs.Trigger>
            <Tabs.Trigger value="completed">Completed</Tabs.Trigger>
            <Tabs.Trigger value="dropped">Dropped</Tabs.Trigger>
          </Tabs.List>
          
          <Tabs.Content value="reading">
            <ReadingLogTable status="READING" />
          </Tabs.Content>
          <Tabs.Content value="completed">
            <ReadingLogTable status="COMPLETED" />
          </Tabs.Content>
          <Tabs.Content value="dropped">
            <ReadingLogTable status="DROPPED" />
          </Tabs.Content>
        </Tabs.Root>
      </VStack>
    </Container>
  )
}
