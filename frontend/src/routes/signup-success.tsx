import { Button, Container, Heading, Text, VStack } from "@chakra-ui/react"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { z } from "zod"
import { LoginService } from "../client"
import useCustomToast from "../hooks/useCustomToast"

const signupSuccessSearchSchema = z.object({
  email: z.string().optional(),
})

export const Route = createFileRoute("/signup-success")({
  component: SignupSuccess,
  validateSearch: (search) => signupSuccessSearchSchema.parse(search),
})

function SignupSuccess() {
  const { email } = Route.useSearch()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (cooldown > 0) {
      interval = setInterval(() => {
        setCooldown((prev) => prev - 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [cooldown])

  const mutation = useMutation({
    mutationFn: (email: string) =>
      LoginService.resendVerificationEmail({ email }),
    onSuccess: () => {
      showSuccessToast("Verification email resent successfully.")
      setCooldown(60)
    },
    onError: (err: any) => {
      const errDetail = err.body?.detail || "Something went wrong"
      showErrorToast(errDetail)
    },
  })

  const handleResend = () => {
    if (email) {
      mutation.mutate(email)
    }
  }

  return (
    <Container maxW="md" centerContent py={12}>
      <VStack gap={6} align="center" textAlign="center">
        <Heading size="xl">Check your email</Heading>
        <Text fontSize="lg">
          We've sent a verification link to <strong>{email}</strong>.
        </Text>
        <Text color="gray.500">
          Please click the link in the email to verify your account. The link
          will expire in 3 minutes.
        </Text>

        <Button
          colorPalette="accent"
          onClick={handleResend}
          loading={mutation.isPending}
          disabled={cooldown > 0 || !email}
          width="full"
        >
          {cooldown > 0
            ? `Resend in ${cooldown}s`
            : "Resend Verification Email"}
        </Button>
      </VStack>
    </Container>
  )
}

export default SignupSuccess
