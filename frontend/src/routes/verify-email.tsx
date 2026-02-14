import {
  Button,
  Container,
  Heading,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { z } from "zod"
import { type ApiError, LoginService, type Token } from "../client"

const verifyEmailSearchSchema = z.object({
  token: z.string(),
})

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmail,
  validateSearch: (search) => verifyEmailSearchSchema.parse(search),
})

function VerifyEmail() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (token: string) => LoginService.verifyEmail({ token }),
    onSuccess: (data: Token) => {
      localStorage.setItem("access_token", data.access_token)
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      navigate({ to: "/" })
    },
  })

  useEffect(() => {
    if (token) {
      mutation.mutate(token)
    }
  }, [token])

  let content

  if (mutation.isPending) {
    content = (
      <VStack gap={4}>
        <Spinner size="xl" color="accent.500" />
        <Text fontSize="lg">Verifying your email...</Text>
      </VStack>
    )
  } else if (mutation.isSuccess) {
    content = (
      <VStack gap={6}>
        <Heading size="xl" color="green.500">
          Verified!
        </Heading>
        <Text fontSize="lg">
          Your email has been successfully verified. You are being logged in...
        </Text>
      </VStack>
    )
  } else if (mutation.isError) {
    const error = mutation.error as ApiError
    const errDetail = (error.body as any)?.detail || "Verification failed."

    content = (
      <VStack gap={6}>
        <Heading size="xl" color="red.500">
          Verification Failed
        </Heading>
        <Text fontSize="lg" color="gray.500">
          {errDetail}
        </Text>
        <Text>The link might be invalid or expired.</Text>
        <Link to="/login">
          <Button variant="outline">Back to Login</Button>
        </Link>
      </VStack>
    )
  }

  return (
    <Container maxW="md" centerContent py={20}>
      {content}
    </Container>
  )
}
