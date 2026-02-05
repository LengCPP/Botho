import * as Client from "@/client"
import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import CommunityCard from "./CommunityCard"

// Mock hooks
vi.mock("@/hooks/useAuth", () => ({
  default: () => ({
    user: {
      id: "current-user-id",
      is_superuser: false,
    },
  }),
}))

vi.mock("@/hooks/useCustomToast", () => ({
  default: () => ({
    showSuccessToast: vi.fn(),
    showErrorToast: vi.fn(),
  }),
}))

// Mock Link
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}))

// Mock API services
vi.mock("@/client", async (importOriginal) => {
  const actual = await importOriginal<typeof Client>()
  return {
    ...actual,
    CommunitiesService: {
      ...actual.CommunitiesService,
      joinCommunity: vi.fn(),
      deleteCommunity: vi.fn(),
    },
  }
})

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <ChakraProvider value={defaultSystem}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ChakraProvider>
  )
}

describe("CommunityCard", () => {
  const mockCommunity = {
    id: "community-id",
    name: "Test Community",
    description: "A test community",
    created_by: "creator-id",
    requires_approval: false,
    is_private: false,
    current_user_status: null,
    current_user_role: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should render community name and description", () => {
    render(<CommunityCard community={mockCommunity as any} />, {
      wrapper: createWrapper(),
    })

    expect(screen.getByText("Test Community")).toBeInTheDocument()
    expect(screen.getByText("A test community")).toBeInTheDocument()
  })

  it("should show 'Join Community' when user is not a member", () => {
    render(<CommunityCard community={mockCommunity as any} />, {
      wrapper: createWrapper(),
    })

    expect(screen.getByText("Join Community")).toBeInTheDocument()
  })

  it("should show 'View Community' when user is a member", () => {
    const memberCommunity = {
      ...mockCommunity,
      current_user_status: "ACCEPTED",
    }
    render(<CommunityCard community={memberCommunity as any} />, {
      wrapper: createWrapper(),
    })

    expect(screen.getByText("View Community")).toBeInTheDocument()
  })

  it("should show 'Apply to Join' when community requires approval", () => {
    const closedCommunity = {
      ...mockCommunity,
      requires_approval: true,
    }
    render(<CommunityCard community={closedCommunity as any} />, {
      wrapper: createWrapper(),
    })

    expect(screen.getByText("Apply to Join")).toBeInTheDocument()
  })

  it("should call joinCommunity when Join button is clicked", async () => {
    vi.mocked(Client.CommunitiesService.joinCommunity).mockResolvedValue({
      message: "Joined successfully",
    } as any)

    render(<CommunityCard community={mockCommunity as any} />, {
      wrapper: createWrapper(),
    })

    fireEvent.click(screen.getByText("Join Community"))

    await waitFor(() => {
      expect(Client.CommunitiesService.joinCommunity).toHaveBeenCalledWith({
        id: "community-id",
      })
    })
  })

  it("should show admin actions if user is creator", () => {
    const adminCommunity = {
      ...mockCommunity,
      created_by: "current-user-id",
    }
    render(<CommunityCard community={adminCommunity as any} />, {
      wrapper: createWrapper(),
    })

    expect(screen.getByTitle("Disband Community")).toBeInTheDocument()
  })
})
