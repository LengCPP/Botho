import { Box, Heading, Text } from "@chakra-ui/react"

import DeleteConfirmation from "./DeleteConfirmation"

const DeleteAccount = () => {
  return (
    <Box width="full" px={2}>
      <Heading size="sm" py={4}>
        Delete Account
      </Heading>
      <Text mb={4}>
        Permanently delete your data and everything associated with your
        account.
      </Text>
      <DeleteConfirmation />
    </Box>
  )
}
export default DeleteAccount
